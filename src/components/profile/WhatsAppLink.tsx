"use client";

import { useState, useEffect, useCallback } from "react";

interface Status { linked: boolean; phone: string | null; linkedAt: string | null; }

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
    if (!confirm("¿Desvincular tu WhatsApp del asistente?")) return;
    setLoading(true);
    try {
      await fetch("/api/whatsapp/link-code", { method: "DELETE" });
      setCode(null);
      await load();
    } finally { setLoading(false); }
  };

  return (
    <div className="profile-field">
      <label className="profile-label">Asistente por WhatsApp</label>

      {status?.linked ? (
        <div className="wa-link-box wa-link-ok">
          <div>
            <div className="wa-link-title">✅ WhatsApp vinculado</div>
            <div className="wa-link-sub">+{status.phone}</div>
          </div>
          <button className="wa-link-btn-ghost" onClick={unlink} disabled={loading}>
            Desvincular
          </button>
        </div>
      ) : code ? (
        <div className="wa-link-box wa-link-code-box">
          <div className="wa-link-sub" style={{ marginBottom: 6 }}>
            Envía este código por WhatsApp al número del asistente:
          </div>
          <div className="wa-link-code">{code}</div>
          <div className="wa-link-sub" style={{ marginTop: 6 }}>
            Válido 15 minutos. Cuando el bot confirme, quedará vinculado.
          </div>
        </div>
      ) : (
        <div className="wa-link-box">
          <div className="wa-link-sub" style={{ flex: 1 }}>
            Gestiona tus tareas y recibe tu resumen diario desde WhatsApp.
          </div>
          <button className="wa-link-btn" onClick={generate} disabled={loading}>
            {loading ? "Generando…" : "Generar código"}
          </button>
        </div>
      )}
      {err && <p className="profile-error">{err}</p>}
    </div>
  );
}
