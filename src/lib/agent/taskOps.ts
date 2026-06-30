// Capa ÚNICA de operaciones del asistente. La usan tanto el router determinista
// como la IA (fallback). Service role + scopeado por userId. Refleja la jerarquía
// real: proyectos (con subproyectos) → módulos (funnel_nodes) → tareas (node_tasks).
import type { SupabaseClient } from "@supabase/supabase-js";

export const PRIORITY_MAP: Record<string, string> = {
  baja: "low", media: "normal", normal: "normal", alta: "high", urgente: "urgent", urgent: "urgent",
  low: "low", high: "high",
};
export const PRIORITY_LABEL: Record<string, string> = {
  low: "Baja", normal: "Normal", high: "Alta", urgent: "Urgente",
};
const INBOX_NAME = "📥 Bandeja de entrada";

function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function norm(s: string) { return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim(); }

export interface ProjectRow { id: string; name: string; parent_project_id: string | null; status: string; }
export interface ModuleRow { id: string; title: string; role: string; icon: string; project_id: string; }
export interface TaskRow {
  id: string; text: string; done: boolean; due_date: string | null;
  priority: string; project: string | null; module: string | null; overdue: boolean;
}

/* Proyectos accesibles por el usuario (dueño o miembro). */
export async function accessibleProjects(sb: SupabaseClient, userId: string): Promise<ProjectRow[]> {
  const [{ data: owned }, { data: memberRows }] = await Promise.all([
    sb.from("projects").select("id, name, parent_project_id, status").eq("user_id", userId),
    sb.from("project_members").select("project_id").eq("user_id", userId),
  ]);
  const ids = new Set((owned ?? []).map((p: any) => p.id));
  const result: ProjectRow[] = [...(owned ?? [])] as any;
  const memberIds = (memberRows ?? []).map((m: any) => m.project_id).filter((id: string) => !ids.has(id));
  if (memberIds.length) {
    const { data: extra } = await sb.from("projects")
      .select("id, name, parent_project_id, status").in("id", memberIds);
    for (const p of (extra ?? [])) result.push(p as any);
  }
  return result;
}

function matchProject(projects: ProjectRow[], query?: string): ProjectRow | null {
  if (!query) return null;
  const q = norm(query);
  return projects.find((p) => norm(p.name) === q)
    ?? projects.find((p) => norm(p.name).includes(q))
    ?? null;
}

export async function listProjects(sb: SupabaseClient, userId: string): Promise<ProjectRow[]> {
  const projs = await accessibleProjects(sb, userId);
  // ordena: raíz primero, subproyectos después de su padre
  const roots = projs.filter((p) => !p.parent_project_id);
  const out: ProjectRow[] = [];
  for (const r of roots) {
    out.push(r);
    out.push(...projs.filter((p) => p.parent_project_id === r.id));
  }
  // huérfanos (padre no accesible)
  for (const p of projs) if (p.parent_project_id && !out.includes(p)) out.push(p);
  return out;
}

export async function listModules(sb: SupabaseClient, userId: string, projectName?: string): Promise<{ project: ProjectRow | null; modules: ModuleRow[] }> {
  const projs = await accessibleProjects(sb, userId);
  const project = matchProject(projs, projectName) ?? projs.find((p) => !p.parent_project_id) ?? projs[0] ?? null;
  if (!project) return { project: null, modules: [] };
  const { data } = await sb.from("funnel_nodes")
    .select("id, title, role, icon, project_id").eq("project_id", project.id).order("position_x");
  return { project, modules: (data ?? []) as any };
}

/* Bandeja de entrada personal (se crea si no existe). */
export async function getInbox(sb: SupabaseClient, userId: string): Promise<{ projectId: string; nodeId: string } | { error: string }> {
  let { data: proj } = await sb.from("projects")
    .select("id").eq("user_id", userId).eq("name", INBOX_NAME).limit(1).maybeSingle();
  if (!proj) {
    const { data: created, error } = await sb.from("projects")
      .insert({ user_id: userId, name: INBOX_NAME, status: "active" }).select("id").single();
    if (error || !created) return { error: error?.message ?? "no se pudo crear la bandeja" };
    proj = created;
  }
  let { data: node } = await sb.from("funnel_nodes")
    .select("id").eq("project_id", proj.id).order("position_x").limit(1).maybeSingle();
  if (!node) {
    const nodeId = `node-${uid()}`;
    const { error } = await sb.from("funnel_nodes").insert({
      id: nodeId, project_id: proj.id, title: "Pendientes", subtitle: "Asistente",
      role: "pm", icon: "📋", position_x: 80, position_y: 160,
    });
    if (error) return { error: error.message };
    return { projectId: proj.id, nodeId };
  }
  return { projectId: proj.id, nodeId: node.id };
}

function mapTask(t: any, today: string): TaskRow {
  return {
    id: t.id, text: t.text, done: !!t.done, due_date: t.due_date ?? null,
    priority: t.priority ?? "normal",
    project: Array.isArray(t.projects) ? t.projects[0]?.name : t.projects?.name ?? null,
    module: Array.isArray(t.funnel_nodes) ? t.funnel_nodes[0]?.title : t.funnel_nodes?.title ?? null,
    overdue: !!(t.due_date && t.due_date < today && !t.done),
  };
}

export type Scope = "hoy" | "manana" | "semana" | "vencidas" | "pendientes" | "todas";

export async function listTasks(
  sb: SupabaseClient, userId: string,
  opts: { scope: Scope; projectName?: string; moduleName?: string },
): Promise<TaskRow[]> {
  const today = todayStr();
  let q = sb.from("node_tasks")
    .select("id, text, done, due_date, priority, node_id, project_id, projects(name), funnel_nodes(title)")
    .eq("assigned_to", userId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(200);
  if (opts.scope !== "todas") q = q.eq("done", false);

  // filtro por proyecto / módulo
  if (opts.projectName) {
    const projs = await accessibleProjects(sb, userId);
    const p = matchProject(projs, opts.projectName);
    if (p) q = q.eq("project_id", p.id);
  }
  const { data } = await q;
  let rows = (data ?? []).map((t: any) => mapTask(t, today));

  if (opts.moduleName) {
    const mq = norm(opts.moduleName);
    rows = rows.filter((r) => r.module && norm(r.module).includes(mq));
  }

  const d = new Date(); const week = new Date(d); week.setDate(week.getDate() + 7);
  const weekStr = `${week.getFullYear()}-${String(week.getMonth() + 1).padStart(2, "0")}-${String(week.getDate()).padStart(2, "0")}`;
  if (opts.scope === "hoy")        rows = rows.filter((r) => r.due_date === today);
  else if (opts.scope === "manana") { const t = new Date(d); t.setDate(t.getDate() + 1); const ts = `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`; rows = rows.filter((r) => r.due_date === ts); }
  else if (opts.scope === "vencidas") rows = rows.filter((r) => r.overdue);
  else if (opts.scope === "semana")   rows = rows.filter((r) => r.due_date && r.due_date >= today && r.due_date <= weekStr);
  return rows;
}

/* Cuántas tareas completó el usuario en un rango (para el resumen de la noche). */
export async function countCompletedBetween(
  sb: SupabaseClient, userId: string, startIso: string, endIso: string,
): Promise<number> {
  const { count } = await sb.from("node_tasks")
    .select("id", { count: "exact", head: true })
    .eq("assigned_to", userId).eq("done", true)
    .gte("completed_at", startIso).lt("completed_at", endIso);
  return count ?? 0;
}

export async function createTask(
  sb: SupabaseClient, userId: string,
  args: { titulo: string; fecha?: string | null; prioridad?: string; projectName?: string; moduleName?: string },
): Promise<{ ok: true; task: TaskRow } | { error: string }> {
  const titulo = (args.titulo || "").trim();
  if (!titulo) return { error: "Falta el título de la tarea." };

  // Resolver módulo destino
  let nodeId: string | null = null;
  if (args.projectName) {
    const projs = await accessibleProjects(sb, userId);
    const p = matchProject(projs, args.projectName);
    if (!p) return { error: `No encontré el proyecto "${args.projectName}".` };
    const { data: nodes } = await sb.from("funnel_nodes").select("id, title").eq("project_id", p.id).order("position_x");
    if (args.moduleName && nodes?.length) {
      const mq = norm(args.moduleName);
      nodeId = (nodes.find((n: any) => norm(n.title).includes(mq)) ?? nodes[0]).id;
    } else if (nodes?.length) {
      nodeId = nodes[0].id;
    } else {
      // proyecto sin módulos → crear uno
      const newNode = `node-${uid()}`;
      await sb.from("funnel_nodes").insert({ id: newNode, project_id: p.id, title: "Pendientes", role: "pm", icon: "📋", position_x: 80, position_y: 160 });
      nodeId = newNode;
    }
  } else {
    const inbox = await getInbox(sb, userId);
    if ("error" in inbox) return { error: inbox.error };
    nodeId = inbox.nodeId;
  }

  const prioridad = PRIORITY_MAP[norm(args.prioridad ?? "")] ?? "normal";
  const due = /^\d{4}-\d{2}-\d{2}$/.test(args.fecha ?? "") ? args.fecha : null;
  const { data: existing } = await sb.from("node_tasks").select("ord").eq("node_id", nodeId);
  const ord = (existing ?? []).length;

  const id = `t-${uid()}`;
  const { error } = await sb.from("node_tasks").insert({
    id, node_id: nodeId, text: titulo.slice(0, 300), done: false, ord,
    priority: prioridad, due_date: due, assigned_to: userId, description: "",
  });
  if (error) return { error: error.message };
  const today = todayStr();
  return { ok: true, task: { id, text: titulo, done: false, due_date: due ?? null, priority: prioridad, project: null, module: null, overdue: false } };
}

/* Tokeniza ignorando palabras vacías; conserva números (ej. "7"). */
const STOPWORDS = new Set([
  "la","el","los","las","un","una","unos","unas","de","del","y","o","a","al","en","con","para",
  "que","como","mi","mis","su","sus","tarea","tareas","por","lo","le","se","es",
]);
function refTokens(s: string): string[] {
  return norm(s).split(/[^a-z0-9]+/).filter((w) => (w.length >= 2 || /^\d+$/.test(w)) && !STOPWORDS.has(w));
}
/* Puntúa cuántos tokens de la consulta aparecen en el texto de la tarea. */
function matchScore(qToks: string[], text: string): number {
  const tt = norm(text);
  const twords = tt.split(/[^a-z0-9]+/).filter(Boolean);
  let hit = 0;
  for (const q of qToks) {
    if (tt.includes(q)) { hit += 2; continue; }
    // prefijo común (filtrar/filtra, automatiza/automatización…)
    if (twords.some((w) => w.length >= 4 && q.length >= 4 && (w.startsWith(q.slice(0, 4)) || q.startsWith(w.slice(0, 4))))) hit += 1;
  }
  return hit;
}

/* Busca una tarea del usuario por texto aproximado (por tokens, tolerante). */
async function findUserTask(sb: SupabaseClient, userId: string, ref: string, done: boolean) {
  const q = (ref || "").trim();
  const qToks = refTokens(q);
  if (!q || !qToks.length) return { error: "Indica a qué tarea te refieres." };

  const { data } = await sb.from("node_tasks")
    .select("id, text").eq("assigned_to", userId).eq("done", done).limit(300);
  const rows = (data ?? []) as { id: string; text: string }[];
  if (!rows.length) return { error: `No tienes tareas ${done ? "completadas" : "pendientes"}.` };

  const scored = rows
    .map((r) => ({ r, s: matchScore(qToks, r.text) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);

  if (!scored.length) {
    return { error: `No encontré ninguna tarea ${done ? "completada" : "pendiente"} que coincida con "${q}".` };
  }

  // exige cubrir al menos ~60% de los tokens (mínimo 1 token fuerte)
  const maxScore = qToks.length * 2;
  const threshold = Math.max(2, Math.ceil(maxScore * 0.6));
  const best = scored[0].s;
  if (best < threshold) {
    const tops = scored.slice(0, 6).map((x) => x.r.text);
    if (tops.length === 1) return { task: scored[0].r };
    return { ambiguous: tops };
  }

  const top = scored.filter((x) => x.s === best);
  if (top.length === 1) return { task: top[0].r };
  return { ambiguous: top.slice(0, 6).map((x) => x.r.text) };
}

export async function completeTask(sb: SupabaseClient, userId: string, ref: string): Promise<{ ok: true; text: string } | { error: string } | { ambiguous: string[] }> {
  const r = await findUserTask(sb, userId, ref, false);
  if ("error" in r || "ambiguous" in r) return r as any;
  const { error } = await sb.from("node_tasks").update({ done: true }).eq("id", r.task.id);
  if (error) return { error: error.message };
  return { ok: true, text: r.task.text };
}

export async function reopenTask(sb: SupabaseClient, userId: string, ref: string): Promise<{ ok: true; text: string } | { error: string } | { ambiguous: string[] }> {
  const r = await findUserTask(sb, userId, ref, true);
  if ("error" in r || "ambiguous" in r) return r as any;
  const { error } = await sb.from("node_tasks").update({ done: false }).eq("id", r.task.id);
  if (error) return { error: error.message };
  return { ok: true, text: r.task.text };
}

export async function rescheduleTask(sb: SupabaseClient, userId: string, ref: string, fecha: string): Promise<{ ok: true; text: string; fecha: string } | { error: string } | { ambiguous: string[] }> {
  const r = await findUserTask(sb, userId, ref, false);
  if ("error" in r || "ambiguous" in r) return r as any;
  const { error } = await sb.from("node_tasks").update({ due_date: fecha }).eq("id", r.task.id);
  if (error) return { error: error.message };
  return { ok: true, text: r.task.text, fecha };
}

export async function setPriority(sb: SupabaseClient, userId: string, ref: string, prioridad: string): Promise<{ ok: true; text: string; prioridad: string } | { error: string } | { ambiguous: string[] }> {
  const pr = PRIORITY_MAP[norm(prioridad)] ?? null;
  if (!pr) return { error: "Prioridad no válida (usa baja, normal, alta o urgente)." };
  const r = await findUserTask(sb, userId, ref, false);
  if ("error" in r || "ambiguous" in r) return r as any;
  const { error } = await sb.from("node_tasks").update({ priority: pr }).eq("id", r.task.id);
  if (error) return { error: error.message };
  return { ok: true, text: r.task.text, prioridad: pr };
}

/* Completar/posponer por id (para botones de Telegram). */
export async function completeTaskById(sb: SupabaseClient, userId: string, id: string) {
  const { data } = await sb.from("node_tasks").select("id, text").eq("id", id).eq("assigned_to", userId).maybeSingle();
  if (!data) return { error: "Tarea no encontrada." };
  const { error } = await sb.from("node_tasks").update({ done: true }).eq("id", id);
  if (error) return { error: error.message };
  return { ok: true, text: data.text };
}
export async function snoozeTaskById(sb: SupabaseClient, userId: string, id: string, days = 1) {
  const { data } = await sb.from("node_tasks").select("id, text, due_date").eq("id", id).eq("assigned_to", userId).maybeSingle();
  if (!data) return { error: "Tarea no encontrada." };
  const base = data.due_date ? new Date(data.due_date + "T12:00:00") : new Date();
  base.setDate(base.getDate() + days);
  const ds = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(base.getDate()).padStart(2, "0")}`;
  const { error } = await sb.from("node_tasks").update({ due_date: ds }).eq("id", id);
  if (error) return { error: error.message };
  return { ok: true, text: data.text, fecha: ds };
}
