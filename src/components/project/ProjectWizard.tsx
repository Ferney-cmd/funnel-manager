"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { getAllProfiles, getInitials, type Profile } from "@/lib/profiles";
import type { TaskPriority } from "@/lib/types";
import { PRIORITY_COLORS } from "@/lib/constants";

type MemberRole = "editor" | "viewer";

interface TaskDraft {
  id:         string;
  text:       string;
  dueDate:    string;
  priority:   TaskPriority;
  assignedTo: string;
}

interface ProjectWizardProps {
  open:              boolean;
  parentProjectId?:  string | null;
  parentProjectName?: string;
  onClose:           () => void;
  onCreated:         (projectId: string) => void;
}

export function ProjectWizard({ open, parentProjectId, parentProjectName, onClose, onCreated }: ProjectWizardProps) {
  const supabase = createClient();
  const [step,   setStep]   = useState(1);
  const [saving, setSaving] = useState(false);

  /* ── Form state ──────────────────────────────────────── */
  const [name,        setName]        = useState("");
  const [description, setDescription] = useState("");
  const [client,      setClient]      = useState("");
  const [startDate,   setStartDate]   = useState("");
  const [endDate,     setEndDate]     = useState("");
  const [memberRoles, setMemberRoles] = useState<Record<string, MemberRole>>({});
  const [tasks,       setTasks]       = useState<TaskDraft[]>([]);

  /* ── Available users ─────────────────────────────────── */
  const [allProfiles, setAllProfiles] = useState<Profile[]>([]);
  useEffect(() => {
    if (!open) return;
    getAllProfiles().then(setAllProfiles);
  }, [open]);

  /* ── Reset on open ───────────────────────────────────── */
  useEffect(() => {
    if (open) {
      setStep(1);
      setName(""); setDescription(""); setClient("");
      setStartDate(""); setEndDate("");
      setMemberRoles({});
      setTasks([]);
    }
  }, [open]);

  if (!open) return null;

  const canNext1  = name.trim().length >= 2;
  const canFinish = canNext1;

  /* ── Member helpers ──────────────────────────────────── */
  const toggleMember = (id: string) => {
    setMemberRoles((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = "editor";
      return next;
    });
  };
  const setRole = (id: string, role: MemberRole) => {
    setMemberRoles((prev) => ({ ...prev, [id]: role }));
  };
  const selectedCount = Object.keys(memberRoles).length;

  /* ── Task helpers ────────────────────────────────────── */
  const addTask = () => setTasks((prev) => [...prev, {
    id:         `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    text:       "",
    dueDate:    "",
    priority:   "normal",
    assignedTo: "",
  }]);
  const updateTask = (id: string, patch: Partial<TaskDraft>) =>
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, ...patch } : t));
  const removeTask  = (id: string) =>
    setTasks((prev) => prev.filter((t) => t.id !== id));

  /* ── Selected members for assignee picker ────────────── */
  const selectedMembers = allProfiles.filter((p) => memberRoles[p.id]);

  /* ── Submit ──────────────────────────────────────────── */
  const handleCreate = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sin sesión activa");

      const { data: project, error: projErr } = await supabase
        .from("projects")
        .insert({
          user_id:           user.id,
          parent_project_id: parentProjectId ?? null,
          name:              name.trim(),
          description:       description.trim(),
          client:            client.trim(),
          status:            "draft",
          start_date:        startDate || null,
          end_date:          endDate   || null,
        })
        .select().single();

      if (projErr || !project) throw new Error(projErr?.message ?? "Error al crear el proyecto");

      /* Members */
      if (selectedCount > 0) {
        const rows = Object.entries(memberRoles).map(([uid, role]) => ({
          project_id: project.id,
          user_id:    uid,
          role,
          invited_by: user.id,
        }));
        await supabase.from("project_members").insert(rows);
      }

      /* Initial tasks → "Inicio del proyecto" node */
      const validTasks = tasks.filter((t) => t.text.trim().length > 0);
      if (validTasks.length > 0) {
        const initialNodeId = `node-${Date.now()}`;
        await supabase.from("funnel_nodes").insert({
          id:          initialNodeId,
          project_id:  project.id,
          title:       "Inicio del proyecto",
          subtitle:    "Tareas definidas en el setup",
          icon:        "🚀",
          role:        "pm",
          position_x:  80,
          position_y:  160,
        });

        const taskRows = validTasks.map((t, i) => ({
          id:          `task-${Date.now()}-${i}`,
          node_id:     initialNodeId,
          text:        t.text.trim(),
          done:        false,
          ord:         i,
          due_date:    t.dueDate    || null,
          priority:    t.priority,
          assigned_to: t.assignedTo || null,
        }));
        await supabase.from("node_tasks").insert(taskRows);
      }

      onCreated(project.id);
      onClose();
    } catch (err: any) {
      alert("Error al crear el proyecto: " + (err?.message ?? err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="wizard-modal" onClick={(e) => e.stopPropagation()}>

        {/* ── Header ── */}
        <div className="wizard-header">
          <div>
            <div className="wizard-title">
              {parentProjectId ? "Nuevo proyecto" : "Nuevo cliente"}
            </div>
            {parentProjectName && (
              <div className="wizard-subtitle">dentro de · {parentProjectName}</div>
            )}
          </div>
          <button className="wizard-close" onClick={onClose}>✕</button>
        </div>

        {/* ── Step indicators ── */}
        <div className="wizard-steps">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className={`wizard-step ${step === n ? "active" : step > n ? "done" : ""}`}>
              <div className="wizard-step-num">{step > n ? "✓" : n}</div>
              <div className="wizard-step-label">
                {n === 1 ? "Información" : n === 2 ? "Fechas" : n === 3 ? "Equipo" : "Tareas iniciales"}
              </div>
            </div>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="wizard-body">

          {/* Step 1 — Info */}
          {step === 1 && (
            <div className="wizard-form">
              <label className="wizard-label">
                {parentProjectId ? "Nombre del proyecto *" : "Nombre del cliente *"}
                <input
                  type="text" className="wizard-input"
                  placeholder="Ej: Lanzamiento Webinar Q2"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </label>
              <label className="wizard-label">
                Descripción
                <textarea
                  className="wizard-textarea"
                  placeholder="Breve descripción del objetivo del proyecto..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                />
              </label>
              <label className="wizard-label">
                Cliente / Marca
                <input
                  type="text" className="wizard-input"
                  placeholder="Ej: Closers Digitales"
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                />
              </label>
            </div>
          )}

          {/* Step 2 — Dates */}
          {step === 2 && (
            <div className="wizard-form">
              <p className="wizard-hint">
                Define la duración del proyecto. Las tareas con fechas cercanas generarán alertas de color automáticamente.
              </p>
              <div className="wizard-grid-2">
                <label className="wizard-label">
                  📅 Fecha de inicio
                  <input
                    type="date" className="wizard-input"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </label>
                <label className="wizard-label">
                  🏁 Fecha de meta / cierre
                  <input
                    type="date" className="wizard-input"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    min={startDate || undefined}
                  />
                </label>
              </div>
              {startDate && endDate && (
                <div className="wizard-duration">
                  Duración estimada: <strong>
                    {Math.max(0, Math.ceil(
                      (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000
                    ))} días
                  </strong>
                </div>
              )}
            </div>
          )}

          {/* Step 3 — Team with roles */}
          {step === 3 && (
            <div className="wizard-form">
              <p className="wizard-hint">
                Selecciona los usuarios que tendrán acceso y asígnales un rol. Tú quedas como dueño automáticamente.
              </p>
              <div className="wizard-members">
                {allProfiles.length === 0 ? (
                  <div className="wizard-empty">No hay otros usuarios registrados en la plataforma.</div>
                ) : allProfiles.map((p) => {
                  const isSelected = !!memberRoles[p.id];
                  return (
                    <div key={p.id} className={`wizard-member-row${isSelected ? " selected" : ""}`}>
                      <button
                        className="wizard-member-toggle"
                        onClick={() => toggleMember(p.id)}
                      >
                        <span className="wizard-member-avatar" style={{ background: p.color }}>
                          {getInitials(p.full_name || p.email)}
                        </span>
                        <span className="wizard-member-info">
                          <span className="wizard-member-name">{p.full_name || p.email}</span>
                          {p.full_name && <span className="wizard-member-email">{p.email}</span>}
                        </span>
                        <span className="wizard-member-check">
                          {isSelected ? "✓" : ""}
                        </span>
                      </button>
                      {isSelected && (
                        <div className="wizard-role-picker">
                          <button
                            className={`wizard-role-btn${memberRoles[p.id] === "editor" ? " active" : ""}`}
                            onClick={() => setRole(p.id, "editor")}
                          >✏️ Editor</button>
                          <button
                            className={`wizard-role-btn${memberRoles[p.id] === "viewer" ? " active" : ""}`}
                            onClick={() => setRole(p.id, "viewer")}
                          >👁 Solo lectura</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="wizard-counter">
                {selectedCount} usuario{selectedCount === 1 ? "" : "s"} seleccionado{selectedCount === 1 ? "" : "s"}
              </div>
            </div>
          )}

          {/* Step 4 — Initial tasks */}
          {step === 4 && (
            <div className="wizard-form">
              <p className="wizard-hint">
                Define las tareas iniciales. Se crearán en un módulo "Inicio del proyecto" que podrás reorganizar después.
              </p>
              <div className="wizard-tasks">
                {tasks.length === 0 && (
                  <div className="wizard-empty">Sin tareas todavía — es opcional, puedes saltarlo.</div>
                )}
                {tasks.map((t) => (
                  <div key={t.id} className="wizard-task-row">
                    <input
                      type="text"
                      className="wizard-input wizard-task-input"
                      placeholder="Descripción de la tarea"
                      value={t.text}
                      onChange={(e) => updateTask(t.id, { text: e.target.value })}
                    />
                    <div className="wizard-task-meta">
                      <select
                        className="wizard-input wizard-task-priority"
                        value={t.priority}
                        style={{ color: PRIORITY_COLORS[t.priority].fg }}
                        onChange={(e) => updateTask(t.id, { priority: e.target.value as TaskPriority })}
                      >
                        <option value="low">🔵 Baja</option>
                        <option value="normal">🟣 Normal</option>
                        <option value="high">🟡 Alta</option>
                        <option value="urgent">🔴 Urgente</option>
                      </select>
                      <input
                        type="date"
                        className="wizard-input wizard-task-date"
                        value={t.dueDate}
                        onChange={(e) => updateTask(t.id, { dueDate: e.target.value })}
                        min={startDate || undefined}
                        max={endDate   || undefined}
                        title="Fecha límite"
                      />
                      {selectedMembers.length > 0 && (
                        <select
                          className="wizard-input wizard-task-assignee"
                          value={t.assignedTo}
                          onChange={(e) => updateTask(t.id, { assignedTo: e.target.value })}
                          title="Asignar a..."
                        >
                          <option value="">Sin asignar</option>
                          {selectedMembers.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.full_name || m.email}
                            </option>
                          ))}
                        </select>
                      )}
                      <button className="wizard-task-remove" onClick={() => removeTask(t.id)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
              <button className="wizard-add-task-btn" onClick={addTask}>
                + Agregar tarea
              </button>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="wizard-footer">
          <button
            className="wizard-btn-ghost"
            onClick={step > 1 ? () => setStep(step - 1) : onClose}
            disabled={saving}
          >
            {step > 1 ? "← Atrás" : "Cancelar"}
          </button>
          {step < 4 ? (
            <button
              className="wizard-btn-primary"
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && !canNext1}
            >
              Siguiente →
            </button>
          ) : (
            <button
              className="wizard-btn-primary"
              onClick={handleCreate}
              disabled={!canFinish || saving}
            >
              {saving ? "Creando…" : (parentProjectId ? "Crear proyecto ✓" : "Crear cliente ✓")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
