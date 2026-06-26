export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { buildDailySummary } from "@/lib/agent/waAgent";
import { taskButtons } from "@/lib/agent/tgUi";

const BOT = process.env.TELEGRAM_BOT_TOKEN || "";

/* Disparado por cron diario. Envía el resumen personal a cada Telegram vinculado. */
export async function POST(req: Request) {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-wa-secret") !== secret) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!BOT) return NextResponse.json({ error: "NO_BOT_TOKEN" }, { status: 500 });

  const sb = createServiceClient();
  const { data: links } = await sb.from("telegram_links").select("user_id, chat_id");
  let sent = 0;
  for (const link of (links ?? [])) {
    const summary = await buildDailySummary(sb, link.user_id);
    if (!summary) continue;
    try {
      await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: link.chat_id,
          text: summary.text,
          reply_markup: taskButtons(summary.tasks),
          disable_web_page_preview: true,
        }),
      });
      sent++;
    } catch { /* ignore */ }
  }
  return NextResponse.json({ ok: true, sent });
}
