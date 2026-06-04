export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";

export async function POST(req: Request) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return NextResponse.json({ error: "AI_NOT_CONFIGURED" });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 }); }
  const prompt: string = (body?.prompt ?? "").toString().slice(0, 2000);
  const ctx = body?.context ?? {};
  if (!prompt.trim()) return NextResponse.json({ error: "EMPTY_PROMPT" }, { status: 400 });

  const system = `Eres un asistente de gestión de proyectos de marketing (embudos). Generas tareas accionables y concretas para un módulo de un embudo.
Módulo: "${ctx.nodeTitle ?? ""}" (rol: ${ctx.role ?? "general"}).
Tareas existentes: ${Array.isArray(ctx.existingTasks) ? ctx.existingTasks.join("; ") : "ninguna"}.
Devuelve SOLO un JSON válido con esta forma exacta, sin texto adicional:
{"tasks":[{"text":"...","priority":"low|normal|high|urgent"}]}
Máximo 8 tareas. En español. No repitas tareas existentes.`;

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return NextResponse.json({ error: "ANTHROPIC_ERROR", detail: t.slice(0, 300) }, { status: 502 });
    }
    const data = await r.json();
    const text = (data?.content?.[0]?.text ?? "").trim();
    // Extraer el primer bloque JSON
    const match = text.match(/\{[\s\S]*\}/);
    let tasks: { text: string; priority?: string }[] = [];
    if (match) {
      try { tasks = (JSON.parse(match[0]).tasks ?? []); } catch {}
    }
    const valid = ["low","normal","high","urgent"];
    tasks = tasks
      .filter((t) => t && typeof t.text === "string" && t.text.trim())
      .slice(0, 8)
      .map((t) => ({ text: t.text.trim().slice(0, 200), priority: valid.includes(t.priority as string) ? t.priority : "normal" }));
    return NextResponse.json({ tasks });
  } catch (e: any) {
    return NextResponse.json({ error: "FETCH_FAILED", detail: String(e).slice(0,200) }, { status: 502 });
  }
}
