// Motor determinista: Command → operaciones (taskOps) → texto para chat.
// Canal-agnóstico. Devuelve también las tareas (para que Telegram les ponga botones).
import * as ops from "./taskOps";
import type { Command } from "./router";
import { PRIORITY_LABEL, todayStr } from "./taskOps";

function fmtDate(due: string | null): string {
  if (!due) return "";
  const today = todayStr();
  const d = new Date(due + "T12:00:00");
  const t = new Date(today + "T12:00:00");
  const diff = Math.round((d.getTime() - t.getTime()) / 86400000);
  if (diff === 0) return "hoy";
  if (diff === 1) return "mañana";
  if (diff === -1) return "ayer";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function taskLine(t: ops.TaskRow): string {
  const bits: string[] = [`• ${t.text}`];
  if (t.due_date) bits.push(t.overdue ? `⚠️ venció ${fmtDate(t.due_date)}` : `📅 ${fmtDate(t.due_date)}`);
  if (t.priority === "urgent") bits.push("🔴");
  else if (t.priority === "high") bits.push("🟠");
  return bits.join("  ");
}

function listBody(rows: ops.TaskRow[]): string {
  // agrupar por proyecto para reflejar la estructura
  const byProj = new Map<string, ops.TaskRow[]>();
  for (const r of rows) {
    const k = r.project || "Sin proyecto";
    if (!byProj.has(k)) byProj.set(k, []);
    byProj.get(k)!.push(r);
  }
  if (byProj.size <= 1) return rows.map(taskLine).join("\n");
  const parts: string[] = [];
  for (const [proj, list] of Array.from(byProj)) {
    parts.push(`\n📂 ${proj}`);
    parts.push(list.map(taskLine).join("\n"));
  }
  return parts.join("\n").trim();
}

const SCOPE_TITLE: Record<string, string> = {
  hoy: "📅 Tus tareas de hoy", manana: "📅 Tus tareas de mañana",
  semana: "🗓️ Tus tareas de esta semana", vencidas: "⚠️ Tus tareas vencidas",
  pendientes: "📋 Tus tareas pendientes", todas: "📋 Todas tus tareas",
};

export interface EngineResult { reply: string; tasks?: ops.TaskRow[]; }

export async function executeCommand(sb: any, userId: string, cmd: Command): Promise<EngineResult> {
  switch (cmd.tipo) {
    case "listar": {
      const rows = await ops.listTasks(sb, userId, { scope: cmd.scope, projectName: cmd.projectName, moduleName: cmd.moduleName });
      const title = SCOPE_TITLE[cmd.scope] ?? "📋 Tus tareas";
      const ctx = cmd.projectName ? ` (proyecto: ${cmd.projectName})` : "";
      if (rows.length === 0) return { reply: `${title}${ctx}\n\n¡Nada por aquí! 🎉` };
      return { reply: `${title}${ctx} — ${rows.length}\n\n${listBody(rows)}`, tasks: rows };
    }
    case "crear": {
      const r = await ops.createTask(sb, userId, cmd);
      if ("error" in r) return { reply: `No pude crear la tarea: ${r.error}` };
      const f = r.task.due_date ? ` para ${fmtDate(r.task.due_date)}` : "";
      const p = r.task.priority !== "normal" ? ` (prioridad ${PRIORITY_LABEL[r.task.priority]})` : "";
      const where = cmd.projectName ? ` en ${cmd.projectName}` : "";
      return { reply: `✅ Creé "${r.task.text}"${f}${p}${where}.` };
    }
    case "completar": {
      const r = await ops.completeTask(sb, userId, cmd.ref);
      if ("ambiguous" in r) return { reply: `¿Cuál de estas completaste?\n${r.ambiguous.map((x) => `• ${x}`).join("\n")}` };
      if ("error" in r) return { reply: r.error };
      return { reply: `✅ Marqué como completada: "${r.text}".` };
    }
    case "reabrir": {
      const r = await ops.reopenTask(sb, userId, cmd.ref);
      if ("ambiguous" in r) return { reply: `¿Cuál?\n${r.ambiguous.map((x) => `• ${x}`).join("\n")}` };
      if ("error" in r) return { reply: r.error };
      return { reply: `↩️ Reabrí: "${r.text}".` };
    }
    case "reprogramar": {
      const r = await ops.rescheduleTask(sb, userId, cmd.ref, cmd.fecha);
      if ("ambiguous" in r) return { reply: `¿Cuál quieres mover?\n${r.ambiguous.map((x) => `• ${x}`).join("\n")}` };
      if ("error" in r) return { reply: r.error };
      return { reply: `📅 "${r.text}" reprogramada para ${fmtDate(r.fecha)}.` };
    }
    case "prioridad": {
      const r = await ops.setPriority(sb, userId, cmd.ref, cmd.prioridad);
      if ("ambiguous" in r) return { reply: `¿Cuál?\n${r.ambiguous.map((x) => `• ${x}`).join("\n")}` };
      if ("error" in r) return { reply: r.error };
      return { reply: `🚩 "${r.text}" → prioridad ${PRIORITY_LABEL[r.prioridad]}.` };
    }
    case "proyectos": {
      const projs = await ops.listProjects(sb, userId);
      if (!projs.length) return { reply: "Aún no tienes proyectos." };
      const lines = projs.map((p) => p.parent_project_id ? `  ↳ ${p.name}` : `📂 ${p.name}`);
      return { reply: `Tus proyectos:\n${lines.join("\n")}` };
    }
    case "modulos": {
      const { project, modules } = await ops.listModules(sb, userId, cmd.projectName);
      if (!project) return { reply: "No encontré ese proyecto." };
      if (!modules.length) return { reply: `El proyecto "${project.name}" no tiene módulos.` };
      return { reply: `Módulos de ${project.name}:\n${modules.map((m) => `${m.icon || "📦"} ${m.title}`).join("\n")}` };
    }
    case "resumen": {
      const [venc, hoy, sem] = await Promise.all([
        ops.listTasks(sb, userId, { scope: "vencidas" }),
        ops.listTasks(sb, userId, { scope: "hoy" }),
        ops.listTasks(sb, userId, { scope: "semana" }),
      ]);
      if (!venc.length && !hoy.length && !sem.length) return { reply: "Vas al día, no tienes nada urgente. 🎉" };
      let r = "📊 Tu resumen:";
      if (venc.length) r += `\n\n⚠️ Vencidas (${venc.length})\n${venc.slice(0, 8).map(taskLine).join("\n")}`;
      if (hoy.length)  r += `\n\n📅 Hoy (${hoy.length})\n${hoy.slice(0, 8).map(taskLine).join("\n")}`;
      if (sem.length)  r += `\n\n🗓️ Esta semana (${sem.length})\n${sem.slice(0, 6).map(taskLine).join("\n")}`;
      return { reply: r, tasks: [...venc, ...hoy] };
    }
    case "ayuda":
      return { reply: [
        "🤖 Soy tu asistente de tareas. Puedes escribirme natural o usar atajos:",
        "",
        "• \"¿qué tengo para hoy?\"  ·  /hoy  /semana  /vencidas",
        "• \"agrega llamar al cliente mañana\"",
        "• \"agrega revisar copy urgente para el viernes\"",
        "• \"ya terminé la llamada\"",
        "• \"reprograma el informe para el lunes\"",
        "• \"mis proyectos\"  ·  \"módulos de <proyecto>\"",
        "• \"resumen\"",
      ].join("\n") };
    case "saludo":
      return { reply: "¡Hola! 👋 Soy tu asistente de FunnelManager. Escribe \"qué tengo para hoy\" o \"ayuda\" para ver qué puedo hacer." };
    default:
      return { reply: "" };
  }
}
