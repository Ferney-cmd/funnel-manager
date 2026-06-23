export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";

/* Devuelve [{phone, text}] con el resumen personal de cada usuario vinculado.
   Lo consume el servicio Baileys (disparado por cron) y envía cada mensaje. */
export async function POST(req: Request) {
  const secret = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-wa-secret") !== secret) {
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }

  const sb = createServiceClient();
  const today = new Date().toISOString().slice(0, 10);
  const week = new Date(); week.setDate(week.getDate() + 7);
  const weekStr = week.toISOString().slice(0, 10);

  const { data: links } = await sb.from("whatsapp_links").select("user_id, phone");
  const messages: { phone: string; text: string }[] = [];

  for (const link of (links ?? [])) {
    const { data: tasks } = await sb.from("node_tasks")
      .select("text, due_date, done")
      .eq("assigned_to", link.user_id)
      .eq("done", false)
      .limit(200);

    const rows = (tasks ?? []) as { text: string; due_date: string | null }[];
    const vencidas = rows.filter((t) => t.due_date && t.due_date < today);
    const hoy      = rows.filter((t) => t.due_date === today);
    const semana   = rows.filter((t) => t.due_date && t.due_date > today && t.due_date <= weekStr);

    // No molestar si no hay nada relevante
    if (vencidas.length === 0 && hoy.length === 0 && semana.length === 0) continue;

    const { data: prof } = await sb.from("profiles").select("full_name").eq("id", link.user_id).maybeSingle();
    const name = (prof?.full_name || "").split(" ")[0];

    let text = `☀️ Buenos días${name ? `, ${name}` : ""}. Tu resumen de hoy:\n`;
    if (vencidas.length) {
      text += `\n⚠️ *Vencidas (${vencidas.length})*\n` +
        vencidas.slice(0, 8).map((t) => `• ${t.text}`).join("\n") +
        (vencidas.length > 8 ? `\n… y ${vencidas.length - 8} más` : "");
    }
    if (hoy.length) {
      text += `\n\n📅 *Para hoy (${hoy.length})*\n` +
        hoy.slice(0, 8).map((t) => `• ${t.text}`).join("\n");
    }
    if (semana.length) {
      text += `\n\n🗓️ *Esta semana (${semana.length})*\n` +
        semana.slice(0, 6).map((t) => `• ${t.text} (${t.due_date})`).join("\n");
    }
    text += `\n\nEscríbeme si quieres marcar algo como hecho o agregar una tarea.`;
    messages.push({ phone: link.phone, text });
  }

  return NextResponse.json({ messages, count: messages.length });
}
