// Operaciones de plantillas de checklist (Fase 1). Usa el cliente del navegador (RLS).
import { createClient } from "@/lib/supabase/client";

export type TemplateScope = "personal" | "shared";
export interface TemplateItem { text: string; priority: string; offset_days: number | null; }
export interface Template {
  id: string;
  name: string;
  scope: TemplateScope;
  created_by: string;
  itemCount: number;
}

function uid() { return `t-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }

export async function listTemplates(): Promise<Template[]> {
  const sb = createClient();
  const { data } = await sb
    .from("task_templates")
    .select("id, name, scope, created_by, task_template_items(count)")
    .order("created_at", { ascending: false });
  return (data || []).map((t: any) => ({
    id: t.id, name: t.name, scope: t.scope, created_by: t.created_by,
    itemCount: Array.isArray(t.task_template_items) ? (t.task_template_items[0]?.count ?? 0) : 0,
  }));
}

export async function getTemplateItems(templateId: string): Promise<TemplateItem[]> {
  const sb = createClient();
  const { data } = await sb
    .from("task_template_items")
    .select("text, priority, offset_days, ord")
    .eq("template_id", templateId)
    .order("ord", { ascending: true });
  return (data || []).map((i: any) => ({ text: i.text, priority: i.priority || "normal", offset_days: i.offset_days ?? null }));
}

export async function createTemplate(
  name: string, scope: TemplateScope, items: TemplateItem[], userId: string,
): Promise<{ ok: true; id: string } | { error: string }> {
  const sb = createClient();
  const clean = items.map((i) => ({ ...i, text: i.text.trim() })).filter((i) => i.text);
  if (!name.trim()) return { error: "Ponle un nombre a la plantilla." };
  if (!clean.length) return { error: "Agrega al menos una tarea." };
  const { data, error } = await sb
    .from("task_templates")
    .insert({ name: name.trim().slice(0, 120), scope, created_by: userId })
    .select("id").single();
  if (error || !data) return { error: error?.message ?? "No se pudo crear la plantilla." };
  const rows = clean.map((it, i) => ({
    template_id: data.id, text: it.text.slice(0, 300),
    priority: it.priority || "normal", ord: i, offset_days: it.offset_days ?? null,
  }));
  const { error: e2 } = await sb.from("task_template_items").insert(rows);
  if (e2) return { error: e2.message };
  return { ok: true, id: data.id };
}

export async function deleteTemplate(id: string): Promise<{ ok: true } | { error: string }> {
  const sb = createClient();
  const { error } = await sb.from("task_templates").delete().eq("id", id);
  return error ? { error: error.message } : { ok: true };
}

/** Aplica una plantilla creando sus tareas en el módulo destino, asignadas al usuario. */
export async function applyTemplate(
  templateId: string, dest: { nodeId: string; projectId: string }, userId: string,
): Promise<{ ok: true; count: number } | { error: string }> {
  const sb = createClient();
  const items = await getTemplateItems(templateId);
  if (!items.length) return { error: "La plantilla no tiene tareas." };
  const { data: existing } = await sb.from("node_tasks").select("ord").eq("node_id", dest.nodeId);
  let ord = (existing || []).length;
  const today = new Date();
  const rows = items.map((it) => {
    let due: string | null = null;
    if (it.offset_days != null) {
      const d = new Date(today); d.setDate(d.getDate() + it.offset_days);
      due = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    return {
      id: uid(), node_id: dest.nodeId, project_id: dest.projectId,
      text: it.text.slice(0, 300), done: false, ord: ord++,
      priority: it.priority || "normal", due_date: due, assigned_to: userId, description: "",
    };
  });
  const { error } = await sb.from("node_tasks").insert(rows);
  return error ? { error: error.message } : { ok: true, count: rows.length };
}

/** Carga las tareas de un módulo como items de plantilla (para "importar"). */
export async function importModuleTasks(nodeId: string): Promise<TemplateItem[]> {
  const sb = createClient();
  const { data } = await sb.from("node_tasks").select("text, priority, ord").eq("node_id", nodeId).order("ord");
  return (data || []).map((t: any) => ({ text: t.text, priority: t.priority || "normal", offset_days: null }));
}
