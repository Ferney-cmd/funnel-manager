export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const MAX_STEPS = 8;

const ROLE_LABELS: Record<string, string> = {
  trafficker: "Trafficker Digital", estratega: "Estratega / Copy", ghl: "GHL Builder",
  integraciones: "Integraciones", ventas: "Líder de Ventas", pm: "Project Manager",
  experto: "Experto / CEO", creativos: "Diseño / Creativos", closer: "Closer",
  setter: "Setter", tech: "Tech / Soporte",
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

/* ── Declaración de herramientas para Gemini ─────────────────── */
const TOOLS = [{
  functionDeclarations: [
    {
      name: "get_project_state",
      description: "Obtiene el estado completo del proyecto: módulos del embudo con sus tareas (estado, prioridad, fechas, responsables), miembros del equipo con sus roles, y estadísticas de avance. SIEMPRE llama a esta herramienta antes de crear o modificar algo, para no duplicar trabajo existente.",
      parameters: { type: "OBJECT", properties: {} },
    },
    {
      name: "create_module",
      description: "Crea un nuevo módulo (nodo del embudo) en el proyecto. Úsalo solo si no existe un módulo adecuado para las tareas que se necesitan.",
      parameters: {
        type: "OBJECT",
        properties: {
          title:       { type: "STRING", description: "Nombre del módulo, ej: 'Página de Gracias — Lead Calificado'" },
          role:        { type: "STRING", description: `Rol responsable del módulo. Valores válidos: ${Object.keys(ROLE_LABELS).join(", ")}` },
          icon:        { type: "STRING", description: "Un emoji representativo, ej: 📄 🎯 📧" },
          assigned_to: { type: "STRING", description: "Nombre o email del miembro responsable (opcional)" },
        },
        required: ["title", "role"],
      },
    },
    {
      name: "create_task",
      description: "Crea una tarea dentro de un módulo existente. Pasa el module_id obtenido de get_project_state.",
      parameters: {
        type: "OBJECT",
        properties: {
          module_id:   { type: "STRING", description: "ID del módulo donde crear la tarea" },
          text:        { type: "STRING", description: "Texto de la tarea, claro y accionable" },
          description: { type: "STRING", description: "Descripción ampliada (opcional)" },
          priority:    { type: "STRING", description: "low | normal | high | urgent" },
          due_date:    { type: "STRING", description: "Fecha límite YYYY-MM-DD (opcional)" },
          assigned_to: { type: "STRING", description: "Nombre o email del miembro responsable (opcional)" },
        },
        required: ["module_id", "text"],
      },
    },
    {
      name: "update_task",
      description: "Actualiza una tarea existente: texto, completada, prioridad, fecha límite o responsable.",
      parameters: {
        type: "OBJECT",
        properties: {
          task_id:     { type: "STRING", description: "ID de la tarea" },
          text:        { type: "STRING" },
          done:        { type: "BOOLEAN", description: "true = completada" },
          priority:    { type: "STRING", description: "low | normal | high | urgent" },
          due_date:    { type: "STRING", description: "YYYY-MM-DD o '' para quitar" },
          assigned_to: { type: "STRING", description: "Nombre o email del responsable, o '' para desasignar" },
        },
        required: ["task_id"],
      },
    },
    {
      name: "assign_module",
      description: "Cambia el responsable de un módulo del embudo.",
      parameters: {
        type: "OBJECT",
        properties: {
          module_id:   { type: "STRING", description: "ID del módulo" },
          assigned_to: { type: "STRING", description: "Nombre o email del miembro responsable" },
        },
        required: ["module_id", "assigned_to"],
      },
    },
  ],
}];

/* ── Ejecución de herramientas contra Supabase (con RLS del usuario) ── */

type Ctx = {
  supabase: ReturnType<typeof createClient>;
  projectId: string;
  canEdit: boolean;
  members: { id: string; name: string; email: string; role: string }[];
  actions: string[];
};

function resolveMember(ctx: Ctx, query?: string) {
  if (!query || !query.trim()) return null;
  const q = query.trim().toLowerCase();
  return ctx.members.find((m) =>
    m.name.toLowerCase() === q || m.email.toLowerCase() === q
  ) ?? ctx.members.find((m) =>
    m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
  ) ?? null;
}

async function toolGetProjectState(ctx: Ctx) {
  const [{ data: project }, { data: nodes }] = await Promise.all([
    ctx.supabase.from("projects")
      .select("name, description, client, status, start_date, end_date")
      .eq("id", ctx.projectId).single(),
    ctx.supabase.from("funnel_nodes")
      .select("id, title, subtitle, role, icon, assigned_to, node_tasks(id, text, description, done, priority, due_date, assigned_to, ord)")
      .eq("project_id", ctx.projectId),
  ]);

  const byId = Object.fromEntries(ctx.members.map((m) => [m.id, m.name]));
  const today = new Date().toISOString().slice(0, 10);

  const modules = (nodes ?? []).map((n: any) => {
    const tasks = (n.node_tasks ?? []).sort((a: any, b: any) => a.ord - b.ord).map((t: any) => ({
      id: t.id,
      text: t.text,
      done: t.done,
      priority: t.priority ?? "normal",
      due_date: t.due_date ?? null,
      overdue: !t.done && t.due_date ? t.due_date < today : false,
      assigned_to: t.assigned_to ? (byId[t.assigned_to] ?? "desconocido") : null,
      description: t.description || undefined,
    }));
    const doneCount = tasks.filter((t: any) => t.done).length;
    return {
      module_id: n.id,
      title: n.title,
      role: n.role,
      role_label: ROLE_LABELS[n.role] ?? n.role,
      assigned_to: n.assigned_to ? (byId[n.assigned_to] ?? "desconocido") : null,
      progress: tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0,
      tasks,
    };
  });

  return {
    today,
    project: {
      name: project?.name, description: project?.description, client: project?.client,
      status: project?.status, start_date: project?.start_date, end_date: project?.end_date,
    },
    members: ctx.members.map((m) => ({ name: m.name, email: m.email, project_role: m.role })),
    modules,
  };
}

async function toolCreateModule(ctx: Ctx, args: any) {
  if (!ctx.canEdit) return { error: "El usuario no tiene permiso de edición en este proyecto." };
  const role = ROLE_LABELS[args.role] ? args.role : "ghl";
  const member = resolveMember(ctx, args.assigned_to);
  if (args.assigned_to && !member) {
    return { error: `No existe ningún miembro que coincida con "${args.assigned_to}". Miembros: ${ctx.members.map((m) => m.name).join(", ")}` };
  }

  const { data: existing } = await ctx.supabase.from("funnel_nodes")
    .select("position_x").eq("project_id", ctx.projectId);
  const lastX = existing?.length ? Math.max(...existing.map((n: any) => n.position_x ?? 0)) + 230 : 80;

  const id = `node-${uid()}`;
  const initials = member ? member.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() : "";
  const { error } = await ctx.supabase.from("funnel_nodes").insert({
    id, project_id: ctx.projectId,
    title: String(args.title).slice(0, 120),
    subtitle: ROLE_LABELS[role],
    icon: args.icon || "📦",
    role,
    assigned_to: member?.id ?? null,
    owner_initials: initials, owner_color: "#7C3AED",
    position_x: lastX, position_y: 160,
  });
  if (error) return { error: error.message };
  ctx.actions.push(`Módulo creado: "${args.title}"${member ? ` → ${member.name}` : ""}`);
  return { ok: true, module_id: id };
}

async function toolCreateTask(ctx: Ctx, args: any) {
  if (!ctx.canEdit) return { error: "El usuario no tiene permiso de edición en este proyecto." };
  const { data: node } = await ctx.supabase.from("funnel_nodes")
    .select("id, title, node_tasks(id)").eq("id", args.module_id).eq("project_id", ctx.projectId).single();
  if (!node) return { error: `No existe el módulo ${args.module_id} en este proyecto.` };

  const member = resolveMember(ctx, args.assigned_to);
  if (args.assigned_to && !member) {
    return { error: `No existe ningún miembro que coincida con "${args.assigned_to}". Miembros: ${ctx.members.map((m) => m.name).join(", ")}` };
  }
  const valid = ["low", "normal", "high", "urgent"];
  const id = `t-${uid()}`;
  const { error } = await ctx.supabase.from("node_tasks").insert({
    id,
    node_id: node.id,
    project_id: ctx.projectId,
    text: String(args.text).slice(0, 300),
    description: args.description ? String(args.description).slice(0, 2000) : "",
    done: false,
    ord: (node as any).node_tasks?.length ?? 0,
    priority: valid.includes(args.priority) ? args.priority : "normal",
    due_date: /^\d{4}-\d{2}-\d{2}$/.test(args.due_date ?? "") ? args.due_date : null,
    assigned_to: member?.id ?? null,
  });
  if (error) return { error: error.message };
  ctx.actions.push(`Tarea creada en "${(node as any).title}": "${args.text}"${member ? ` → ${member.name}` : ""}`);
  return { ok: true, task_id: id };
}

async function toolUpdateTask(ctx: Ctx, args: any) {
  if (!ctx.canEdit) return { error: "El usuario no tiene permiso de edición en este proyecto." };
  const { data: task } = await ctx.supabase.from("node_tasks")
    .select("id, text").eq("id", args.task_id).eq("project_id", ctx.projectId).single();
  if (!task) return { error: `No existe la tarea ${args.task_id} en este proyecto.` };

  const db: Record<string, unknown> = {};
  if (args.text !== undefined) db.text = String(args.text).slice(0, 300);
  if (args.done !== undefined) db.done = !!args.done;
  if (["low", "normal", "high", "urgent"].includes(args.priority)) db.priority = args.priority;
  if (args.due_date !== undefined) {
    db.due_date = /^\d{4}-\d{2}-\d{2}$/.test(args.due_date ?? "") ? args.due_date : null;
  }
  if (args.assigned_to !== undefined) {
    if (args.assigned_to === "" || args.assigned_to === null) {
      db.assigned_to = null;
    } else {
      const member = resolveMember(ctx, args.assigned_to);
      if (!member) return { error: `No existe ningún miembro que coincida con "${args.assigned_to}".` };
      db.assigned_to = member.id;
    }
  }
  if (!Object.keys(db).length) return { error: "No se indicó ningún cambio." };
  const { error } = await ctx.supabase.from("node_tasks").update(db).eq("id", task.id);
  if (error) return { error: error.message };
  ctx.actions.push(`Tarea actualizada: "${(task as any).text}"`);
  return { ok: true };
}

async function toolAssignModule(ctx: Ctx, args: any) {
  if (!ctx.canEdit) return { error: "El usuario no tiene permiso de edición en este proyecto." };
  const { data: node } = await ctx.supabase.from("funnel_nodes")
    .select("id, title").eq("id", args.module_id).eq("project_id", ctx.projectId).single();
  if (!node) return { error: `No existe el módulo ${args.module_id} en este proyecto.` };
  const member = resolveMember(ctx, args.assigned_to);
  if (!member) return { error: `No existe ningún miembro que coincida con "${args.assigned_to}".` };
  const initials = member.name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const { error } = await ctx.supabase.from("funnel_nodes")
    .update({ assigned_to: member.id, owner_initials: initials }).eq("id", node.id);
  if (error) return { error: error.message };
  ctx.actions.push(`Módulo "${(node as any).title}" asignado a ${member.name}`);
  return { ok: true };
}

async function execTool(ctx: Ctx, name: string, args: any) {
  try {
    switch (name) {
      case "get_project_state": return await toolGetProjectState(ctx);
      case "create_module":     return await toolCreateModule(ctx, args ?? {});
      case "create_task":       return await toolCreateTask(ctx, args ?? {});
      case "update_task":       return await toolUpdateTask(ctx, args ?? {});
      case "assign_module":     return await toolAssignModule(ctx, args ?? {});
      default: return { error: `Herramienta desconocida: ${name}` };
    }
  } catch (e: any) {
    return { error: String(e?.message ?? e).slice(0, 300) };
  }
}

/* ── Handler principal ───────────────────────────────────────── */
export async function POST(req: Request) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return NextResponse.json({ error: "AI_NOT_CONFIGURED" });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 }); }
  const projectId: string = (body?.projectId ?? "").toString();
  const history: { role: string; text: string }[] = Array.isArray(body?.messages) ? body.messages.slice(-20) : [];
  if (!projectId || !history.length) return NextResponse.json({ error: "BAD_REQUEST" }, { status: 400 });

  // Archivos adjuntos al último mensaje del usuario: { name, mimeType, data(base64) }
  const rawFiles: { name: string; mimeType: string; data: string }[] =
    Array.isArray(body?.files) ? body.files.slice(0, 8) : [];
  let totalBytes = 0;
  for (const f of rawFiles) {
    const bytes = Math.ceil((f?.data?.length ?? 0) * 0.75);
    totalBytes += bytes;
    if (bytes > 12 * 1024 * 1024 || totalBytes > 16 * 1024 * 1024) {
      return NextResponse.json({ error: "FILE_TOO_LARGE", detail: "Cada archivo debe pesar menos de 12 MB (16 MB en total)." });
    }
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  // Proyecto + rol del usuario (RLS ya limita a proyectos donde es miembro)
  const { data: project } = await supabase.from("projects")
    .select("id, name, user_id").eq("id", projectId).single();
  if (!project) return NextResponse.json({ error: "PROJECT_NOT_FOUND" }, { status: 404 });

  const { data: ms } = await supabase.from("project_members")
    .select("user_id, role").eq("project_id", projectId);
  const memberIds = new Set<string>((ms ?? []).map((m: any) => m.user_id));
  if (project.user_id) memberIds.add(project.user_id);

  const { data: profiles } = await supabase.from("profiles")
    .select("id, full_name, email").in("id", Array.from(memberIds));

  const members = (profiles ?? []).map((p: any) => ({
    id: p.id,
    name: p.full_name || p.email || "sin nombre",
    email: p.email || "",
    role: project.user_id === p.id ? "owner" : ((ms ?? []).find((m: any) => m.user_id === p.id)?.role ?? "viewer"),
  }));

  const myRole = project.user_id === user.id ? "owner"
    : ((ms ?? []).find((m: any) => m.user_id === user.id)?.role ?? "viewer");
  const canEdit = myRole === "owner" || myRole === "editor";

  const ctx: Ctx = { supabase, projectId, canEdit, members, actions: [] };

  const system = `Eres el Copilot de FunnelManager, un agente de gestión de proyectos de marketing (embudos de venta) integrado en la plataforma.
Hoy es ${new Date().toISOString().slice(0, 10)}. Proyecto activo: "${project.name}".
El usuario es ${members.find((m) => m.id === user.id)?.name ?? "un miembro"} (rol: ${myRole}${canEdit ? ", puede editar" : ", SOLO LECTURA — no puedes crear ni modificar nada para él"}).

REGLAS:
1. SIEMPRE llama get_project_state antes de crear o modificar algo, y antes de responder preguntas de estado. No inventes datos.
2. NO dupliques: si ya existe un módulo o tarea equivalente, úsalo o dilo en vez de crear otro.
3. Al crear tareas, asigna el módulo correcto según el rol (trafficker = campañas/ads/pixel, ghl = páginas/embudos/automatizaciones, estratega = copy, integraciones = webhooks/APIs, etc.). Si no existe módulo adecuado, créalo primero con create_module.
4. Asigna responsables usando los nombres de los miembros reales del proyecto. Si el módulo ya tiene responsable, asigna sus tareas a esa persona salvo que el usuario indique otra cosa. Si no hay un responsable claro, deja la tarea sin asignar y dilo.
5. Sé concreto y ejecutivo: tareas accionables, prioridades sensatas, fechas solo si el usuario las menciona o se deducen.
6. Responde SIEMPRE en español, breve y claro. Al final de tu respuesta resume qué hiciste (qué creaste, qué asignaste) o qué encontraste. Usa viñetas si ayuda.
7. Si la petición es ambigua, haz lo razonable y explica tu decisión; pregunta solo si es imposible decidir.
8. El usuario puede adjuntar archivos (documentos, código, CSV, PDFs, imágenes, audio, video). Analízalos como contexto: extrae requerimientos, tareas, datos o lo que pidan sobre ellos. Si de un archivo se derivan tareas o módulos, propónlos o créalos según lo que pida el usuario.`;

  const contents: any[] = history.map((m) => ({
    role: m.role === "model" ? "model" : "user",
    parts: [{ text: String(m.text).slice(0, 4000) }],
  }));

  // Adjunta los archivos al último mensaje del usuario.
  // Imagen / audio / video / PDF → multimodal nativo de Gemini (inlineData).
  // Cualquier otra extensión → se intenta leer como texto y se inyecta como contexto.
  if (rawFiles.length && contents.length) {
    const last = contents[contents.length - 1];
    if (last.role === "user") {
      for (const f of rawFiles) {
        const name = String(f.name ?? "archivo").slice(0, 120);
        const mime = String(f.mimeType ?? "").toLowerCase();
        const native = mime.startsWith("image/") || mime.startsWith("audio/") ||
                       mime.startsWith("video/") || mime === "application/pdf";
        if (native) {
          last.parts.push({ text: `\n[Archivo adjunto: ${name}]` });
          last.parts.push({ inlineData: { mimeType: mime, data: f.data } });
          continue;
        }
        try {
          const buf = Buffer.from(f.data, "base64");
          const text = buf.toString("utf8");
          // Heurística: si hay demasiados caracteres de reemplazo o nulos, es binario ilegible
          const bad = (text.match(/[\uFFFD\u0000]/g) ?? []).length;
          if (text.length === 0 || bad / text.length > 0.05) {
            last.parts.push({ text: `\n[Archivo adjunto "${name}" (${mime || "tipo desconocido"}): es un binario que no puedo leer directamente. Dile al usuario que lo exporte como PDF o texto.]` });
          } else {
            last.parts.push({ text: `\n--- ARCHIVO ADJUNTO: ${name} ---\n${text.slice(0, 150000)}\n--- FIN DE ${name} ---` });
          }
        } catch {
          last.parts.push({ text: `\n[Archivo adjunto "${name}": no se pudo procesar.]` });
        }
      }
    }
  }

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          tools: TOOLS,
          generationConfig: { maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
        }),
      });
      if (!r.ok) {
        const t = await r.text();
        return NextResponse.json({ error: "GEMINI_ERROR", detail: t.slice(0, 300) });
      }
      const data = await r.json();
      const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
      const calls = parts.filter((p) => p.functionCall);

      if (!calls.length) {
        const reply = parts.map((p) => p?.text ?? "").join("").trim();
        return NextResponse.json({ reply: reply || "Hecho.", actions: ctx.actions });
      }

      // Ejecutar las llamadas a herramientas y devolver los resultados al modelo
      contents.push({ role: "model", parts: calls.map((c) => ({ functionCall: c.functionCall })) });
      const responses = [];
      for (const c of calls) {
        const result = await execTool(ctx, c.functionCall.name, c.functionCall.args);
        responses.push({ functionResponse: { name: c.functionCall.name, response: { result } } });
      }
      contents.push({ role: "user", parts: responses });
    }
    return NextResponse.json({
      reply: "Hice parte del trabajo pero alcancé el límite de pasos. Revisa las acciones realizadas y pídeme continuar.",
      actions: ctx.actions,
    });
  } catch (e: any) {
    return NextResponse.json({ error: "FETCH_FAILED", detail: String(e).slice(0, 200), actions: ctx.actions });
  }
}
