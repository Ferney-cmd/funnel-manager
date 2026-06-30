export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildMorningSummary, buildNightSummary } from "@/lib/agent/waAgent";
import { taskButtons } from "@/lib/agent/tgUi";

const BOT = process.env.TELEGRAM_BOT_TOKEN || "";
const WINDOW_MIN = 30; // tolerancia desde la hora elegida (el cron corre cada ~10 min)

/* Hora local + fecha del día en una zona horaria dada. */
function localNow(tz: string): { date: string; minutes: number; dayStartIso: string; dayEndIso: string } {
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const p: Record<string, string> = {};
  for (const part of fmt.formatToParts(now)) p[part.type] = part.value;
  const date = `${p.year}-${p.month}-${p.day}`;
  const minutes = parseInt(p.hour, 10) * 60 + parseInt(p.minute, 10);
  // offset de la zona (local - utc), en ms; Colombia = -5h sin DST
  const offsetMs = new Date(now.toLocaleString("en-US", { timeZone: tz })).getTime() - now.getTime();
  const wallMidnightUtc = Date.UTC(+p.year, +p.month - 1, +p.day, 0, 0, 0);
  const dayStartMs = wallMidnightUtc - offsetMs;
  return {
    date, minutes,
    dayStartIso: new Date(dayStartMs).toISOString(),
    dayEndIso: new Date(dayStartMs + 86400000).toISOString(),
  };
}

function slotMinutes(hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm || "");
  if (!m) return -1;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

async function send(chatId: number | string, text: string, reply_markup?: any) {
  const r = await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, reply_markup, disable_web_page_preview: true }),
  });
  return r.ok;
}

export async function POST(req: Request) {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-wa-secret") !== secret) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!BOT) return NextResponse.json({ error: "NO_BOT_TOKEN" }, { status: 500 });

  const sb = createServiceClient();
  // Vínculos de Telegram + sus preferencias (un usuario sin prefs no recibe nada).
  const { data: links } = await sb.from("telegram_links").select("user_id, chat_id");
  const { data: prefs } = await sb.from("notify_prefs").select("*");
  const prefByUser = new Map((prefs ?? []).map((p: any) => [p.user_id, p]));

  let morning = 0, night = 0;
  for (const link of (links ?? [])) {
    const pref: any = prefByUser.get(link.user_id);
    if (!pref) continue;
    const tz = pref.tz || "America/Bogota";
    const { date, minutes, dayStartIso, dayEndIso } = localNow(tz);

    // ── Mañana ──
    if (pref.morning_enabled && pref.last_morning_sent !== date) {
      const slot = slotMinutes(pref.morning_time);
      if (slot >= 0 && minutes >= slot && minutes < slot + WINDOW_MIN) {
        const s = await buildMorningSummary(sb, link.user_id);
        const ok = await send(link.chat_id, s.text, taskButtons(s.tasks));
        if (ok) {
          await sb.from("notify_prefs").update({ last_morning_sent: date }).eq("user_id", link.user_id);
          morning++;
        }
      }
    }

    // ── Noche ──
    if (pref.night_enabled && pref.last_night_sent !== date) {
      const slot = slotMinutes(pref.night_time);
      if (slot >= 0 && minutes >= slot && minutes < slot + WINDOW_MIN) {
        const s = await buildNightSummary(sb, link.user_id, dayStartIso, dayEndIso);
        const ok = await send(link.chat_id, s.text, taskButtons(s.tasks));
        if (ok) {
          await sb.from("notify_prefs").update({ last_night_sent: date }).eq("user_id", link.user_id);
          night++;
        }
      }
    }
  }
  return NextResponse.json({ ok: true, morning, night });
}
