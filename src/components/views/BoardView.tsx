"use client";

import { useState, useCallback, useEffect } from "react";
import type { Node } from "reactflow";
import type { FunnelNodeData, ProjectMember, Project, TaskPriority, ProjectRole } from "@/lib/types";
import { ROLE_LABELS, ROLE_COLORS, ALERT_COLORS, PRIORITY_COLORS } from "@/lib/constants";
import { computeTaskAlertStatus } from "@/lib/types";
import { getInitials, type Profile } from "@/lib/profiles";
import { TaskDetailPanel } from "./TaskDetailPanel";

interface BoardViewProps {
  project:      Project | undefined;
  nodes:        Node<FunnelNodeData>[];
  members:      ProjectMember[];
  me:           Profile | null;
  myRole:       ProjectRole;
  onAddTask:    (nodeId: string, text: string, dueDate?: string, priority?: TaskPriority) => void;
  onToggleTask: (nodeId: string, taskId: string) => void;
  onDeleteTask: (nodeId: string, taskId: string) => void;
  onSendMessage:(nodeId: string, text: string) => void;
  onAddModule:  () => void;
  onUpdateTask: (nodeId: string, taskId: string, updates: {
    text?: string; dueDate?: string | null; priority?: TaskPriority;
    assignedTo?: string | null; description?: string;
  }) => void;
  onSelectView: (view: string) => void;
  commentsByTask:  Record<string, import("@/lib/types").TaskComment[]>;
  loadingComments: Record<string, boolean>;
  onLoadComments:  (taskId: string) => void;
  onAddComment:    (taskId: string, text: string) => void;
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

export function BoardView({
  project, nodes, members, me, myRole,
  onAddTask, onToggleTask, onDeleteTask, onSendMessage, onAddModule,
  onUpdateTask, onSelectView,
  commentsByTask, loadingComments, onLoadComments, onAddComment,
}: BoardViewProps) {
  const canEdit   = myRole === "owner" || myRole === "editor";
  const canDelete = myRole === "owner";

  const [collapsed,    setCollapsed]   = useState<Record<string, boolean>>({});
  const [selectedTask, setSelectedTask]= useState<{ nodeId: string; taskId: string } | null>(null);
  const [addingIn,     setAddingIn]    = useState<string | null>(null);
  const [addText,      setAddText]     = useState("");
  const [addDate,      setAddDate]     = useState("");
  const [addPriority,  setAddPriority] = useState<TaskPriority>("normal");

  const toggleCollapse = useCallback((id: string) =>
    setCollapsed((p) => ({ ...p, [id]: !p[id] })), []);

  useEffect(() => {
    if (selectedTask?.taskId) onLoadComments(selectedTask.taskId);
  }, [selectedTask?.taskId, onLoadComments]);

  const clearAdd = () => { setAddingIn(null); setAddText(""); setAddDate(""); setAddPriority("normal"); };

  const submitAdd = (nodeId: string) => {
    if (!addText.trim()) return;
    onAddTask(nodeId, addText.trim(), addDate || undefined, addPriority);
    clearAdd();
  };

  if (!project) return (
    <div className="view-placeholder">
      <span style={{ fontSize: 32 }}>▤</span>
      <p>Selecciona un proyecto</p>
    </div>
  );

  const totalTasks = nodes.reduce((a, n) => a + n.data.tasks.length, 0);
  const doneTasks  = nodes.reduce((a, n) => a + n.data.tasks.filter((t) => t.done).length, 0);
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  /* selected task object */
  const selNode = selectedTask ? nodes.find((n) => n.id === selectedTask.nodeId) : null;
  const selTask = selNode?.data.tasks.find((t) => t.id === selectedTask?.taskId) ?? null;

  const panelOpen = !!selTask;

  return (
    <div className="al-wrap">
      {/* ── Top bar ── */}
      <div className="al-topbar">
        <div className="al-topbar-left">
          <button className="bt-back-btn" onClick={() => onSelectView("canvas")}>← Embudo</button>
          <div>
            <div className="al-project-name">{project.name}</div>
            <div className="al-project-sub">
              {nodes.length} secciones · {doneTasks}/{totalTasks} tareas · {pct}% completado
            </div>
          </div>
        </div>
        <div className="al-topbar-right">
          {canEdit && (
            <button className="board-action-btn primary" onClick={onAddModule}>
              + Sección
            </button>
          )}
        </div>
      </div>

      {/* ── Column headers ── */}
      <div className={`al-col-headers${panelOpen ? " panel-open" : ""}`}>
        <div className="al-col-name">Nombre de tarea</div>
        <div className="al-col-assignee">Responsable</div>
        <div className="al-col-date">Fecha límite</div>
        <div className="al-col-priority">Prioridad</div>
        <div className="al-col-status">Estado</div>
      </div>

      {/* ── Body (list + panel) ── */}
      <div className={`al-body${panelOpen ? " panel-open" : ""}`}>

        {/* ── Task list ── */}
        <div className="al-list-scroll">
          {nodes.length === 0 ? (
            <div className="al-empty">
              <span style={{ fontSize: 40 }}>📋</span>
              <p>Sin secciones todavía.</p>
              {canEdit && (
                <button className="board-action-btn primary" onClick={onAddModule} style={{ marginTop: 12 }}>
                  + Primera sección
                </button>
              )}
            </div>
          ) : nodes.map((n) => {
            const isCol     = collapsed[n.id] ?? false;
            const roleColor = ROLE_COLORS[n.data.role] ?? "#7C3AED";
            const doneCnt   = n.data.tasks.filter((t) => t.done).length;

            return (
              <div key={n.id} className="al-section">
                {/* Section header */}
                <div className="al-section-header">
                  <button className="al-chevron" onClick={() => toggleCollapse(n.id)}>
                    {isCol ? "▸" : "▾"}
                  </button>
                  <span className="al-section-icon">{n.data.icon}</span>
                  <span className="al-section-name">{n.data.title}</span>
                  <span className="al-section-role" style={{ color: roleColor }}>
                    {ROLE_LABELS[n.data.role] ?? n.data.role}
                  </span>
                  <span className="al-section-count">
                    {doneCnt}/{n.data.tasks.length}
                  </span>
                  {canEdit && (
                    <button
                      className="al-add-task-inline-btn"
                      onClick={() => { setAddingIn(n.id); setAddText(""); }}
                      title="Agregar tarea"
                    >
                      + Tarea
                    </button>
                  )}
                </div>

                {!isCol && (
                  <>
                    {/* Task rows */}
                    {n.data.tasks.map((t) => {
                      const alert    = computeTaskAlertStatus(t);
                      const ac       = ALERT_COLORS[alert];
                      const pc       = PRIORITY_COLORS[t.priority ?? "normal"];
                      const assignee = members.find((m) => m.id === t.assignedTo);
                      const isActive = selectedTask?.taskId === t.id;

                      return (
                        <div
                          key={t.id}
                          className={`al-task-row${t.done ? " done" : ""}${isActive ? " active" : ""}`}
                          onClick={() => setSelectedTask({ nodeId: n.id, taskId: t.id })}
                        >
                          {/* checkbox */}
                          <button
                            className={`al-check${t.done ? " done" : ""}`}
                            onClick={(e) => { e.stopPropagation(); onToggleTask(n.id, t.id); }}
                          />

                          {/* name */}
                          <div className="al-col-name al-task-name">
                            <span className={`al-task-text${t.done ? " done" : ""}`}>{t.text}</span>
                          </div>

                          {/* assignee */}
                          <div className="al-col-assignee">
                            {assignee ? (
                              <span
                                className="al-avatar"
                                style={{ background: assignee.color }}
                                title={assignee.full_name || assignee.email}
                              >
                                {getInitials(assignee.full_name || assignee.email)}
                              </span>
                            ) : (
                              <span className="al-avatar empty" title="Sin asignar">+</span>
                            )}
                          </div>

                          {/* due date */}
                          <div className="al-col-date">
                            {t.dueDate ? (
                              <span
                                className="al-date-chip"
                                style={{ color: alert === "overdue" || alert === "due_today" ? "#E24B4A" : "var(--text2)" }}
                              >
                                📅 {fmtDate(t.dueDate)}
                              </span>
                            ) : (
                              <span className="al-date-empty">—</span>
                            )}
                          </div>

                          {/* priority */}
                          <div className="al-col-priority">
                            <span className="al-priority-chip" style={{ background: pc.bg, color: pc.fg }}>
                              {pc.label}
                            </span>
                          </div>

                          {/* alert status */}
                          <div className="al-col-status">
                            {!t.done && t.dueDate && (
                              <span
                                className={`task-alert-badge task-alert-${alert}`}
                                style={{ background: ac.bg, color: ac.fg }}
                              >
                                {ac.label}
                              </span>
                            )}
                            {t.done && (
                              <span style={{ fontSize: 11, color: "#10B981" }}>✓ Hecha</span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* Inline add task */}
                    {addingIn === n.id ? (
                      <div className="al-add-row">
                        <div className="al-check empty" />
                        <input
                          autoFocus
                          type="text"
                          className="al-add-input"
                          placeholder="Nombre de la tarea…"
                          value={addText}
                          onChange={(e) => setAddText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") submitAdd(n.id);
                            if (e.key === "Escape") clearAdd();
                          }}
                        />
                        <select
                          className="al-add-priority"
                          value={addPriority}
                          style={{ color: PRIORITY_COLORS[addPriority].fg }}
                          onChange={(e) => setAddPriority(e.target.value as TaskPriority)}
                        >
                          <option value="low">Baja</option>
                          <option value="normal">Normal</option>
                          <option value="high">Alta</option>
                          <option value="urgent">Urgente</option>
                        </select>
                        <input
                          type="date"
                          className="al-add-date"
                          value={addDate}
                          onChange={(e) => setAddDate(e.target.value)}
                        />
                        <button className="al-add-confirm" onClick={() => submitAdd(n.id)} disabled={!addText.trim()}>
                          Agregar
                        </button>
                        <button className="al-add-cancel" onClick={clearAdd}>✕</button>
                      </div>
                    ) : canEdit ? (
                      <button
                        className="al-add-task-btn"
                        onClick={() => { setAddingIn(n.id); setAddText(""); }}
                      >
                        + Agregar tarea
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Task detail panel ── */}
        {panelOpen && selTask && selNode && (
          <TaskDetailPanel
            task={selTask}
            nodeTitle={selNode.data.title}
            nodeIcon={selNode.data.icon}
            members={members}
            me={me}
            canEdit={canEdit}
            onClose={() => setSelectedTask(null)}
            onToggle={() => onToggleTask(selNode.id, selTask.id)}
            onDelete={() => { onDeleteTask(selNode.id, selTask.id); setSelectedTask(null); }}
            onUpdate={(upd) => onUpdateTask(selNode.id, selTask.id, upd)}
            comments={selTask ? (commentsByTask[selTask.id] ?? []) : []}
            loadingComments={selTask ? (loadingComments[selTask.id] ?? false) : false}
            onAddComment={(text) => selTask && onAddComment(selTask.id, text)}
          />
        )}
      </div>
    </div>
  );
}
