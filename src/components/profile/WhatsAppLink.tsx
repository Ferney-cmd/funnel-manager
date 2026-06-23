"use client";

import { useState, useEffect, useCallback } from "react";

interface Status {
  whatsapp: { linked: boolean; phone: string | null };
  telegram: { linked: boolean; username: string | null };
}

export function WhatsAppLink() {
  const [status,  setStatus]  = useState<Status | null>(null);
  const [code,    setCode]    = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err,     setErr]     = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/whatsapp/link-code");
      if (r.ok) setStatus(await r.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { load(); }, [load]);

  const generate = async () => {
    setLoading(true); setErr("");
    try {
      const r = await fetch("/api/whatsapp/link-code", { method: "POST" });
      const d = await r.json();
      if (d.code) setCode(d.code);
      else setErr("No se pudo generar el código.");
    } catch { setErr("Error de conexión."); }
    finally { setLoading(false); }
  };

  const unlink = async () => {
    if (!confirm("¿Desvincular tus chats del asistente?")) return;
    setLoading(true);
    try {
      await fetch("/api/whatsapp/link-code", { method: "DELETE" });
      setCode(null);
      await load();
    } finally { setLoading(false); }
  };

  const waOn = status?.whatsapp.linked;
  const tgOn = status?.telegram.linked;
  const anyOn = waOn || tgOn;

  return (
    <div className="profile-field">
      <label className="profile-label">Asistente por chat (Telegram / WhatsApp)</label>

      {code ? (
        <div className="wa-link-box wa-link-code-box">
          <div className="wa-link-sub" style={{ marginBottom: 6 }}>
            Envía este código al bot del asistente (Telegram o WhatsApp):
          </div>
          <div className="wa-link-code">{code}</div>
          <div className="wa-link-sub" style={{ marginTop: 6 }}>
            Válido 15 minutos. Cuando el bot confirme, quedará vinculado.
          </div>
        </div>
      ) : anyOn ? (
        <div className="wa-link-box wa-link-ok">
          <div style={{ flex: 1 }}>
            <div className="wa-link-title">✅ Asistente vinculado</div>
            <div className="wa-link-sub">
              {tgOn && <span>Telegram{status?.telegram.username ? ` @${status.telegram.username}` : ""}</span>}
              {tgOn && waOn && " · "}
              {waOn && <span>WhatsApp +{status?.whatsapp.phone}</span>}
            </div>
          </div>
          <button className="wa-link-btn-ghost" onClick={unlink} disabled={loading}>
            Desvincular
          </button>
        </div>
      ) : (
        <div className="wa-link-box">
          <div className="wa-link-sub" style={{ flex: 1 }}>
            Gestiona tus tareas y recibe tu resumen diario desde el chat.
          </div>
          <button className="wa-link-btn" onClick={generate} disabled={loading}>
            {loading ? "Generando…" : "Generar código"}
          </button>
        </div>
      )}
      {anyOn && !code && (
        <button className="wa-link-btn-ghost" style={{ marginTop: 8 }} onClick={generate} disabled={loading}>
          + Vincular otro chat
        </button>
      )}
      {err && <p className="profile-error">{err}</p>}
    </div>
  );
}
