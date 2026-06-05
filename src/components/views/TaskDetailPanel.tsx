"use client";

import { useState, useEffect, useRef } from "react";
import { getInitials, type Profile } from "@/lib/profiles";
import { PRIORITY_COLORS, ALERT_COLORS } from "@/lib/constants";
import { computeTaskAlertStatus } from "@/lib/types";
import type { NodeTask, ProjectMember, TaskComment, TaskPriority } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";

interface TaskDetailPanelProps {
  task:        NodeTask;
  nodeTitle:   string;
  nodeIcon:    string;
  members:     ProjectMember[];
  me:          Profile | null;
  canEdit:     boolean;
  onClose:     () => void;
  onToggle:    () => void;
  onDelete:    () => void;
  onUpdate:    (updates: { text?: string; dueDate?: string | null; priority?: TaskPriority; assignedTo?: string | null; description?: string }) => void;
  comments:        TaskComment[];
  loadingComments: boolean;
  onAddComment:    (text: string) => void;
}

export function TaskDetailPanel({
  task, nodeTitle, nodeIcon, members, me,
  canEdit, onClose, onToggle, onDelete, onUpdate,
  comments, loadingComments, onAddComment,
}: TaskDetailPanelProps) {
  const supabase = createClient();

  const [editingName, setEditingName]   = useState(false);
  const [nameVal,     setNameVal]       = useState(task.text);
  const [descVal,     setDescVal]       = useState(task.description ?? "");
  const [commentText, setCommentText]   = useState("");

  /* ── Multi-assignee ── */
  const [assignees,        setAssignees]        = useState<string[]>([]);
  const [loadingAssignees, setLoadingAssignees] = useState(false);

  const nameRef     = useRef<HTMLInputElement>(null);
  const chatEndRef  = useRef<HTMLDivElement>(null);

  /* sync when task changes */
  useEffect(() => {
    setNameVal(task.text);
    setDescVal(task.description ?? "");
  }, [task.id, task.text, task.description]);

  /* Load multi-assignees when task changes */
  useEffect(() => {
    let cancelled = false;
    setLoadingAssignees(true);
    supabase.from("task_assignees").select("user_id").eq("task_id", task.id).then(({ data }) => {
      if (cancelled) return;
      setAssignees((data ?? []).map((r: { user_id: string }) => r.user_id));
      setLoadingAssignees(false);
    });
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments.length]);

  useEffect(() => {
    if (editingName) nameRef.current?.focus();
  }, [editingName]);

  /* Keyboard */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const saveName = () => {
    if (nameVal.trim() && nameVal !== task.text) onUpdate({ text: nameVal.trim() });
    setEditingName(false);
  };

  const saveDesc = () => {
    if (descVal !== (task.description ?? "")) onUpdate({ description: descVal });
  };

  const submitComment = () => {
    if (!commentText.trim()) return;
    onAddComment(commentText.trim());
    setCommentText("");
  };

  const alert   = computeTaskAlertStatus(task);
  const ac      = ALERT_COLORS[alert];
  const pc      = PRIORITY_COLORS[task.priority ?? "normal"];

  return (
    <div className="tdp-wrap">
      {/* ── Top bar ── */}
      <div className="tdp-topbar">
        <button
          className={`tdp-status-btn${task.done ? " done" : ""}`}
          onClick={onToggle}
          title={task.done ? "Marcar pendiente" : "Marcar completada"}
        >
          {task.done ? "✓ Completada" : "○ Pendiente"}
        </button>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          {canEdit && (
            <button className="tdp-icon-btn danger" onClick={onDelete} title="Eliminar tarea">
              🗑
            </button>
          )}
          <button className="tdp-icon-btn" onClick={onClose} title="Cerrar (Esc)">✕</button>
        </div>
      </div>

      <div className="tdp-body">
        {/* ── Task name ── */}
        <div className="tdp-name-row">
          {editingName && canEdit ? (
            <input
              ref={nameRef}
              className="tdp-name-input"
              value={nameVal}
              onChange={(e) => setNameVal(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => { if (e.key === "Enter") saveName(); if (e.key === "Escape") setEditingName(false); }}
            />
          ) : (
            <h2
              className={`tdp-name${task.done ? " done" : ""}${canEdit ? " editable" : ""}`}
              onClick={() => canEdit && setEditingName(true)}
              title={canEdit ? "Clic para editar" : undefined}
            >
              {task.text}
            </h2>
          )}
        </div>

        {/* ── Breadcrumb ── */}
        <div className="tdp-breadcrumb">
          <span>{nodeIcon}</span>
          <span>{nodeTitle}</span>
        </div>

        {/* ── Fields ── */}
        <div className="tdp-fields">

          {/* Assignees (multi) */}
          <div className="tdp-field-row">
            <span className="tdp-field-label">Responsables</span>
            <div className="tdp-field-value" style={{ flexWrap: "wrap", gap: 6 }}>
              {loadingAssignees ? (
                <span style={{ color: "var(--text3)", fontSize: 12 }}>Cargando…</span>
              ) : assignees.length === 0 ? (
                <span style={{ color: "var(--text3)", fontSize: 12 }}>Sin asignar</span>
              ) : (
                assignees.map((uid) => {
                  const m = members.find((mb) => mb.id === uid);
                  if (!m) return null;
                  return (
                    <span key={uid} className="tdp-assignee-chip" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <span className="tdp-avatar-sm" style={{ background: m.color }}>
                        {getInitials(m.full_name || m.email)}
                      </span>
                      <span style={{ fontSize: 12 }}>{m.full_name || m.email}</span>
                      {canEdit && (
                        <button
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", fontSize: 11, padding: "0 2px" }}
                          title={`Quitar a ${m.full_name || m.email}`}
                          onClick={async () => {
                            await supabase.from("task_assignees").delete().eq("task_id", task.id).eq("user_id", uid);
                            const next = assignees.filter((id) => id !== uid);
                            setAssignees(next);
                            onUpdate({ assignedTo: next[0] ?? null });
                          }}
                        >✕</button>
                      )}
                    </span>
                  );
                })
              )}
              {canEdit && (
                <select
                  className="tdp-select"
                  value=""
                  onChange={async (e) => {
                    const uid = e.target.value;
                    if (!uid || assignees.includes(uid)) return;
                    await supabase.from("task_assignees").insert({ task_id: task.id, user_id: uid });
                    const next = [...assignees, uid];
                    setAssignees(next);
                    if (next.length === 1) onUpdate({ assignedTo: uid });
                  }}
                  style={{ fontSize: 12, minWidth: 120 }}
                >
                  <option value="">+ Agregar responsable</option>
                  {members.filter((m) => !assignees.includes(m.id)).map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Due date */}
          <div className="tdp-field-row">
            <span className="tdp-field-label">Fecha límite</span>
            <div className="tdp-field-value">
              {canEdit ? (
                <input
                  type="date"
                  className="tdp-date-input"
                  value={task.dueDate ?? ""}
                  onChange={(e) => onUpdate({ dueDate: e.target.value || null })}
                />
              ) : (
                <span style={{ fontSize: 13, color: "var(--text2)" }}>
                  {task.dueDate ?? "—"}
                </span>
              )}
              {!task.done && task.dueDate && (
                <span className={`task-alert-badge task-alert-${alert}`}
                  style={{ background: ac.bg, color: ac.fg, marginLeft: 8 }}>
                  {ac.label}
                </span>
              )}
            </div>
          </div>

          {/* Priority */}
          <div className="tdp-field-row">
            <span className="tdp-field-label">Prioridad</span>
            <div className="tdp-field-value">
              {canEdit ? (
                <select
                  className="tdp-priority-select"
                  value={task.priority ?? "normal"}
                  style={{ color: pc.fg }}
                  onChange={(e) => onUpdate({ priority: e.target.value as TaskPriority })}
                >
                  <option value="low">🔵 Baja</option>
                  <option value="normal">🟣 Normal</option>
                  <option value="high">🟡 Alta</option>
                  <option value="urgent">🔴 Urgente</option>
                </select>
              ) : (
                <span className="tdp-priority-badge" style={{ background: pc.bg, color: pc.fg }}>
                  {pc.label}
                </span>
              )}
            </div>
          </div>

        </div>

        {/* ── Description ── */}
        <div className="tdp-section">
          <div className="tdp-section-title">Descripción</div>
          {canEdit ? (
            <textarea
              className="tdp-desc-area"
              placeholder="Añade una descripción…"
              value={descVal}
              onChange={(e) => setDescVal(e.target.value)}
              onBlur={saveDesc}
              rows={4}
            />
          ) : (
            <p className="tdp-desc-text">
              {task.description || <span style={{ color: "var(--text3)", fontStyle: "italic" }}>Sin descripción</span>}
            </p>
          )}
        </div>

        {/* ── Comments ── */}
        <div className="tdp-section">
          <div className="tdp-section-title">
            Comentarios
            {comments.length > 0 && (
              <span className="tdp-cmt-count">{comments.length}</span>
            )}
          </div>

          <div className="tdp-comments">
            {loadingComments ? (
              <div className="tdp-cmt-empty">Cargando…</div>
            ) : comments.length === 0 ? (
              <div className="tdp-cmt-empty">Sin comentarios todavía</div>
            ) : (
              comments.map((c) => (
                <div key={c.id} className={`tdp-cmt-row${c.isMe ? " me" : ""}`}>
                  <span className="tdp-avatar-sm" style={{ background: c.userColor, flexShrink: 0 }}>
                    {c.userInitials || getInitials(c.userName)}
                  </span>
                  <div className="tdp-cmt-bubble">
                    <div className="tdp-cmt-meta">
                      <span className="tdp-cmt-user">{c.userName}</span>
                      <span className="tdp-cmt-time">
                        {new Date(c.createdAt).toLocaleDateString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <div className="tdp-cmt-text">{c.text}</div>
                  </div>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Comment input */}
          <div className="tdp-cmt-input-row">
            {me && (
              <span className="tdp-avatar-sm" style={{ background: me.color, flexShrink: 0 }}>
                {getInitials(me.full_name || me.email)}
              </span>
            )}
            <input
              type="text"
              className="tdp-cmt-input"
              placeholder="Escribe un comentario…"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submitComment(); }}
            />
            <button
              className="tdp-cmt-send"
              onClick={submitComment}
              disabled={!commentText.trim()}
            >↑</button>
          </div>
        </div>

      </div>
    </div>
  );
}
