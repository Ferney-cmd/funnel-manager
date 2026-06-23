export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runUserAgent } from "@/lib/agent/waAgent";

const BOT = process.env.TELEGRAM_BOT_TOKEN || "";

async function sendMessage(chatId: number | string, text: string) {
  try {
    await fetch(`https://api.telegram.org/bot${BOT}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
  } catch { /* ignore */ }
}

export async function POST(req: Request) {
  // Seguridad: secreto que Telegram reenvía en cada update
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  let update: any;
  try { update = await req.json(); } catch { return NextResponse.json({ ok: true }); }

  const msg = update?.message ?? update?.edited_message;
  const chatId = msg?.chat?.id;
  const text = (msg?.text ?? "").trim();
  if (!chatId || !text) return NextResponse.json({ ok: true });

  const sb = createServiceClient();
  const { data: link } = await sb.from("telegram_links").select("user_id").eq("chat_id", chatId).maybeSingle();

  if (!link) {
    const code = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (/^[A-Z0-9]{6}$/.test(code)) {
      const { data: codeRow } = await sb.from("whatsapp_link_codes")
        .select("code, user_id, expires_at, used").eq("code", code).maybeSingle();
      if (codeRow) {
        if (!codeRow.used && new Date(codeRow.expires_at) > new Date()) {
          await sb.from("telegram_links").upsert(
            { user_id: codeRow.user_id, chat_id: chatId, username: msg?.from?.username ?? null },
            { onConflict: "user_id" },
          );
          await sb.from("whatsapp_link_codes").update({ used: true }).eq("code", code);
          const { data: prof } = await sb.from("profiles").select("full_name, email").eq("id", codeRow.user_id).maybeSingle();
          const name = prof?.full_name || prof?.email || "";
          await sendMessage(chatId, `✅ ¡Listo${name ? `, ${name}` : ""}! Tu Telegram quedó vinculado a FunnelManager.\n\nYa puedes pedirme cosas como:\n• "¿qué tengo para hoy?"\n• "agrega revisar propuesta para mañana"\n• "ya terminé la llamada con el cliente"`);
          return NextResponse.json({ ok: true });
        }
        await sendMessage(chatId, "Ese código ya se usó o expiró. Genera uno nuevo en FunnelManager → Perfil → Asistente.");
        return NextResponse.json({ ok: true });
      }
    }
    await sendMessage(chatId, "Hola 👋 Soy el asistente de FunnelManager. Para activarme, entra a la app → Perfil → Asistente, genera tu código y envíamelo aquí.");
    return NextResponse.json({ ok: true });
  }

  const { data: prof } = await sb.from("profiles").select("full_name, email").eq("id", link.user_id).maybeSingle();
  const userName = prof?.full_name || prof?.email || "";
  const result = await runUserAgent({ sb, userId: link.user_id, userName, message: text });
  await sendMessage(chatId, result.reply);
  return NextResponse.json({ ok: true });
}
