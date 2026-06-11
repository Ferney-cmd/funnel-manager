export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
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
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { maxOutputTokens: 2048, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return NextResponse.json({ error: "GEMINI_ERROR", detail: t.slice(0, 300) });
    }
    const data = await r.json();
    // Gemini puede dividir la respuesta en varios parts: unirlos todos
    const allParts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
    const text = allParts.map((p) => p?.text ?? "").join("").trim();
    let tasks: { text: string; priority?: string }[] = [];
    try {
      const parsed = JSON.parse(text);
      tasks = Array.isArray(parsed) ? parsed : (parsed?.tasks ?? []);
    } catch {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try { tasks = (JSON.parse(match[0]).tasks ?? []); } catch {}
      }
    }
    if (!tasks.length) {
      console.error("ai/tasks sin tareas parseables. Respuesta:", JSON.stringify(data).slice(0, 600));
    }
    const valid = ["low","normal","high","urgent"];
    tasks = tasks
      .filter((t) => t && typeof t.text === "string" && t.text.trim())
      .slice(0, 8)
      .map((t) => ({ text: t.text.trim().slice(0, 200), priority: valid.includes(t.priority as string) ? t.priority : "normal" }));
    return NextResponse.json({ tasks });
  } catch (e: any) {
    return NextResponse.json({ error: "FETCH_FAILED", detail: String(e).slice(0,200) });
  }
}
