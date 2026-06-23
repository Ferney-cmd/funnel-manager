export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { runUserAgent } from "@/lib/agent/waAgent";

/* Solo dígitos del número (Baileys envía 573208839619@s.whatsapp.net) */
function normalizePhone(p: string) {
  return String(p ?? "").split("@")[0].replace(/\D/g, "");
}

export async function POST(req: Request) {
  // Autenticación por secreto compartido (el servicio Baileys lo envía)
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-wa-secret") !== secret) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 }); }
  const phone = normalizePhone(body?.phone);
  const text  = String(body?.text ?? "").trim();
  if (!phone || !text) return NextResponse.json({ reply: "" });

  const sb = createServiceClient();

  // ¿Número ya vinculado a un usuario?
  const { data: link } = await sb.from("whatsapp_links").select("user_id").eq("phone", phone).maybeSingle();

  if (!link) {
    // ¿El texto es un código de vínculo? (exactamente 6 caracteres del alfabeto)
    const code = text.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (/^[A-Z0-9]{6}$/.test(code)) {
      const { data: codeRow } = await sb.from("whatsapp_link_codes")
        .select("code, user_id, expires_at, used").eq("code", code).maybeSingle();
      if (codeRow) {
        if (!codeRow.used && new Date(codeRow.expires_at) > new Date()) {
          await sb.from("whatsapp_links").upsert({ user_id: codeRow.user_id, phone }, { onConflict: "user_id" });
          await sb.from("whatsapp_link_codes").update({ used: true }).eq("code", code);
          const { data: prof } = await sb.from("profiles").select("full_name, email").eq("id", codeRow.user_id).maybeSingle();
          const name = prof?.full_name || prof?.email || "";
          return NextResponse.json({
            reply: `✅ ¡Listo${name ? `, ${name}` : ""}! Tu WhatsApp quedó vinculado a FunnelManager.\n\nYa puedes pedirme cosas como:\n• "¿qué tengo para hoy?"\n• "agrega revisar propuesta para mañana"\n• "ya terminé la llamada con el cliente"`,
          });
        }
        // El código existe pero está usado o expirado → avisar
        return NextResponse.json({ reply: "Ese código ya se usó o expiró. Genera uno nuevo en FunnelManager → Perfil → WhatsApp." });
      }
      // No existe ese código → tratar como mensaje normal (cae al saludo)
    }
    return NextResponse.json({
      reply: "Hola 👋 Soy el asistente de FunnelManager. Para activarme, entra a la app → Perfil → WhatsApp, genera tu código y envíamelo aquí.",
    });
  }

  // Usuario vinculado → ejecutar agente
  const { data: prof } = await sb.from("profiles").select("full_name, email").eq("id", link.user_id).maybeSingle();
  const userName = prof?.full_name || prof?.email || "";

  const history = Array.isArray(body?.history) ? body.history : [];
  const result = await runUserAgent({ sb, userId: link.user_id, userName, message: text, history });
  return NextResponse.json({ reply: result.reply, actions: result.actions });
}
