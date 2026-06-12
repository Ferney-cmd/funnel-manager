"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface CopilotMessage {
  role: "user" | "model";
  text: string;
  actions?: string[];
  attachments?: string[];
}

interface AttachedFile {
  name: string;
  mimeType: string;
  data: string; // base64 sin prefijo
  size: number;
}

interface CopilotPanelProps {
  open:             boolean;
  projectId:        string;
  projectName:      string;
  onClose:          () => void;
  /** Se llama cuando el agente ejecutó acciones que cambian datos (para refrescar) */
  onActionsApplied: () => void;
}

const SUGGESTIONS = [
  "¿Cómo va el proyecto? Dame un resumen ejecutivo",
  "¿Qué tareas están vencidas o en riesgo?",
  "¿Qué le falta a cada miembro del equipo?",
  "Revisa el embudo y dime qué módulos faltan",
];

const MAX_FILE_MB = 12;
const MAX_TOTAL_MB = 16;

function fileIcon(mime: string, name: string) {
  if (mime.startsWith("image/")) return "🖼";
  if (mime.startsWith("audio/")) return "🎵";
  if (mime.startsWith("video/")) return "🎬";
  if (mime === "application/pdf" || name.toLowerCase().endsWith(".pdf")) return "📕";
  return "📄";
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function CopilotPanel({ open, projectId, projectName, onClose, onActionsApplied }: CopilotPanelProps) {
  const [messagesByProject, setMessagesByProject] = useState<Record<string, CopilotMessage[]>>({});
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const [files,   setFiles]   = useState<AttachedFile[]>([]);
  const [fileErr, setFileErr] = useState("");
  const listRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef  = useRef<HTMLInputElement>(null);

  const messages = messagesByProject[projectId] ?? [];

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const addFiles = useCallback(async (incoming: File[]) => {
    setFileErr("");
    const current = [...files];
    for (const f of incoming) {
      if (current.length >= 8) { setFileErr("Máximo 8 archivos por mensaje."); break; }
      if (f.size > MAX_FILE_MB * 1024 * 1024) {
        setFileErr(`"${f.name}" supera los ${MAX_FILE_MB} MB.`);
        continue;
      }
      const total = current.reduce((s, x) => s + x.size, 0) + f.size;
      if (total > MAX_TOTAL_MB * 1024 * 1024) {
        setFileErr(`Los adjuntos superan los ${MAX_TOTAL_MB} MB en total.`);
        break;
      }
      try {
        const data = await readAsBase64(f);
        current.push({
          name: f.name || "pegado",
          mimeType: f.type || "application/octet-stream",
          data,
          size: f.size,
        });
      } catch {
        setFileErr(`No se pudo leer "${f.name}".`);
      }
    }
    setFiles(current);
  }, [files]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items);
    const pasted: File[] = [];
    for (const it of items) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) {
          // pegados sin nombre (capturas) → nombre legible
          const ext = (f.type.split("/")[1] ?? "bin").split(";")[0];
          pasted.push(f.name && f.name !== "image.png" ? f : new File([f], `pegado-${Date.now()}.${ext}`, { type: f.type }));
        }
      }
    }
    if (pasted.length) {
      e.preventDefault();
      addFiles(pasted);
    }
  }, [addFiles]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if ((!trimmed && files.length === 0) || loading || !projectId) return;

    const sendFiles = files;
    const userMsg: CopilotMessage = {
      role: "user",
      text: trimmed || "(archivos adjuntos)",
      attachments: sendFiles.map((f) => f.name),
    };
    const history = [...(messagesByProject[projectId] ?? []), userMsg];
    setMessagesByProject((prev) => ({ ...prev, [projectId]: history }));
    setInput("");
    setFiles([]);
    setFileErr("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          messages: history.map((m) => ({
            role: m.role,
            // el historial conserva una marca de los adjuntos anteriores
            text: m.attachments?.length && m !== userMsg
              ? `${m.text}\n[adjuntó: ${m.attachments.join(", ")}]`
              : m.text,
          })),
          files: sendFiles.map((f) => ({ name: f.name, mimeType: f.mimeType, data: f.data })),
        }),
      });
      const data = await res.json();

      let reply: CopilotMessage;
      if (data.error) {
        reply = {
          role: "model",
          text: data.error === "AI_NOT_CONFIGURED"
            ? "⚠ La IA no está configurada. Configura GEMINI_API_KEY en EasyPanel."
            : `⚠ Error: ${data.detail || data.error}`,
          actions: data.actions ?? [],
        };
      } else {
        reply = { role: "model", text: data.reply, actions: data.actions ?? [] };
      }
      setMessagesByProject((prev) => ({
        ...prev,
        [projectId]: [...(prev[projectId] ?? []), reply],
      }));
      if (reply.actions && reply.actions.length > 0) onActionsApplied();
    } catch {
      setMessagesByProject((prev) => ({
        ...prev,
        [projectId]: [...(prev[projectId] ?? []), { role: "model", text: "⚠ Error de conexión. Intenta de nuevo." }],
      }));
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  }, [loading, projectId, messagesByProject, onActionsApplied, files]);

  if (!open) return null;

  return (
    <div className="copilot-panel">
      <div className="copilot-header">
        <span className="copilot-header-icon">✦</span>
        <div className="copilot-header-text">
          <span className="copilot-title">IA Copilot</span>
          <span className="copilot-subtitle">{projectName}</span>
        </div>
        <button className="copilot-close" onClick={onClose} title="Cerrar">✕</button>
      </div>

      <div className="copilot-messages" ref={listRef}>
        {messages.length === 0 && (
          <div className="copilot-empty">
            <div className="copilot-empty-icon">✦</div>
            <p className="copilot-empty-title">¿En qué te ayudo?</p>
            <p className="copilot-empty-desc">
              Puedo revisar el estado del proyecto, crear módulos y tareas,
              asignarlas al miembro correcto del equipo y detectar riesgos.
              También puedes adjuntar o pegar archivos (docs, PDFs, imágenes,
              audio, video) para darme contexto.
            </p>
            <div className="copilot-suggestions">
              {SUGGESTIONS.map((s) => (
                <button key={s} className="copilot-suggestion" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`copilot-msg ${m.role === "user" ? "copilot-msg-user" : "copilot-msg-ai"}`}>
            {m.role === "model" && <span className="copilot-msg-avatar">✦</span>}
            <div className="copilot-msg-body">
              <div className="copilot-msg-text">{m.text}</div>
              {m.attachments && m.attachments.length > 0 && (
                <div className="copilot-attachments">
                  {m.attachments.map((a, j) => (
                    <span key={j} className="copilot-attachment">📎 {a}</span>
                  ))}
                </div>
              )}
              {m.actions && m.actions.length > 0 && (
                <div className="copilot-actions">
                  {m.actions.map((a, j) => (
                    <div key={j} className="copilot-action">✓ {a}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="copilot-msg copilot-msg-ai">
            <span className="copilot-msg-avatar">✦</span>
            <div className="copilot-msg-body">
              <div className="copilot-typing">
                <span /><span /><span />
              </div>
            </div>
          </div>
        )}
      </div>

      {(files.length > 0 || fileErr) && (
        <div className="copilot-files-row">
          {files.map((f, i) => (
            <span key={i} className="copilot-file-chip" title={`${f.name} (${(f.size / 1024).toFixed(0)} KB)`}>
              <span className="copilot-file-icon">{fileIcon(f.mimeType, f.name)}</span>
              <span className="copilot-file-name">{f.name}</span>
              <button
                className="copilot-file-remove"
                title="Quitar"
                onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
              >✕</button>
            </span>
          ))}
          {fileErr && <span className="copilot-file-error">{fileErr}</span>}
        </div>
      )}

      <div className="copilot-input-row">
        <input
          ref={fileRef}
          type="file"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            const list = Array.from(e.target.files ?? []);
            if (list.length) addFiles(list);
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
        <button
          className="copilot-attach"
          title="Adjuntar archivos (cualquier tipo) — también puedes pegarlos con Ctrl+V"
          disabled={loading}
          onClick={() => fileRef.current?.click()}
        >📎</button>
        <textarea
          ref={inputRef}
          className="copilot-input"
          placeholder="Pídeme algo… o pega/adjunta archivos para darme contexto"
          value={input}
          rows={2}
          disabled={loading}
          onChange={(e) => setInput(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <button
          className="copilot-send"
          disabled={loading || (!input.trim() && files.length === 0)}
          onClick={() => send(input)}
          title="Enviar (Enter)"
        >↑</button>
      </div>
    </div>
  );
}
