export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin O/0/I/1 ambiguos
function genCode(len = 6) {
  let s = "";
  for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}

/* GET → estado del vínculo del usuario actual */
export async function GET() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  const { data: link } = await sb.from("whatsapp_links").select("phone, linked_at").eq("user_id", user.id).maybeSingle();
  return NextResponse.json({ linked: !!link, phone: link?.phone ?? null, linkedAt: link?.linked_at ?? null });
}

/* POST → genera un código de vínculo de 6 caracteres (válido 15 min) */
export async function POST() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // limpia códigos previos sin usar del usuario
  await sb.from("whatsapp_link_codes").delete().eq("user_id", user.id).eq("used", false);

  const expires = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  let code = "";
  for (let attempt = 0; attempt < 5; attempt++) {
    code = genCode();
    const { error } = await sb.from("whatsapp_link_codes").insert({ code, user_id: user.id, expires_at: expires });
    if (!error) break;
    code = "";
  }
  if (!code) return NextResponse.json({ error: "CODE_GEN_FAILED" }, { status: 500 });
  return NextResponse.json({ code, expiresInMin: 15 });
}

/* DELETE → desvincula el WhatsApp del usuario */
export async function DELETE() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  await sb.from("whatsapp_links").delete().eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
