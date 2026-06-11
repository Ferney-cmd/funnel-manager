"use client";

import { useState, useRef, useEffect, useCallback } from "react";

interface CopilotMessage {
  role: "user" | "model";
  text: string;
  actions?: string[];
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

export function CopilotPanel({ open, projectId, projectName, onClose, onActionsApplied }: CopilotPanelProps) {
  const [messagesByProject, setMessagesByProject] = useState<Record<string, CopilotMessage[]>>({});
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);
  const listRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const messages = messagesByProject[projectId] ?? [];

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading || !projectId) return;

    const userMsg: CopilotMessage = { role: "user", text: trimmed };
    const history = [...(messagesByProject[projectId] ?? []), userMsg];
    setMessagesByProject((prev) => ({ ...prev, [projectId]: history }));
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          messages: history.map((m) => ({ role: m.role, text: m.text })),
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
  }, [loading, projectId, messagesByProject, onActionsApplied]);

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
              Pídemelo en lenguaje natural.
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

      <div className="copilot-input-row">
        <textarea
          ref={inputRef}
          className="copilot-input"
          placeholder="Pídeme algo… ej: crea las tareas para las 2 páginas de gracias"
          value={input}
          rows={2}
          disabled={loading}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <button
          className="copilot-send"
          disabled={loading || !input.trim()}
          onClick={() => send(input)}
          title="Enviar (Enter)"
        >↑</button>
      </div>
    </div>
  );
}
