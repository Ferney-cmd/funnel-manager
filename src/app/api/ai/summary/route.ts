export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: "AI_NOT_CONFIGURED" });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 }); }
  const projectName: string = (body?.projectName ?? "").toString().slice(0, 200);
  const stats = body?.stats ?? {};

  const system = `Eres un asistente de gestión de proyectos de marketing (embudos).
Resume el estado del proyecto "${projectName}" para una reunión de equipo en 4-6 líneas, en español, claro y accionable: avance, riesgos/bloqueos, próximos pasos.
Responde solo con el resumen en texto plano, sin formato JSON ni encabezados.`;

  try {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": key,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: JSON.stringify(stats) }] }],
        generationConfig: { maxOutputTokens: 1024, thinkingConfig: { thinkingBudget: 0 } },
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      return NextResponse.json({ error: "GEMINI_ERROR", detail: t.slice(0, 300) });
    }
    const data = await r.json();
    const summary = (data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim();
    return NextResponse.json({ summary });
  } catch (e: any) {
    return NextResponse.json({ error: "FETCH_FAILED", detail: String(e).slice(0,200) });
  }
}
