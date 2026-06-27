"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getInbox, listProjects } from "@/lib/agent/taskOps";
import { PRIORITY_COLORS } from "@/lib/constants";
import type { Profile } from "@/lib/profiles";

export const INBOX_NAME = "📥 Bandeja de entrada";

interface ProjectRow {
  id: string;
  name: string;
  parent_project_id: string | null;
}
interface ModuleRow {
  id: string;
  title: string;
  icon: string | null;
}

type Priority = keyof typeof PRIORITY_COLORS;
type TaskType = "personal" | "project";

export interface EditTask {
  id: string;
  text: string;
  dueDate: string | null;
  priority: Priority;
  projectId: string;
  nodeId: string;
  projectName: string;
}

interface QuickTaskModalProps {
  me: Profile;
  task?: EditTask | null; // si viene → modo edición
  onClose: () => void;
  onSaved: () => void;
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function QuickTaskModal({ me, task, onClose, onSaved }: QuickTaskModalProps) {
  const supabase = createClient();
  const editing = !!task;
  const startsPersonal = !task || task.projectName === INBOX_NAME;

  const [titulo, setTitulo] = useState(task?.text ?? "");
  const [type, setType] = useState<TaskType>(startsPersonal ? "personal" : "project");
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [projectId, setProjectId] = useState(startsPersonal ? "" : task!.projectId);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [moduleId, setModuleId] = useState(startsPersonal ? "" : task!.nodeId);
  const [fecha, setFecha] = useState(task?.dueDate ?? "");
  const [priority, setPriority] = useState<Priority>(task?.priority ?? "normal");
  const [loadingModules, setLoadingModules] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar proyectos accesibles (sin la bandeja de entrada)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rows = await listProjects(supabase, me.id);
        if (cancelled) return;
        setProjects((rows as ProjectRow[]).filter((p) => p.name !== INBOX_NAME));
      } catch {
        /* noop */
      }
    })();
    return () => { cancelled = true; };
  }, [me.id, supabase]);

  // Cargar módulos del proyecto elegido (preselecciona el actual al editar)
  useEffect(() => {
    if (type !== "project" || !projectId) {
      setModules([]);
      setModuleId("");
      return;
    }
    let cancelled = false;
    setLoadingModules(true);
    (async () => {
      const { data } = await supabase
        .from("funnel_nodes")
        .select("id, title, icon")
        .eq("project_id", projectId)
        .order("position_x");
      if (cancelled) return;
      const mods = (data ?? []) as ModuleRow[];
      setModules(mods);
      setModuleId((prev) => (prev && mods.some((m) => m.id === prev) ? prev : mods[0]?.id ?? ""));
      setLoadingModules(false);
    })();
    return () => { cancelled = true; };
  }, [type, projectId, supabase]);

  const canSave =
    titulo.trim().length > 0 &&
    !saving &&
    !deleting &&
    (type === "personal" || (!!projectId && !!moduleId));

  async function resolveTarget(): Promise<{ nodeId: string; projectId: string } | { error: string }> {
    if (type === "personal") {
      const inbox = await getInbox(supabase, me.id);
      if ("error" in inbox) return { error: inbox.error };
      return { nodeId: inbox.nodeId, projectId: inbox.projectId };
    }
    return { nodeId: moduleId, projectId };
  }

  async function handleSubmit() {
    if (!canSave) return;
    setSaving(true);
    setError(null);

    const target = await resolveTarget();
    if ("error" in target) { setError(target.error); setSaving(false); return; }

    const due = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null;

    if (editing) {
      const { error: updErr } = await supabase
        .from("node_tasks")
        .update({
          text: titulo.trim().slice(0, 300),
          due_date: due,
          priority,
          node_id: target.nodeId,
          project_id: target.projectId,
        })
        .eq("id", task!.id);
      if (updErr) { setError("No se pudo guardar: " + updErr.message); setSaving(false); return; }
    } else {
      const { data: existing } = await supabase.from("node_tasks").select("ord").eq("node_id", target.nodeId);
      const ord = (existing ?? []).length;
      const { error: insErr } = await supabase.from("node_tasks").insert({
        id: `t-${uid()}`,
        node_id: target.nodeId,
        project_id: target.projectId,
        text: titulo.trim().slice(0, 300),
        done: false,
        ord,
        priority,
        due_date: due,
        assigned_to: me.id,
        description: "",
      });
      if (insErr) { setError("No se pudo crear la tarea: " + insErr.message); setSaving(false); return; }
    }
    onSaved();
    onClose();
  }

  async function handleDelete() {
    if (!editing) return;
    if (!window.confirm(`¿Eliminar la tarea "${task!.text}"? No se puede deshacer.`)) return;
    setDeleting(true);
    setError(null);
    const { error: delErr } = await supabase.from("node_tasks").delete().eq("id", task!.id);
    if (delErr) { setError("No se pudo eliminar: " + delErr.message); setDeleting(false); return; }
    onSaved();
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{editing ? "Editar tarea" : "Nueva tarea"}</div>
            <div className="modal-subtitle">Personal o asignada a un módulo de un proyecto</div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-section">
          <div className="modal-section-label">Título</div>
          <input
            className="modal-input"
            type="text"
            placeholder="¿Qué hay que hacer?"
            value={titulo}
            autoFocus
            onChange={(e) => setTitulo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && canSave) handleSubmit(); }}
          />
        </div>

        <div className="modal-section">
          <div className="modal-section-label">Tipo de tarea</div>
          <div className="qt-toggle">
            <button
              className={`qt-toggle-btn ${type === "personal" ? "active" : ""}`}
              onClick={() => setType("personal")}
            >
              🏠 Personal
            </button>
            <button
              className={`qt-toggle-btn ${type === "project" ? "active" : ""}`}
              onClick={() => setType("project")}
            >
              📁 De un proyecto
            </button>
          </div>

          {type === "personal" ? (
            <p className="qt-hint">Irá a tu bandeja personal. Solo tú la ves.</p>
          ) : (
            <div className="qt-fields">
              <label className="qt-field">
                <span>Cliente / Proyecto</span>
                <select
                  className="modal-input"
                  value={projectId}
                  onChange={(e) => setProjectId(e.target.value)}
                >
                  <option value="">Selecciona…</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.parent_project_id ? "↳ " : ""}{p.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="qt-field">
                <span>Módulo</span>
                <select
                  className="modal-input"
                  value={moduleId}
                  disabled={!projectId || loadingModules}
                  onChange={(e) => setModuleId(e.target.value)}
                >
                  {loadingModules ? (
                    <option>Cargando…</option>
                  ) : modules.length === 0 ? (
                    <option value="">{projectId ? "Sin módulos — se creará uno" : "Elige un proyecto"}</option>
                  ) : (
                    modules.map((m) => (
                      <option key={m.id} value={m.id}>
                        {(m.icon || "📦") + " " + m.title}
                      </option>
                    ))
                  )}
                </select>
              </label>
            </div>
          )}
        </div>

        <div className="modal-section">
          <div className="modal-section-label">Detalles</div>
          <div className="qt-fields">
            <label className="qt-field">
              <span>Fecha límite</span>
              <input
                className="modal-input"
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
              />
            </label>
            <label className="qt-field">
              <span>Prioridad</span>
              <select
                className="modal-input"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
              >
                {(Object.keys(PRIORITY_COLORS) as Priority[]).map((k) => (
                  <option key={k} value={k}>{PRIORITY_COLORS[k].label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {error && (
          <div className="modal-section" style={{ color: "#E24B4A", fontSize: 12.5 }}>
            ⚠ {error}
          </div>
        )}

        <div className="modal-footer">
          {editing && (
            <button
              className="modal-btn-secondary"
              onClick={handleDelete}
              disabled={saving || deleting}
              style={{ marginRight: "auto", color: "#E24B4A", borderColor: "#E24B4A55" }}
            >
              {deleting ? "Eliminando…" : "🗑 Eliminar"}
            </button>
          )}
          <button className="modal-btn-secondary" onClick={onClose} disabled={saving || deleting}>
            Cancelar
          </button>
          <button className="modal-btn-primary" onClick={handleSubmit} disabled={!canSave}>
            {saving ? "Guardando…" : editing ? "Guardar cambios" : "Crear tarea"}
          </button>
        </div>
      </div>
    </div>
  );
}
