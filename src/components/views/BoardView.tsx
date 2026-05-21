"use client";

import { useState } from "react";
import type { Node } from "reactflow";
import type { FunnelNodeData, ProjectMember, Project, TaskPriority } from "@/lib/types";
import { ROLE_LABELS, ROLE_COLORS, ALERT_COLORS, PRIORITY_COLORS } from "@/lib/constants";
import { computeTaskAlertStatus } from "@/lib/types";
import { getInitials } from "@/lib/profiles";

interface BoardViewProps {
  project:       Project | undefined;
  nodes:         Node<FunnelNodeData>[];
  members:       ProjectMember[];
  onAddTask:     (nodeId: string, text: string, dueDate?: string, priority?: TaskPriority) => void;
  onToggleTask:  (nodeId: string, taskId: string) => void;
  onDeleteTask:  (nodeId: string, taskId: string) => void;
  onSendMessage: (nodeId: string, text: string) => void;
  onAddModule:   () => void;
  onUpdateTask:  (nodeId: string, taskId: string, updates: { text?: string; dueDate?: string | null; priority?: TaskPriority; assignedTo?: string | null }) => void;
  onSelectView:  (view: string) => void;
}

interface AddState {
  text:     string;
  dueDate:  string;
  priority: TaskPriority;
}

export function BoardView({
  project, nodes, members,
  onAddTask, onToggleTask, onDeleteTask, onSendMessage, onAddModule,
  onUpdateTask, onSelectView,
}: BoardViewProps) {
  const [collapsed,   setCollapsed]   = useState<Record<string, boolean>>({});
  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editText,    setEditText]    = useState("");
  const [addState,    setAddState]    = useState<Record<string, AddState>>({});
  const [chatOpen,    setChatOpen]    = useState<string | null>(null);
  const [draftMsg,    setDraftMsg]    = useState<Record<string, string>>({});

  if (!project) {
    return (
      <div className="view-placeholder">
        <span style={{ fontSize: 32 }}>▤</span>
        <p>Selecciona un proyecto para ver el tablero</p>
      </div>
    );
  }

  const totalTasks = nodes.reduce((acc, n) => acc + n.data.tasks.length, 0);
  const doneTasks  = nodes.reduce((acc, n) => acc + n.data.tasks.filter((t) => t.done).length, 0);
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const getAdd = (nodeId: string): AddState =>
    addState[nodeId] ?? { text: "", dueDate: "", priority: "normal" };

  const patchAdd = (nodeId: string, patch: Partial<AddState>) =>
    setAddState((prev) => ({ ...prev, [nodeId]: { ...getAdd(nodeId), ...patch } }));

  const submitAdd = (nodeId: string) => {
    const s = getAdd(nodeId);
    if (!s.text.trim()) return;
    onAddTask(nodeId, s.text.trim(), s.dueDate || undefined, s.priority);
    setAddState((prev) => ({ ...prev, [nodeId]: { text: "", dueDate: "", priority: "normal" } }));
  };

  return (
    <div className="bt-wrap">
      {/* ── Header ── */}
      <div className="bt-page-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button className="bt-back-btn" onClick={() => onSelectView("canvas")}>
            ← Embudo
          </button>
          <div>
            <div className="bt-page-title">{project.name}</div>
            <div className="bt-page-sub">
              {nodes.length} módulos · {doneTasks}/{totalTasks} tareas · {pct}% completado
            </div>
          </div>
        </div>
        <button className="board-action-btn primary" onClick={onAddModule}>+ Módulo</button>
      </div>

      {nodes.length === 0 ? (
        <div className="bt-empty-state">
          <span style={{ fontSize: 40, marginBottom: 12 }}>📋</span>
          <p>Este proyecto aún no tiene módulos. Agrega uno para empezar.</p>
          <button className="board-action-btn primary" onClick={onAddModule} style={{ marginTop: 8 }}>
            + Primer módulo
          </button>
        </div>
      ) : (
        <div className="bt-content">
          {/* ── Column headers ── */}
          <div className="bt-col-headers">
            <div className="bt-th bt-th-done" />
            <div className="bt-th bt-th-text">Tarea</div>
            <div className="bt-th bt-th-assignee">Asignado</div>
            <div className="bt-th bt-th-priority">Prioridad</div>
            <div className="bt-th bt-th-date">Fecha límite</div>
            <div className="bt-th bt-th-status">Estado</div>
            <div className="bt-th bt-th-actions" />
          </div>

          {nodes.map((n) => {
            const isCol = collapsed[n.id] ?? false;
            const roleColor = ROLE_COLORS[n.data.role] ?? "#7C3AED";
            const add = getAdd(n.id);

            return (
              <div key={n.id} className="bt-group">
                {/* ── Module header ── */}
                <div
                  className="bt-group-header"
                  onClick={() => setCollapsed((p) => ({ ...p, [n.id]: !isCol }))}
                >
                  <span className="bt-group-toggle">{isCol ? "▸" : "▾"}</span>
                  <span className="bt-group-icon">{n.data.icon}</span>
                  <span className="bt-group-name">{n.data.title}</span>
                  <span className="bt-group-role" style={{ color: roleColor }}>
                    {ROLE_LABELS[n.data.role] ?? n.data.role}
                  </span>
                  <span className="bt-group-count">{n.data.tasks.length} tareas</span>
                  {/* chat shortcut */}
                  <button
                    className="bt-chat-btn"
                    title="Chat del módulo"
                    onClick={(e) => {
                      e.stopPropagation();
                      setChatOpen(chatOpen === n.id ? null : n.id);
                    }}
                  >
                    💬 {n.data.messages.length}
                    {n.data.hasUnread && <span className="bt-unread-dot" />}
                  </button>
                </div>

                {/* ── Task rows ── */}
                {!isCol && (
                  <>
                    {n.data.tasks.length === 0 && (
                      <div className="bt-no-tasks">Sin tareas · agrega una abajo</div>
                    )}

                    {n.data.tasks.map((t) => {
                      const alert = computeTaskAlertStatus(t);
                      const ac    = ALERT_COLORS[alert];
                      const pc    = PRIORITY_COLORS[t.priority ?? "normal"];
                      const isEd  = editingTask === t.id;
                      const assignee = members.find((m) => m.id === t.assignedTo);

                      return (
                        <div key={t.id} className={`bt-row${t.done ? " done" : ""}`}>
                          {/* checkbox */}
                          <div className="bt-td bt-td-done">
                            <button
                              className={`bt-check${t.done ? " done" : ""}`}
                              onClick={() => onToggleTask(n.id, t.id)}
                            />
                          </div>

                          {/* text */}
                          <div className="bt-td bt-td-text">
                            {isEd ? (
                              <input
                                className="bt-text-edit"
                                value={editText}
                                autoFocus
                                onChange={(e) => setEditText(e.target.value)}
                                onBlur={() => {
                                  if (editText.trim() && editText !== t.text)
                                    onUpdateTask(n.id, t.id, { text: editText.trim() });
                                  setEditingTask(null);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                  if (e.key === "Escape") setEditingTask(null);
                                }}
                              />
                            ) : (
                              <span
                                className="bt-text-display"
                                onClick={() => { setEditingTask(t.id); setEditText(t.text); }}
                                title="Clic para editar"
                              >
                                {t.text}
                              </span>
                            )}
                          </div>

                          {/* assignee */}
                          <div className="bt-td bt-td-assignee">
                            <select
                              className="bt-assignee-select"
                              value={t.assignedTo ?? ""}
                              onChange={(e) => onUpdateTask(n.id, t.id, { assignedTo: e.target.value || null })}
                              title="Asignar a..."
                            >
                              <option value="">—</option>
                              {members.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {getInitials(m.full_name || m.email)}
                                </option>
                              ))}
                            </select>
                            {assignee && (
                              <span
                                className="bt-assignee-avatar"
                                style={{ background: assignee.color }}
                                title={assignee.full_name || assignee.email}
                              >
                                {getInitials(assignee.full_name || assignee.email)}
                              </span>
                            )}
                          </div>

                          {/* priority */}
                          <div className="bt-td bt-td-priority">
                            <select
                              className="bt-priority-select"
                              value={t.priority ?? "normal"}
                              style={{ color: pc.fg }}
                              onChange={(e) => onUpdateTask(n.id, t.id, { priority: e.target.value as TaskPriority })}
                            >
                              <option value="low">Baja</option>
                              <option value="normal">Normal</option>
                              <option value="high">Alta</option>
                              <option value="urgent">Urgente</option>
                            </select>
                          </div>

                          {/* due date */}
                          <div className="bt-td bt-td-date">
                            <input
                              type="date"
                              className="bt-date-input"
                              value={t.dueDate ?? ""}
                              onChange={(e) => onUpdateTask(n.id, t.id, { dueDate: e.target.value || null })}
                            />
                          </div>

                          {/* alert status */}
                          <div className="bt-td bt-td-status">
                            {!t.done && t.dueDate && (
                              <span
                                className={`task-alert-badge task-alert-${alert}`}
                                style={{ background: ac.bg, color: ac.fg }}
                              >
                                {ac.label}
                              </span>
                            )}
                          </div>

                          {/* delete */}
                          <div className="bt-td bt-td-actions">
                            <button className="bt-del-btn" onClick={() => onDeleteTask(n.id, t.id)}>✕</button>
                          </div>
                        </div>
                      );
                    })}

                    {/* ── Add task row ── */}
                    <div className="bt-add-row">
                      <div className="bt-td bt-td-done" />
                      <div className="bt-td bt-td-text">
                        <input
                          type="text"
                          className="bt-add-text"
                          placeholder="+ Nueva tarea… (Enter)"
                          value={add.text}
                          onChange={(e) => patchAdd(n.id, { text: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Enter") submitAdd(n.id); }}
                        />
                      </div>
                      <div className="bt-td bt-td-assignee" />
                      <div className="bt-td bt-td-priority">
                        <select
                          className="bt-priority-select"
                          value={add.priority}
                          style={{ color: PRIORITY_COLORS[add.priority].fg }}
                          onChange={(e) => patchAdd(n.id, { priority: e.target.value as TaskPriority })}
                        >
                          <option value="low">Baja</option>
                          <option value="normal">Normal</option>
                          <option value="high">Alta</option>
                          <option value="urgent">Urgente</option>
                        </select>
                      </div>
                      <div className="bt-td bt-td-date">
                        <input
                          type="date"
                          className="bt-date-input"
                          value={add.dueDate}
                          onChange={(e) => patchAdd(n.id, { dueDate: e.target.value })}
                        />
                      </div>
                      <div className="bt-td bt-td-status" />
                      <div className="bt-td bt-td-actions">
                        <button
                          className="bt-add-submit"
                          onClick={() => submitAdd(n.id)}
                          disabled={!add.text.trim()}
                          title="Agregar tarea"
                        >
                          ＋
                        </button>
                      </div>
                    </div>

                    {/* ── Inline chat panel ── */}
                    {chatOpen === n.id && (
                      <div className="bt-chat-panel">
                        <div className="bt-chat-messages">
                          {n.data.messages.length === 0 ? (
                            <div className="bt-chat-empty">Sin mensajes todavía</div>
                          ) : n.data.messages.map((m) => (
                            <div key={m.id} className={`bt-chat-row${m.isMe ? " me" : ""}`}>
                              <span className="bt-chat-avatar" style={{ background: m.userColor }}>
                                {getInitials(m.userName || "?")}
                              </span>
                              <div className="bt-chat-bubble">
                                <span className="bt-chat-name">{m.userName}</span>
                                <span className="bt-chat-text">{m.text}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        <div className="bt-chat-input-row">
                          <input
                            type="text"
                            className="bt-chat-input"
                            placeholder="Escribe un mensaje…"
                            value={draftMsg[n.id] ?? ""}
                            onChange={(e) => setDraftMsg((p) => ({ ...p, [n.id]: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && (draftMsg[n.id] ?? "").trim()) {
                                onSendMessage(n.id, draftMsg[n.id].trim());
                                setDraftMsg((p) => ({ ...p, [n.id]: "" }));
                              }
                            }}
                          />
                          <button
                            className="bt-chat-send"
                            onClick={() => {
                              if ((draftMsg[n.id] ?? "").trim()) {
                                onSendMessage(n.id, draftMsg[n.id].trim());
                                setDraftMsg((p) => ({ ...p, [n.id]: "" }));
                              }
                            }}
                          >↑</button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
