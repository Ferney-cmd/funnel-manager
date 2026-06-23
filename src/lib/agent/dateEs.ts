// Parser de fechas en español → "YYYY-MM-DD" (sin IA).
// Relativo a "hoy" (zona horaria del servidor). Devuelve null si no detecta fecha.

const DOW: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, "miercoles": 3, "miércoles": 3,
  jueves: 4, viernes: 5, "sabado": 6, "sábado": 6,
};
const MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(base: Date, n: number): Date {
  const d = new Date(base); d.setDate(d.getDate() + n); return d;
}
function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Devuelve { date: "YYYY-MM-DD", matched: "texto que consumió" } o null. */
export function parseSpanishDate(input: string, today = new Date()): { date: string; matched: string } | null {
  const raw = input.toLowerCase();
  const t = stripAccents(raw);
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  // hoy / mañana / pasado mañana / ayer
  if (/\bpasado\s+manana\b/.test(t)) return { date: iso(addDays(base, 2)), matched: "pasado mañana" };
  if (/\bmanana\b/.test(t))          return { date: iso(addDays(base, 1)), matched: "mañana" };
  if (/\bhoy\b/.test(t))             return { date: iso(base),             matched: "hoy" };
  if (/\bayer\b/.test(t))            return { date: iso(addDays(base, -1)), matched: "ayer" };

  // "en N dias" / "en N semanas"
  let m = t.match(/\ben\s+(\d{1,3})\s+(dias?|semanas?)\b/);
  if (m) {
    const n = parseInt(m[1], 10) * (m[2].startsWith("semana") ? 7 : 1);
    return { date: iso(addDays(base, n)), matched: m[0] };
  }

  // día de la semana: "el viernes", "proximo lunes", "este martes"
  m = t.match(/\b(este|proximo|prox|el)?\s*(domingo|lunes|martes|miercoles|jueves|viernes|sabado)\b/);
  if (m && m[2] != null) {
    const target = DOW[m[2]];
    let diff = (target - base.getDay() + 7) % 7;
    // "próximo" o si cae hoy → la próxima semana; "el/este" mismo día futuro de esta semana
    if (diff === 0) diff = 7;
    if (m[1] && /proximo|prox/.test(m[1])) diff = diff === 0 ? 7 : diff; // ya cubierto
    return { date: iso(addDays(base, diff)), matched: m[0].trim() };
  }

  // DD/MM o DD/MM/YYYY  (también DD-MM)
  m = t.match(/\b(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?\b/);
  if (m) {
    const dd = parseInt(m[1], 10), mm = parseInt(m[2], 10);
    let yy = m[3] ? parseInt(m[3], 10) : base.getFullYear();
    if (yy < 100) yy += 2000;
    if (dd >= 1 && dd <= 31 && mm >= 1 && mm <= 12) {
      let d = new Date(yy, mm - 1, dd);
      // si no se dio año y la fecha ya pasó, asumimos el próximo año
      if (!m[3] && d < base) d = new Date(yy + 1, mm - 1, dd);
      return { date: iso(d), matched: m[0] };
    }
  }

  // "DD de <mes>" (con año opcional)
  m = t.match(/\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+(\d{4}))?\b/);
  if (m) {
    const dd = parseInt(m[1], 10), mm = MONTHS[m[2]];
    let yy = m[3] ? parseInt(m[3], 10) : base.getFullYear();
    let d = new Date(yy, mm - 1, dd);
    if (!m[3] && d < base) d = new Date(yy + 1, mm - 1, dd);
    return { date: iso(d), matched: m[0] };
  }

  return null;
}

/** Quita la expresión de fecha del texto (para extraer el título limpio de una tarea). */
export function stripDate(input: string, matched: string): string {
  // elimina conectores comunes antes de la fecha: para/el/antes del
  const re = new RegExp(`\\s*(para|el|antes del|antes de|para el)?\\s*${matched.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");
  return input.replace(re, "").replace(/\s{2,}/g, " ").trim();
}
