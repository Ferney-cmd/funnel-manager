// Router determinista: texto → comando tipado, SIN IA.
// Alta precisión: si no hay match claro devuelve { tipo: "desconocido" } → la IA decide.
import { parseSpanishDate, stripDate } from "./dateEs";
import type { Scope } from "./taskOps";

export type Command =
  | { tipo: "listar"; scope: Scope; projectName?: string; moduleName?: string }
  | { tipo: "crear"; titulo: string; fecha?: string | null; prioridad?: string; projectName?: string }
  | { tipo: "completar"; ref: string }
  | { tipo: "reabrir"; ref: string }
  | { tipo: "reprogramar"; ref: string; fecha: string }
  | { tipo: "prioridad"; ref: string; prioridad: string }
  | { tipo: "proyectos" }
  | { tipo: "modulos"; projectName?: string }
  | { tipo: "resumen" }
  | { tipo: "ayuda" }
  | { tipo: "saludo" }
  | { tipo: "desconocido" };

function norm(s: string) { return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim(); }

function detectPriority(t: string): string | undefined {
  if (/\b(urgente|urgencia)\b/.test(t)) return "urgente";
  if (/\b(prioridad )?alta\b|\bimportante\b/.test(t)) return "alta";
  if (/\b(prioridad )?baja\b/.test(t)) return "baja";
  return undefined;
}
function extractProject(t: string): string | undefined {
  const m = t.match(/\ben\s+(?:el\s+)?proyecto\s+(.+)$/);
  return m ? m[1].trim() : undefined;
}

export function parseCommand(textRaw: string): Command {
  const text = (textRaw || "").trim();
  const t = norm(text);
  if (!t) return { tipo: "desconocido" };

  // Comandos slash
  if (/^\/(start|ayuda|help)\b/.test(t)) return /start/.test(t) ? { tipo: "ayuda" } : { tipo: "ayuda" };
  if (/^\/hoy\b/.test(t))       return { tipo: "listar", scope: "hoy" };
  if (/^\/semana\b/.test(t))    return { tipo: "listar", scope: "semana" };
  if (/^\/vencidas\b/.test(t))  return { tipo: "listar", scope: "vencidas" };
  if (/^\/pendientes\b/.test(t))return { tipo: "listar", scope: "pendientes" };
  if (/^\/proyectos\b/.test(t)) return { tipo: "proyectos" };
  if (/^\/resumen\b/.test(t))   return { tipo: "resumen" };

  // Ayuda
  if (/(^|\b)(ayuda|que puedes hacer|que sabes hacer|comandos|como funciona)(\b|$)/.test(t)) return { tipo: "ayuda" };

  // Saludo puro (corto y sin verbos de acción)
  if (/^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|holi|que tal|saludos)[\s!.]*$/.test(t)) return { tipo: "saludo" };

  // Resumen
  if (/\b(resumen|resumeme|mi dia|como voy|como vamos)\b/.test(t)) return { tipo: "resumen" };

  // Proyectos / módulos
  if (/\b(mis proyectos|que proyectos|lista de proyectos|cuales proyectos)\b/.test(t) || /^proyectos\b/.test(t)) return { tipo: "proyectos" };
  if (/\b(modulos|secciones)\b/.test(t)) {
    return { tipo: "modulos", projectName: extractProject(t) };
  }

  // Completar
  let m = t.match(/\b(ya\s+)?(termine|complete|complet[ée]|hice|acab[ée]|finalice|marca(?:r)?\s+como\s+(?:hecho|hecha|completad[ao])|completa(?:r)?|listo|hecho|hecha)\b\s*(.*)$/);
  if (m && (m[3]?.trim() || /\b(termine|complete|hice|acabe|finalice)\b/.test(t))) {
    const ref = (m[3] || "").replace(/^(la|el|tarea|de)\s+/i, "").trim();
    if (ref) return { tipo: "completar", ref };
  }

  // Reabrir
  m = t.match(/\b(reabre|reabrir|reactiva|marca(?:r)?\s+(?:como\s+)?pendiente|no\s+(?:la\s+)?(?:he\s+)?termin[ée])\b\s*(.*)$/);
  if (m && m[2]?.trim()) return { tipo: "reabrir", ref: m[2].replace(/^(la|el|tarea)\s+/i, "").trim() };

  // Reprogramar (mover fecha) — requiere fecha
  m = t.match(/\b(reprograma(?:r)?|pospon(?:er|e|)|mueve|cambia(?:r)?\s+(?:la\s+)?fecha\s+de|aplaza(?:r)?)\b\s*(.*)$/);
  if (m) {
    const rest = m[2] || "";
    const d = parseSpanishDate(rest);
    if (d) {
      const ref = stripDate(rest, d.matched).replace(/^(la|el|tarea)\s+/i, "").replace(/\b(para|al|a)\b\s*$/,"").trim();
      if (ref) return { tipo: "reprogramar", ref, fecha: d.date };
    }
  }

  // Prioridad
  m = t.match(/\b(prioridad|marca(?:r)?|pon(?:er|)|haz(?:la|lo|)?)\b.*\b(urgente|alta|baja)\b\s*(.*)$/);
  if (m) {
    const pr = detectPriority(t);
    // ref = lo que queda quitando palabras de mando y de prioridad
    let ref = (m[3] || "").trim();
    if (!ref) {
      ref = t.replace(/\b(prioridad|marca(?:r)?|pon(?:er|)|haz(?:la|lo|)?|como|la|el|tarea|urgente|alta|baja|a)\b/g, " ").replace(/\s{2,}/g, " ").trim();
    }
    if (pr && ref) return { tipo: "prioridad", ref, prioridad: pr };
  }

  // Crear (verbo de creación al inicio o claro)
  m = t.match(/\b(agrega(?:r|me)?|a[ñn]ade|a[ñn]adir|crea(?:r)?|nueva tarea|recuerdame|recuerda|recordar|apunta|anota|pon(?:er|)|nueva|necesito)\b\s*(.*)$/);
  if (m && m[2]?.trim()) {
    // usar el TEXTO ORIGINAL (con tildes/mayúsculas) para el título
    const startIdx = textRaw.toLowerCase().indexOf(m[2].slice(0, 8).toLowerCase());
    let titulo = (startIdx >= 0 ? textRaw.slice(startIdx) : m[2]).trim();
    titulo = titulo.replace(/^(una|la|el|de|que|:)\s+/i, "").trim();
    const projectName = extractProject(t);
    if (projectName) titulo = titulo.replace(/\s+en\s+(el\s+)?proyecto\s+.+$/i, "").trim();
    const prioridad = detectPriority(t);
    if (prioridad) titulo = titulo.replace(/\b(urgente|importante|prioridad\s+(alta|baja)|de\s+prioridad\s+(alta|baja))\b/gi, "").replace(/\s{2,}/g," ").trim();
    const d = parseSpanishDate(titulo);
    let fecha: string | null = null;
    if (d) { fecha = d.date; titulo = stripDate(titulo, d.matched).trim(); }
    titulo = titulo.replace(/[\s,;:]+$/,"").trim();
    if (titulo) return { tipo: "crear", titulo, fecha, prioridad, projectName };
  }

  // Listar (preguntas por tareas)
  if (/\b(que tengo|que hay|que tareas|mis tareas|mis pendientes|pendientes|tareas|muestra|muestrame|ver|lista(r)?|cuales? tareas|tengo algo)\b/.test(t)) {
    let scope: Scope = "pendientes";
    if (/\b(vencidas?|atrasad|retrasad|vencido)\b/.test(t)) scope = "vencidas";
    else if (/\bpasado manana\b/.test(t)) scope = "semana";
    else if (/\bmanana\b/.test(t)) scope = "manana";
    else if (/\b(hoy|para hoy|del dia|de hoy)\b/.test(t)) scope = "hoy";
    else if (/\b(semana|esta semana|7 dias)\b/.test(t)) scope = "semana";
    else if (/\btodas?\b/.test(t)) scope = "todas";
    return { tipo: "listar", scope, projectName: extractProject(t) };
  }

  return { tipo: "desconocido" };
}
