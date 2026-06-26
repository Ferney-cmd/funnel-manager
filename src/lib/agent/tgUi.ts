// Botones inline de Telegram para tareas (✅ completar / 📅 +1 día). 0 tokens de IA.
import type { TaskRow } from "./taskOps";

export function taskButtons(tasks?: TaskRow[]) {
  if (!tasks || !tasks.length) return undefined;
  const rows = tasks.slice(0, 6).map((t) => [
    { text: "✅ " + t.text.slice(0, 24), callback_data: "d:" + t.id },
    { text: "📅 +1d", callback_data: "s:" + t.id },
  ]);
  return { inline_keyboard: rows };
}
