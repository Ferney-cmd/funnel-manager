// IA de respaldo (Gemini function-calling). Solo se invoca cuando el router
// determinista NO entiende el mensaje. Sus tools usan la MISMA capa taskOps,
// así que router e IA comparten una sola fuente de verdad.
import type { SupabaseClient } from "@supabase/supabase-js";
import * as ops from "./taskOps";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_STEPS = 6;

const TOOLS = [{
  functionDeclarations: [
    {
      name: "listar_tareas",
      description: "Lista las tareas del usuario. filtro: hoy|manana|semana|vencidas|pendientes|todas. proyecto opcional.",
      parameters: { type: "OBJECT", properties: {
        filtro: { type: "STRING" }, proyecto: { type: "STRING" },
      }, required: ["filtro"] },
    },
    {
      name: "crear_tarea",
      description: "Crea una tarea. Si no se da proyecto, va a la Bandeja de entrada. Calcula fechas relativas (hoy/mañana) con la fecha de hoy del prompt.",
      parameters: { type: "OBJECT", properties: {
        titulo: { type: "STRING" }, fecha: { type: "STRING", description: "YYYY-MM-DD" },
        prioridad: { type: "STRING", description: "baja|normal|alta|urgente" }, proyecto: { type: "STRING" },
      }, required: ["titulo"] },
    },
    {
      name: "completar_tarea",
      description: "Marca como completada una tarea pendiente del usuario (por texto aproximado).",
      parameters: { type: "OBJECT", properties: { titulo_aproximado: { type: "STRING" } }, required: ["titulo_aproximado"] },
    },
    {
      name: "reprogramar_tarea",
      description: "Cambia la fecha límite de una tarea pendiente.",
      parameters: { type: "OBJECT", properties: {
        titulo_aproximado: { type: "STRING" }, fecha: { type: "STRING", description: "YYYY-MM-DD" },
      }, required: ["titulo_aproximado", "fecha"] },
    },
    {
      name: "listar_proyectos",
      description: "Lista los proyectos y subproyectos del usuario.",
      parameters: { type: "OBJECT", properties: {} },
    },
  ],
}];

async function execTool(sb: SupabaseClient, userId: string, name: string, args: any) {
  try {
    switch (name) {
      case "listar_tareas": {
        const rows = await ops.listTasks(sb, userId, { scope: (args?.filtro ?? "pendientes"), projectName: args?.proyecto });
        return { total: rows.length, tareas: rows.slice(0, 40).map((t) => ({ titulo: t.text, vence: t.due_date ?? "sin fecha", vencida: t.overdue, prioridad: t.priority, proyecto: t.project })) };
      }
      case "crear_tarea": {
        const r = await ops.createTask(sb, userId, { titulo: args?.titulo, fecha: args?.fecha, prioridad: args?.prioridad, projectName: args?.proyecto });
        return "error" in r ? { error: r.error } : { ok: true, titulo: r.task.text, vence: r.task.due_date ?? "sin fecha" };
      }
      case "completar_tarea": return await ops.completeTask(sb, userId, args?.titulo_aproximado ?? "");
      case "reprogramar_tarea": return await ops.rescheduleTask(sb, userId, args?.titulo_aproximado ?? "", args?.fecha ?? "");
      case "listar_proyectos": {
        const projs = await ops.listProjects(sb, userId);
        return { proyectos: projs.map((p) => ({ nombre: p.name, subproyecto: !!p.parent_project_id })) };
      }
      default: return { error: `Herramienta desconocida: ${name}` };
    }
  } catch (e: any) { return { error: String(e?.message ?? e).slice(0, 300) }; }
}

export interface AgentResult { reply: string; }

export async function runUserAgent(opts: {
  sb: SupabaseClient; userId: string; userName: string;
  message: string; history?: { role: "user" | "model"; text: string }[];
}): Promise<AgentResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { reply: "⚠ La IA no está configurada (falta GEMINI_API_KEY)." };

  const system = `Eres el asistente personal de tareas de FunnelManager por chat, hablando con ${opts.userName}.
Hoy es ${ops.todayStr()}. Estructura: proyectos (con subproyectos) → módulos → tareas, con fechas, prioridad y responsable.
Gestionas SOLO las tareas de esta persona con las herramientas (datos reales, nunca inventes).
Reglas: usa la herramienta correcta; calcula fechas relativas a hoy; responde en español, breve y natural para chat (sin markdown pesado, viñetas con "•"); tras crear/cambiar algo, confírmalo en una línea. Si algo es imposible, dilo claro.`;

  const contents: any[] = (opts.history ?? []).slice(-10).map((m) => ({
    role: m.role === "model" ? "model" : "user", parts: [{ text: String(m.text).slice(0, 1500) }],
  }));
  contents.push({ role: "user", parts: [{ text: opts.message.slice(0, 2000) }] });

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] }, contents, tools: TOOLS,
          generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
        }),
      });
      if (!r.ok) { const t = await r.text(); return { reply: "⚠ Error de IA: " + t.slice(0, 150) }; }
      const data = await r.json();
      const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
      const calls = parts.filter((p) => p.functionCall);
      if (!calls.length) {
        const reply = parts.map((p) => p?.text ?? "").join("").trim();
        return { reply: reply || "Listo." };
      }
      contents.push({ role: "model", parts: calls.map((c) => ({ functionCall: c.functionCall })) });
      const responses = [];
      for (const c of calls) {
        const result = await execTool(opts.sb, opts.userId, c.functionCall.name, c.functionCall.args);
        responses.push({ functionResponse: { name: c.functionCall.name, response: { result } } });
      }
      contents.push({ role: "user", parts: responses });
    }
    return { reply: "Hice parte del trabajo pero me quedé sin pasos. Intenta de nuevo." };
  } catch (e: any) { return { reply: "⚠ Error: " + String(e).slice(0, 150) }; }
}

/* Resumen diario (reutiliza taskOps). Devuelve texto o null si no hay nada. */
export async function buildDailyText(sb: SupabaseClient, userId: string): Promise<string | null> {
  const [venc, hoy, sem] = await Promise.all([
    ops.listTasks(sb, userId, { scope: "vencidas" }),
    ops.listTasks(sb, userId, { scope: "hoy" }),
    ops.listTasks(sb, userId, { scope: "semana" }),
  ]);
  if (!venc.length && !hoy.length && !sem.length) return null;
  const { data: prof } = await sb.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  const name = (prof?.full_name || "").split(" ")[0];
  let text = `☀️ Buenos días${name ? `, ${name}` : ""}. Tu resumen de hoy:`;
  if (venc.length) text += `\n\n⚠️ Vencidas (${venc.length})\n` + venc.slice(0, 8).map((t) => `• ${t.text}`).join("\n");
  if (hoy.length)  text += `\n\n📅 Para hoy (${hoy.length})\n` + hoy.slice(0, 8).map((t) => `• ${t.text}`).join("\n");
  if (sem.length)  text += `\n\n🗓️ Esta semana (${sem.length})\n` + sem.slice(0, 6).map((t) => `• ${t.text} (${t.due_date})`).join("\n");
  text += `\n\nEscríbeme para marcar algo como hecho o agregar una tarea.`;
  return text;
}
