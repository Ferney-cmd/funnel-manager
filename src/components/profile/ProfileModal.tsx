"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getInitials, clearProfileCache, type Profile } from "@/lib/profiles";
import { WhatsAppLink } from "./WhatsAppLink";

const COLORS = [
  "#7C3AED", "#10B981", "#3B82F6", "#F59E0B",
  "#E24B4A", "#6366F1", "#EC4899", "#8B5CF6",
  "#0EA5E9", "#14B8A6", "#F97316", "#84CC16",
];

interface ProfileModalProps {
  me:       Profile;
  onClose:  () => void;
  onUpdate: (updated: Profile) => void;
}

export function ProfileModal({ me, onClose, onUpdate }: ProfileModalProps) {
  const supabase = createClient();
  const [name,    setName]    = useState(me.full_name || "");
  const [color,   setColor]   = useState(me.color || "#7C3AED");
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState("");

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) { setError("El nombre no puede estar vacío."); return; }
    setSaving(true);
    setError("");

    const { error: err } = await supabase
      .from("profiles")
      .update({ full_name: trimmed, color })
      .eq("id", me.id);

    if (err) {
      setError("Error al guardar: " + err.message);
      setSaving(false);
      return;
    }

    clearProfileCache();
    onUpdate({ ...me, full_name: trimmed, color });
    onClose();
  }

  const initials = getInitials(name || me.email);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card profile-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Mi perfil</h2>
            <p className="modal-subtitle">Edita tu nombre y color de avatar</p>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ padding: "20px 22px" }}>

        {/* Avatar preview */}
        <div className="profile-avatar-preview">
          <div
            className="profile-avatar-circle"
            style={{ background: color }}
          >
            {initials}
          </div>
          <div className="profile-avatar-info">
            <span className="profile-avatar-name">{name || me.email}</span>
            <span className="profile-avatar-email">{me.email}</span>
          </div>
        </div>

        {/* Name field */}
        <div className="profile-field">
          <label className="profile-label">Nombre completo</label>
          <input
            className="profile-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre"
            autoFocus
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
          />
        </div>

        {/* Email (read-only) */}
        <div className="profile-field">
          <label className="profile-label">Email (no editable)</label>
          <input className="profile-input" value={me.email} readOnly disabled />
        </div>

        {/* Color picker */}
        <div className="profile-field">
          <label className="profile-label">Color de avatar</label>
          <div className="profile-color-grid">
            {COLORS.map((c) => (
              <button
                key={c}
                className={`profile-color-swatch ${color === c ? "selected" : ""}`}
                style={{ background: c }}
                onClick={() => setColor(c)}
                title={c}
              />
            ))}
          </div>
        </div>

        {/* WhatsApp link */}
        <WhatsAppLink />

        {error && <p className="profile-error">{error}</p>}

        {/* Actions */}
        <div className="modal-footer">
          <button className="modal-btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="modal-btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? "Guardando…" : "Guardar cambios"}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}
