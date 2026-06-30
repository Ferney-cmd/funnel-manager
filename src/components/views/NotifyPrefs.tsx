"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

interface Prefs {
  morning_enabled: boolean;
  morning_time: string;
  night_enabled: boolean;
  night_time: string;
}

const DEFAULTS: Prefs = {
  morning_enabled: true, morning_time: "08:00",
  night_enabled: true, night_time: "18:00",
};

export function NotifyPrefs({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const sb = createClient();
      const { data } = await sb
        .from("notify_prefs")
        .select("morning_enabled, morning_time, night_enabled, night_time")
        .eq("user_id", userId)
        .maybeSingle();
      if (!alive) return;
      if (data) {
        setPrefs({
          morning_enabled: !!data.morning_enabled,
          morning_time: (data.morning_time || "08:00").slice(0, 5),
          night_enabled: !!data.night_enabled,
          night_time: (data.night_time || "18:00").slice(0, 5),
        });
      }
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [userId]);

  // Cerrar al hacer click afuera
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    const sb = createClient();
    const { error } = await sb.from("notify_prefs").upsert(
      {
        user_id: userId,
        morning_enabled: prefs.morning_enabled,
        morning_time: prefs.morning_time,
        night_enabled: prefs.night_enabled,
        night_time: prefs.night_time,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    setSaving(false);
    if (error) { alert("No se pudo guardar: " + error.message); return; }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const activeCount = (prefs.morning_enabled ? 1 : 0) + (prefs.night_enabled ? 1 : 0);

  return (
    <div className="np-wrap" ref={wrapRef}>
      <button
        className={`np-btn ${activeCount ? "active" : ""}`}
        onClick={() => setOpen((o) => !o)}
        title="Notificaciones por Telegram"
      >
        🔔 Notificaciones{activeCount ? ` · ${activeCount}` : ""}
      </button>

      {open && (
        <div className="np-pop">
          <div className="np-pop-title">Recordatorios por Telegram</div>
          <p className="np-pop-sub">Te escribo a tu Telegram a la hora que elijas.</p>

          <label className="np-row">
            <input
              type="checkbox"
              checked={prefs.morning_enabled}
              onChange={(e) => setPrefs((p) => ({ ...p, morning_enabled: e.target.checked }))}
            />
            <span className="np-row-label">🌅 En la mañana</span>
            <input
              type="time"
              className="np-time"
              value={prefs.morning_time}
              disabled={!prefs.morning_enabled}
              onChange={(e) => setPrefs((p) => ({ ...p, morning_time: e.target.value }))}
            />
          </label>
          <div className="np-hint">Con cuántas tareas empiezas el día.</div>

          <label className="np-row">
            <input
              type="checkbox"
              checked={prefs.night_enabled}
              onChange={(e) => setPrefs((p) => ({ ...p, night_enabled: e.target.checked }))}
            />
            <span className="np-row-label">🌙 En la noche</span>
            <input
              type="time"
              className="np-time"
              value={prefs.night_time}
              disabled={!prefs.night_enabled}
              onChange={(e) => setPrefs((p) => ({ ...p, night_time: e.target.value }))}
            />
          </label>
          <div className="np-hint">Cuántas completaste y cuántas quedan.</div>

          <button className="np-save" onClick={save} disabled={saving || !loaded}>
            {saving ? "Guardando…" : saved ? "✓ Guardado" : "Guardar"}
          </button>
        </div>
      )}
    </div>
  );
}
