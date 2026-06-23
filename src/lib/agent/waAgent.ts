// Núcleo del agente por usuario (canal-agnóstico). Lo usa WhatsApp y puede
// reutilizarse en otros transportes. Ejecuta tools reales contra Supabase con
// SERVICE ROLE, scopeado SIEMPRE por userId.
import type { SupabaseClient } from "@supabase/supabase-js";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_STEPS = 6;

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const PRIORITY_MAP: Record<string, string> = {
  baja: "low", media: "normal", normal: "normal", alta: "high", urgente: "urgent",
  low: "low", high: "high", urgent: "urgent",
};

const TOOLS = [{
  functionDeclarations: [
    {
      name: "listar_tareas",
      description: "Lista las tareas asignadas al usuario. Úsala cuando pregunte qué tiene pendiente, qué hay para hoy/esta semana, o sus tareas vencidas.",
      parameters: {
        type: "OBJECT",
        properties: {
          filtro: { type: "STRING", description: "hoy | semana | vencidas | todas" },
        },
        required: ["filtro"],
      },
    },
    {
      name: "crear_tarea",
      description: "Crea una tarea para el usuario. Úsala cuando diga crea/agrega/añade/recuérdame algo que hacer. Si no menciona proyecto, va a su Bandeja de entrada.",
      parameters: {
        type: "OBJECT",
        properties: {
          titulo: { type: "STRING", description: "Texto de la tarea" },
          fecha_vencimiento: { type: "STRING", description: "Fecha YYYY-MM-DD. Calcula fechas relativas (hoy, mañana) usando la fecha de hoy del prompt." },
          prioridad: { type: "STRING", description: "baja | media | alta | urgente" },
        },
        required: ["titulo"],
      },
    },
    {
      name: "completar_tarea",
      description: "Marca una tarea del usuario como completada. Úsala cuando diga que ya terminó o hizo algo.",
      parameters: {
        type: "OBJECT",
        properties: {
          titulo_aproximado: { type: "STRING", description: "Parte del nombre de la tarea a completar" },
        },
        required: ["titulo_aproximado"],
      },
    },
  ],
}];

type Ctx = { sb: SupabaseClient; userId: string; actions: string[] };

function todayStr() { return new Date().toISOString().slice(0, 10); }

async function listarTareas(ctx: Ctx, filtro: string) {
  const today = todayStr();
  let q = ctx.sb
    .from("node_tasks")
    .select("id, text, done, due_date, priority, projects(name)")
    .eq("assigned_to", ctx.userId)
    .order("due_date", { ascending: true, nullsFirst: false });

  if (filtro !== "todas") q = q.eq("done", false);
  const { data, error } = await q.limit(100);
  if (error) return { error: error.message };

  let rows = (data ?? []) as any[];
  const week = new Date(); week.setDate(week.getDate() + 7);
  const weekStr = week.toISOString().slice(0, 10);
  if (filtro === "hoy") rows = rows.filter((t) => t.due_date === today);
  else if (filtro === "vencidas") rows = rows.filter((t) => t.due_date && t.due_date < today && !t.done);
  else if (filtro === "semana") rows = rows.filter((t) => t.due_date && t.due_date >= today && t.due_date <= weekStr);

  return {
    total: rows.length,
    tareas: rows.slice(0, 40).map((t) => ({
      titulo: t.text,
      vence: t.due_date ?? "sin fecha",
      vencida: !!(t.due_date && t.due_date < today && !t.done),
      prioridad: t.priority ?? "normal",
      proyecto: Array.isArray(t.projects) ? t.projects[0]?.name : (t.projects as any)?.name,
      completada: t.done,
    })),
  };
}

async function getInbox(ctx: Ctx): Promise<{ projectId: string; nodeId: string } | { error: string }> {
  // Busca/crea el proyecto "Bandeja de entrada" del usuario y un módulo dentro.
  const INBOX = "📥 Bandeja de entrada";
  let { data: proj } = await ctx.sb.from("projects")
    .select("id").eq("user_id", ctx.userId).eq("name", INBOX).limit(1).maybeSingle();
  if (!proj) {
    const { data: created, error } = await ctx.sb.from("projects")
      .insert({ user_id: ctx.userId, name: INBOX, status: "active" }).select("id").single();
    if (error || !created) return { error: error?.message ?? "no se pudo crear la bandeja" };
    proj = created;
  }
  let { data: node } = await ctx.sb.from("funnel_nodes")
    .select("id").eq("project_id", proj.id).limit(1).maybeSingle();
  if (!node) {
    const nodeId = `node-${uid()}`;
    const { error } = await ctx.sb.from("funnel_nodes").insert({
      id: nodeId, project_id: proj.id, title: "Pendientes", subtitle: "WhatsApp",
      role: "pm", icon: "📋", position_x: 80, position_y: 160,
    });
    if (error) return { error: error.message };
    return { projectId: proj.id, nodeId };
  }
  return { projectId: proj.id, nodeId: node.id };
}

async function crearTarea(ctx: Ctx, args: any) {
  const titulo = String(args.titulo ?? "").trim();
  if (!titulo) return { error: "Falta el título de la tarea." };
  const inbox = await getInbox(ctx);
  if ("error" in inbox) return { error: inbox.error };

  const valid = ["low", "normal", "high", "urgent"];
  const prioridad = PRIORITY_MAP[String(args.prioridad ?? "").toLowerCase()] ?? "normal";
  const due = /^\d{4}-\d{2}-\d{2}$/.test(args.fecha_vencimiento ?? "") ? args.fecha_vencimiento : null;

  // ord = al final
  const { data: existing } = await ctx.sb.from("node_tasks").select("ord").eq("node_id", inbox.nodeId);
  const ord = (existing ?? []).length;

  const { error } = await ctx.sb.from("node_tasks").insert({
    id: `t-${uid()}`, node_id: inbox.nodeId, project_id: inbox.projectId,
    text: titulo.slice(0, 300), done: false, ord,
    priority: valid.includes(prioridad) ? prioridad : "normal",
    due_date: due, assigned_to: ctx.userId, description: "",
  });
  if (error) return { error: error.message };
  ctx.actions.push(`Tarea creada: "${titulo}"${due ? ` (vence ${due})` : ""}`);
  return { ok: true, titulo, vence: due ?? "sin fecha", prioridad };
}

async function completarTarea(ctx: Ctx, args: any) {
  const q = String(args.titulo_aproximado ?? "").trim();
  if (!q) return { error: "Indica qué tarea completaste." };
  const { data, error } = await ctx.sb.from("node_tasks")
    .select("id, text")
    .eq("assigned_to", ctx.userId).eq("done", false)
    .ilike("text", `%${q}%`).limit(5);
  if (error) return { error: error.message };
  const rows = data ?? [];
  if (rows.length === 0) return { error: `No encontré ninguna tarea pendiente que coincida con "${q}".` };
  if (rows.length > 1) return { ambiguo: true, opciones: rows.map((r: any) => r.text) };
  const { error: upErr } = await ctx.sb.from("node_tasks").update({ done: true }).eq("id", rows[0].id);
  if (upErr) return { error: upErr.message };
  ctx.actions.push(`Tarea completada: "${rows[0].text}"`);
  return { ok: true, completada: rows[0].text };
}

async function execTool(ctx: Ctx, name: string, args: any) {
  try {
    switch (name) {
      case "listar_tareas":   return await listarTareas(ctx, args?.filtro ?? "todas");
      case "crear_tarea":     return await crearTarea(ctx, args ?? {});
      case "completar_tarea": return await completarTarea(ctx, args ?? {});
      default: return { error: `Herramienta desconocida: ${name}` };
    }
  } catch (e: any) {
    return { error: String(e?.message ?? e).slice(0, 300) };
  }
}

export interface AgentResult { reply: string; actions: string[]; }

export async function runUserAgent(opts: {
  sb: SupabaseClient;
  userId: string;
  userName: string;
  message: string;
  history?: { role: "user" | "model"; text: string }[];
}): Promise<AgentResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { reply: "⚠ La IA no está configurada (falta GEMINI_API_KEY).", actions: [] };

  const ctx: Ctx = { sb: opts.sb, userId: opts.userId, actions: [] };

  const system = `Eres el asistente personal de tareas de FunnelManager, hablando por WhatsApp con ${opts.userName}.
Hoy es ${todayStr()}.
Ayudas a la persona a gestionar SUS tareas: crearlas, listarlas y completarlas. Usa las herramientas para datos reales — nunca inventes tareas.
Reglas:
1. Si pide ver/qué tiene pendiente → listar_tareas con el filtro adecuado (hoy/semana/vencidas/todas).
2. Si pide crear/agregar/recordar algo → crear_tarea. Calcula fechas relativas (hoy/mañana) a partir de la fecha de hoy.
3. Si dice que terminó/hizo algo → completar_tarea. Si hay varias coincidencias, pregúntale cuál.
4. Responde SIEMPRE en español, breve y natural para chat (sin markdown pesado). Usa viñetas con "•" si listas tareas.
5. Tras crear/completar, confirma en una línea.`;

  const contents: any[] = (opts.history ?? []).slice(-12).map((m) => ({
    role: m.role === "model" ? "model" : "user",
    parts: [{ text: String(m.text).slice(0, 2000) }],
  }));
  contents.push({ role: "user", parts: [{ text: opts.message.slice(0, 2000) }] });

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents, tools: TOOLS,
          generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        return { reply: "⚠ Error de IA: " + t.slice(0, 150), actions: ctx.actions };
      }
      const data = await r.json();
      const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
      const calls = parts.filter((p) => p.functionCall);
      if (!calls.length) {
        const reply = parts.map((p) => p?.text ?? "").join("").trim();
        return { reply: reply || "Listo.", actions: ctx.actions };
      }
      contents.push({ role: "model", parts: calls.map((c) => ({ functionCall: c.functionCall })) });
      const responses = [];
      for (const c of calls) {
        const result = await execTool(ctx, c.functionCall.name, c.functionCall.args);
        responses.push({ functionResponse: { name: c.functionCall.name, response: { result } } });
      }
      contents.push({ role: "user", parts: responses });
    }
    return { reply: "Hice parte del trabajo pero me quedé sin pasos. Intenta de nuevo.", actions: ctx.actions };
  } catch (e: any) {
    return { reply: "⚠ Error: " + String(e).slice(0, 150), actions: ctx.actions };
  }
}
