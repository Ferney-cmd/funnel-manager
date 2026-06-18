"use client";

import { useState, useEffect } from "react";
import type { Project } from "@/lib/types";

interface DuplicateModalProps {
  source:   Project;            // proyecto que se va a duplicar
  projects: Project[];          // todos los proyectos (para elegir padre)
  isAdmin:  boolean;            // solo los admin pueden crear proyectos raíz (RLS)
  onClose:  () => void;
  onConfirm: (opts: { name: string; parentProjectId: string | null }) => Promise<void> | void;
}

type Dest = "root" | "sub";

export function DuplicateModal({ source, projects, isAdmin, onClose, onConfirm }: DuplicateModalProps) {
  const [name, setName]       = useState(`${source.name} (copia)`);
  // Los no-admin solo pueden crear subproyectos
  const [dest, setDest]       = useState<Dest>(isAdmin && !source.parentProjectId ? "root" : "sub");
  const [parentId, setParentId] = useState<string>(source.parentProjectId ?? "");
  const [saving, setSaving]   = useState(false);

  // Posibles padres: proyectos raíz (no subproyectos), excluyendo el propio source
  const possibleParents = projects.filter(
    (p) => !p.parentProjectId && p.id !== source.id
  );

  useEffect(() => {
    if (dest === "sub" && !parentId && possibleParents.length > 0) {
      setParentId(possibleParents[0].id);
    }
  }, [dest, parentId, possibleParents]);

  const canSubproject = possibleParents.length > 0;

  async function confirm() {
    if (!name.trim() || saving) return;
    setSaving(true);
    const parent = dest === "sub" ? (parentId || null) : null;
    try {
      await onConfirm({ name: name.trim(), parentProjectId: parent });
    } finally {
      // En éxito el padre desmonta el modal; en error queda abierto para reintentar.
      setSaving(false);
    }
  }

  // Un no-admin sin proyectos donde anidar no puede duplicar
  const blockedNoParent = !isAdmin && !canSubproject;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="dup-modal" onClick={(e) => e.stopPropagation()}>
        <div className="dup-modal-header">
          <span className="dup-modal-title">Duplicar proyecto</span>
          <button className="dup-modal-close" onClick={onClose} title="Cerrar">✕</button>
        </div>

        <p className="dup-modal-sub">
          Se copiarán todos los módulos, tareas, conexiones y zonas de
          {" "}<strong>{source.name}</strong>. Los chats no se copian y las tareas se crean sin completar.
        </p>

        <label className="dup-field">
          <span className="dup-label">Nombre del nuevo proyecto</span>
          <input
            autoFocus
            className="dup-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") confirm(); if (e.key === "Escape") onClose(); }}
            placeholder="Nombre…"
          />
        </label>

        <div className="dup-field">
          <span className="dup-label">¿Dónde lo creo?</span>
          <div className="dup-options">
            {isAdmin && (
              <label className={`dup-option${dest === "root" ? " active" : ""}`}>
                <input
                  type="radio"
                  name="dup-dest"
                  checked={dest === "root"}
                  onChange={() => setDest("root")}
                />
                <div>
                  <div className="dup-option-title">Proyecto independiente</div>
                  <div className="dup-option-desc">Aparece como proyecto principal</div>
                </div>
              </label>
            )}

            <label className={`dup-option${dest === "sub" ? " active" : ""}${!canSubproject ? " disabled" : ""}`}>
              <input
                type="radio"
                name="dup-dest"
                checked={dest === "sub"}
                disabled={!canSubproject}
                onChange={() => setDest("sub")}
              />
              <div>
                <div className="dup-option-title">Subproyecto de…</div>
                <div className="dup-option-desc">
                  {canSubproject ? "Anidado dentro de otro proyecto" : "No hay proyectos principales disponibles"}
                </div>
              </div>
            </label>
          </div>

          {dest === "sub" && canSubproject && (
            <select
              className="dup-select"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              {possibleParents.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}

          {!isAdmin && (
            <div className="dup-note">
              Solo los administradores pueden crear proyectos principales. Tu copia se creará como subproyecto.
            </div>
          )}
          {blockedNoParent && (
            <div className="dup-note dup-note-warn">
              No tienes un proyecto principal donde anidar la copia. Pídele a un administrador que la duplique.
            </div>
          )}
        </div>

        <div className="dup-actions">
          <button className="dup-btn-cancel" onClick={onClose} disabled={saving}>Cancelar</button>
          <button
            className="dup-btn-confirm"
            onClick={confirm}
            disabled={!name.trim() || saving || blockedNoParent || (dest === "sub" && !canSubproject)}
          >
            {saving ? "Duplicando…" : "Duplicar"}
          </button>
        </div>
      </div>
    </div>
  );
}
