export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runUserAgent } from "@/lib/agent/waAgent";
import { parseCommand } from "@/lib/agent/router";
import { executeCommand } from "@/lib/agent/engine";
import { completeTaskById, snoozeTaskById } from "@/lib/agent/taskOps";
import { taskButtons } from "@/lib/agent/tgUi";

const BOT = process.env.TELEGRAM_BOT_TOKEN || "";

async function sendMessage(chatId: number | string, text: string, reply_markup?: any) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, reply_markup, disable_web_page_preview: true }),
    });
  } catch { /* ignore */ }
}
async function answerCallback(id: string, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT}/answerCallbackQuery`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ callback_query_id: id, text }),
    });
  } catch { /* ignore */ }
}

export async function POST(req: Request) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: any;
  try { update = await req.json(); } catch { return NextResponse.json({ ok: true }); }
  const sb = createServiceClient();

  // ── Botones (callback_query): completar / posponer — 0 tokens ──
  if (update?.callback_query) {
    const cq = update.callback_query;
    const chatId = cq.message?.chat?.id;
    const data = String(cq.data ?? "");
    const { data: link } = await sb.from("telegram_links").select("user_id").eq("chat_id", chatId).maybeSingle();
    if (!link) { await answerCallback(cq.id, "Vincula tu cuenta primero."); return NextResponse.json({ ok: true }); }
    const id = data.slice(2);
    if (data.startsWith("d:")) {
      const r: any = await completeTaskById(sb, link.user_id, id);
      await answerCallback(cq.id, r.ok ? "✅ Completada" : (r.error || "No se pudo"));
      if (r.ok) await sendMessage(chatId, `✅ Completada: "${r.text}".`);
    } else if (data.startsWith("s:")) {
      const r: any = await snoozeTaskById(sb, link.user_id, id, 1);
      await answerCallback(cq.id, r.ok ? "📅 +1 día" : (r.error || "No se pudo"));
      if (r.ok) await sendMessage(chatId, `📅 "${r.text}" movida a ${r.fecha}.`);
    } else {
      await answerCallback(cq.id, "");
    }
    return NextResponse.json({ ok: true });
  }

  const msg = update?.message ?? update?.edited_message;
  const chatId = msg?.chat?.id;
  const text = (msg?.text ?? "").trim();
  if (!chatId || !text) return NextResponse.json({ ok: true });

  const { data: link } = await sb.from("telegram_links").select("user_id").eq("chat_id", chatId).maybeSingle();

  // ── No vinculado: canjear código o pedir vínculo ──
  if (!link) {
    const code = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (/^[A-Z0-9]{6}$/.test(code)) {
      const { data: codeRow } = await sb.from("whatsapp_link_codes").select("code, user_id, expires_at, used").eq("code", code).maybeSingle();
      if (codeRow) {
        if (!codeRow.used && new Date(codeRow.expires_at) > new Date()) {
          await sb.from("telegram_links").upsert({ user_id: codeRow.user_id, chat_id: chatId, username: msg?.from?.username ?? null }, { onConflict: "user_id" });
          await sb.from("whatsapp_link_codes").update({ used: true }).eq("code", code);
          const { data: prof } = await sb.from("profiles").select("full_name, email").eq("id", codeRow.user_id).maybeSingle();
          const name = prof?.full_name || prof?.email || "";
          await sendMessage(chatId, `✅ ¡Listo${name ? `, ${name}` : ""}! Tu Telegram quedó vinculado.\n\nEscribe "ayuda" para ver qué puedo hacer, o prueba "¿qué tengo para hoy?"`);
          return NextResponse.json({ ok: true });
        }
        await sendMessage(chatId, "Ese código ya se usó o expiró. Genera uno nuevo en la app → Perfil → Asistente.");
        return NextResponse.json({ ok: true });
      }
    }
    await sendMessage(chatId, "Hola 👋 Soy el asistente de FunnelManager. Para activarme, entra a la app → Perfil → Asistente, genera tu código y envíamelo aquí.");
    return NextResponse.json({ ok: true });
  }

  // ── Vinculado: router determinista primero (0 tokens); IA solo si no entiende ──
  const cmd = parseCommand(text);
  if (cmd.tipo !== "desconocido") {
    const res = await executeCommand(sb, link.user_id, cmd);
    await sendMessage(chatId, res.reply, taskButtons(res.tasks));
    return NextResponse.json({ ok: true });
  }

  const { data: prof } = await sb.from("profiles").select("full_name, email").eq("id", link.user_id).maybeSingle();
  const userName = prof?.full_name || prof?.email || "";
  const result = await runUserAgent({ sb, userId: link.user_id, userName, message: text });
  await sendMessage(chatId, result.reply);
  return NextResponse.json({ ok: true });
}
