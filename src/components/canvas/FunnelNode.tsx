"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Handle, Position, NodeProps } from "reactflow";
import { ROLE_LABELS, TASK_SUGGESTIONS, ALERT_COLORS } from "@/lib/constants";
import { getInitials } from "@/lib/profiles";
import type { FunnelNodeData, NodeTask, ChatMessage } from "@/lib/types";
import { computeTaskAlertStatus } from "@/lib/types";

const ROLE_COLOR_MAP: Record<string, string> = {
  trafficker:    "#3B82F6",
  estratega:     "#10B981",
  ghl:           "#7C3AED",
  integraciones: "#6366F1",
  ventas:        "#E24B4A",
  pm:            "#F59E0B",
  experto:       "#8B5CF6",
};

const ROLE_ICONS: Record<string, string> = {
  trafficker:    "📣",
  estratega:     "✍️",
  ghl:           "⚙️",
  integraciones: "🔌",
  ventas:        "💰",
  pm:            "📋",
  experto:       "🎯",
};

function getRoleColor(role: string) { return ROLE_COLOR_MAP[role] ?? "#7C3AED"; }
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

export function FunnelNode({ data, selected }: NodeProps<FunnelNodeData>) {
  const [expanded,     setExpanded]     = useState(false);
  const [msgInput,     setMsgInput]     = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleInput,   setTitleInput]   = useState(data.title);
  const [addingTask,   setAddingTask]   = useState(false);
  const [taskInput,    setTaskInput]    = useState("");
  const [showRoles,    setShowRoles]    = useState(false);
  const [showAssign,   setShowAssign]   = useState(false);

  const chatRef      = useRef<HTMLDivElement>(null);
  const titleRef     = useRef<HTMLInputElement>(null);
  const taskRef      = useRef<HTMLInputElement>(null);
  const fileRef      = useRef<HTMLInputElement>(null);
  const roleDropRef  = useRef<HTMLDivElement>(null);
  const assignDropRef= useRef<HTMLDivElement>(null);

  const roleColor = getRoleColor(data.role);
  const assignee  = data.members?.find((m) => m.id === data.assignedTo);
  const barColor  = assignee?.color ?? data.ownerColor ?? roleColor;
  const tasks     = data.tasks;
  const messages  = data.messages;
  const done      = tasks.filter((t) => t.done).length;
  const total     = tasks.length;
  const pct       = total > 0 ? Math.round((done / total) * 100) : 0;

  useEffect(() => {
    if (expanded && chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [expanded, messages.length]);

  useEffect(() => {
    if (editingTitle && titleRef.current) {
      titleRef.current.focus();
      titleRef.current.select();
    }
  }, [editingTitle]);

  useEffect(() => {
    if (addingTask && taskRef.current) taskRef.current.focus();
  }, [addingTask]);

  /* sync title when data changes externally */
  useEffect(() => { setTitleInput(data.title); }, [data.title]);

  /* click-outside: close role picker */
  useEffect(() => {
    if (!showRoles) return;
    const handler = (e: MouseEvent) => {
      if (roleDropRef.current && !roleDropRef.current.contains(e.target as Node)) {
        setShowRoles(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showRoles]);

  /* click-outside: close assign picker */
  useEffect(() => {
    if (!showAssign) return;
    const handler = (e: MouseEvent) => {
      if (assignDropRef.current && !assignDropRef.current.contains(e.target as Node)) {
        setShowAssign(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showAssign]);

  const saveTitle = () => {
    setEditingTitle(false);
    const t = titleInput.trim();
    if (t && t !== data.title) data.onUpdateNodeData?.({ title: t });
    else setTitleInput(data.title);
  };

  const sendMessage = () => {
    const text = msgInput.trim();
    if (!text) return;
    data.onSendMessage?.(text);
    setMsgInput("");
  };

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) data.onUploadFile?.(file);
    if (fileRef.current) fileRef.current.value = "";
  }, [data]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLInputElement>) => {
    const imageItem = Array.from(e.clipboardData.items).find((i) => i.type.startsWith("image/"));
    if (imageItem) {
      e.preventDefault();
      const file = imageItem.getAsFile();
      if (file) data.onUploadFile?.(file);
    }
  }, [data]);

  const addTask = () => {
    const text = taskInput.trim();
    if (!text) return;
    data.onAddTask?.(text);
    setTaskInput("");
    setAddingTask(false);
  };

  const selectRole = (role: string) => {
    setShowRoles(false);
    data.onUpdateNodeData?.({
      role,
      subtitle: ROLE_LABELS[role] ?? role,
      icon: ROLE_ICONS[role] ?? "📦",
    });
  };

  return (
    <div
      style={{
        width: 200,
        background: "var(--surface)",
        border: `1.5px solid ${selected ? barColor : "var(--border)"}`,
        borderRadius: "var(--radius-node)",
        boxShadow: selected ? `0 0 0 2px ${barColor}33` : "0 1px 6px rgba(0,0,0,0.08)",
        fontFamily: "var(--font-sans)",
        transition: "box-shadow 0.15s, border-color 0.15s",
        overflow: "visible",
        position: "relative",
      }}
    >
      {/* ── Handles — all 4 sides ── */}
      <Handle type="target"  position={Position.Left}   style={handleStyle} />
      <Handle type="source"  position={Position.Right}  style={handleStyle} />
      <Handle type="target"  position={Position.Top}    style={handleStyle} id="top-in" />
      <Handle type="source"  position={Position.Bottom} style={handleStyle} id="bottom-out" />

      {/* ── Owner/role color strip ── */}
      <div style={{ height: 3, background: barColor, borderRadius: "10px 10px 0 0" }} />

      {/* ── Header ── */}
      <div
        style={{ display: "flex", alignItems: "flex-start", gap: 6,
          padding: "8px 10px 5px", cursor: "pointer", userSelect: "none" }}
        onClick={() => {
          if (editingTitle || showRoles) return;
          const opening = !expanded;
          setExpanded(opening);
          if (opening) data.onMarkRead?.();
        }}
      >
        {/* Icon — click to change role */}
        <span
          title="Cambiar rol"
          onClick={(e) => { e.stopPropagation(); setShowRoles((s) => !s); }}
          style={{ fontSize: 15, lineHeight: 1, marginTop: 1, cursor: "pointer",
            borderRadius: 4, padding: "1px 2px", transition: "background 0.12s" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "var(--border)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          {data.icon}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Title — double-click to edit */}
          {editingTitle ? (
            <input
              ref={titleRef}
              value={titleInput}
              onChange={(e) => setTitleInput(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.stopPropagation(); saveTitle(); }
                if (e.key === "Escape") { setEditingTitle(false); setTitleInput(data.title); }
                e.stopPropagation();
              }}
              onClick={(e) => e.stopPropagation()}
              style={{ width: "100%", fontSize: 12.5, fontWeight: 600,
                color: "var(--text)", background: "var(--surface2)",
                border: `1px solid ${roleColor}`, borderRadius: 4,
                padding: "1px 4px", outline: "none" }}
            />
          ) : (
            <div
              onDoubleClick={(e) => {
                e.stopPropagation();
                setEditingTitle(true);
                setTitleInput(data.title);
              }}
              title="Doble clic para editar"
              style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                cursor: "text" }}
            >
              {data.title}
            </div>
          )}
          <div style={{ fontSize: 10, color: roleColor, marginTop: 1, fontWeight: 500,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {ROLE_LABELS[data.role] ?? data.role}
          </div>
        </div>

        {data.hasUnread && (
          <span style={{ width: 6, height: 6, borderRadius: "50%",
            background: "#E24B4A", flexShrink: 0, marginTop: 4 }} />
        )}
        <span style={{ fontSize: 9, color: "var(--text3)", flexShrink: 0, marginTop: 4,
          transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          ▼
        </span>
      </div>

      {/* ── Role picker dropdown ── */}
      {showRoles && (
        <div
          ref={roleDropRef}
          onClick={(e) => e.stopPropagation()}
          style={{ position: "absolute", top: 44, left: 8, zIndex: 999,
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
            padding: "4px 0", minWidth: 170 }}
        >
          {Object.entries(ROLE_LABELS).map(([key, label]) => (
            <button key={key}
              onClick={() => selectRole(key)}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "6px 12px", fontSize: 12, color: "var(--text)",
                background: data.role === key ? "var(--surface2)" : "none",
                border: "none", cursor: "pointer", textAlign: "left" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface2)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = data.role === key ? "var(--surface2)" : "none")}
            >
              <span style={{ width: 8, height: 8, borderRadius: "50%",
                background: ROLE_COLOR_MAP[key], flexShrink: 0 }} />
              <span style={{ fontSize: 13, flexShrink: 0 }}>{ROLE_ICONS[key]}</span>
              {label}
            </button>
          ))}
        </div>
      )}

      {/* ── Progress bar + assignee ── */}
      <div style={{ padding: "0 10px 8px", position: "relative" }}>
        <div style={{ height: 3, background: "var(--border)", borderRadius: 999, overflow: "hidden" }}>
          <div style={{ width: `${pct}%`, height: "100%", background: barColor,
            borderRadius: 999, transition: "width 0.3s ease" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center",
          justifyContent: "space-between", marginTop: 5 }}>
          <span style={{ fontSize: 10, color: "var(--text2)" }}>
            {done}/{total} tareas · {pct}%
          </span>
          <span
            title={`Responsable: ${assignee ? (assignee.full_name || assignee.email) : "Sin asignar"} · clic para cambiar`}
            onClick={(e) => { e.stopPropagation(); setShowAssign((s) => !s); }}
            style={{
              cursor: "pointer", width: 20, height: 20, borderRadius: "50%",
              background: assignee ? barColor : "transparent",
              border: assignee ? "none" : `1.5px dashed var(--border2)`,
              color: "#fff", fontSize: 8.5, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
            }}>
            {assignee ? getInitials(assignee.full_name || assignee.email) : (data.ownerInitials || "?")}
          </span>
        </div>

        {showAssign && (
          <div ref={assignDropRef} onClick={(e) => e.stopPropagation()}
            style={{ position: "absolute", top: 32, right: 10, zIndex: 999,
              background: "var(--surface)", border: "1px solid var(--border)",
              borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
              padding: "4px 0", minWidth: 200, maxHeight: 220, overflowY: "auto" }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: "var(--text3)",
              textTransform: "uppercase", letterSpacing: "0.07em",
              padding: "6px 12px 4px" }}>Asignar a</div>
            <button
              onClick={() => {
                setShowAssign(false);
                data.onUpdateNodeData?.({ assignedTo: null, ownerInitials: "", ownerColor: "" });
              }}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "6px 12px", fontSize: 12, color: "var(--text2)",
                background: !data.assignedTo ? "var(--surface2)" : "none",
                border: "none", cursor: "pointer", textAlign: "left" }}>
              <span style={{ width: 16, height: 16, borderRadius: "50%",
                border: "1.5px dashed var(--border2)", flexShrink: 0 }} />
              Sin asignar
            </button>
            {(data.members ?? []).map((m) => (
              <button key={m.id}
                onClick={() => {
                  setShowAssign(false);
                  data.onUpdateNodeData?.({
                    assignedTo:    m.id,
                    ownerInitials: getInitials(m.full_name || m.email),
                    ownerColor:    m.color,
                  });
                }}
                style={{ display: "flex", alignItems: "center", gap: 8, width: "100%",
                  padding: "6px 12px", fontSize: 12, color: "var(--text)",
                  background: data.assignedTo === m.id ? "var(--surface2)" : "none",
                  border: "none", cursor: "pointer", textAlign: "left" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface2)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = data.assignedTo === m.id ? "var(--surface2)" : "none")}>
                <span style={{ width: 18, height: 18, borderRadius: "50%",
                  background: m.color, color: "#fff", fontSize: 8, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {getInitials(m.full_name || m.email)}
                </span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {m.full_name || m.email}
                </span>
              </button>
            ))}
            {(data.members ?? []).length === 0 && (
              <div style={{ padding: "6px 12px 10px", fontSize: 11, color: "var(--text3)" }}>
                Invita gente desde el botón &quot;Equipo&quot;
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Expanded panel ── */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--border)",
          background: "var(--surface3, var(--surface))", borderRadius: "0 0 10px 10px" }}>

          {/* Tasks */}
          <div style={{ padding: "8px 10px 6px" }}>
            <SectionLabel>Tareas</SectionLabel>

            {tasks.map((task) => (
              <TaskRow key={task.id} task={task} roleColor={roleColor}
                onToggle={() => data.onTaskToggle?.(task.id)}
                onDelete={() => data.onDeleteTask?.(task.id)} />
            ))}

            {/* Inline add task with role-based suggestions */}
            {addingTask ? (
              <div onClick={(e) => e.stopPropagation()} style={{ marginTop: 6 }}>
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <input
                    ref={taskRef}
                    value={taskInput}
                    onChange={(e) => setTaskInput(e.target.value)}
                    placeholder="Tarea o elige sugerencia…"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.stopPropagation(); addTask(); }
                      if (e.key === "Escape") { setAddingTask(false); setTaskInput(""); }
                      e.stopPropagation();
                    }}
                    style={{ flex: 1, fontSize: 11, padding: "4px 7px",
                      border: `1px solid ${roleColor}`, borderRadius: 5,
                      background: "var(--surface)", color: "var(--text)", outline: "none" }}
                  />
                  <button onClick={(e) => { e.stopPropagation(); addTask(); }}
                    style={{ padding: "4px 8px", fontSize: 11, background: roleColor,
                      color: "#fff", border: "none", borderRadius: 5, cursor: "pointer" }}>
                    ✓
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setAddingTask(false); setTaskInput(""); }}
                    style={{ padding: "4px 7px", fontSize: 11, background: "var(--border)",
                      color: "var(--text2)", border: "none", borderRadius: 5, cursor: "pointer" }}>
                    ✕
                  </button>
                </div>

                {/* Suggestions filtered by typed text */}
                {(() => {
                  const all = TASK_SUGGESTIONS[data.role] ?? [];
                  const existing = new Set(tasks.map((t) => t.text.toLowerCase()));
                  const q = taskInput.trim().toLowerCase();
                  const filtered = all
                    .filter((s) => !existing.has(s.toLowerCase()))
                    .filter((s) => !q || s.toLowerCase().includes(q))
                    .slice(0, 6);
                  if (filtered.length === 0) return null;
                  return (
                    <div style={{ marginTop: 5, display: "flex",
                      flexDirection: "column", gap: 2,
                      maxHeight: 140, overflowY: "auto",
                      background: "var(--surface2)", borderRadius: 5, padding: 4 }}>
                      <div style={{ fontSize: 9, fontWeight: 600, color: roleColor,
                        textTransform: "uppercase", letterSpacing: "0.05em",
                        padding: "2px 4px 1px", display: "flex", alignItems: "center", gap: 4 }}>
                        <span>✦</span> Sugerencias para {ROLE_LABELS[data.role]}
                      </div>
                      {filtered.map((sugg) => (
                        <button key={sugg}
                          onClick={(e) => { e.stopPropagation(); data.onAddTask?.(sugg); }}
                          style={{ display: "flex", alignItems: "center", gap: 5,
                            padding: "4px 6px", fontSize: 10.5, color: "var(--text)",
                            background: "var(--surface)", border: "1px solid var(--border)",
                            borderRadius: 4, cursor: "pointer", textAlign: "left",
                            transition: "border-color 0.12s" }}
                          onMouseEnter={(e) => (e.currentTarget.style.borderColor = roleColor)}
                          onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                        >
                          <span style={{ color: roleColor, fontSize: 9 }}>+</span>
                          {sugg}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <button
                onClick={(e) => { e.stopPropagation(); setAddingTask(true); }}
                style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6,
                  fontSize: 10.5, color: "var(--text3)", background: "none",
                  border: "none", cursor: "pointer", padding: 0 }}>
                <span style={{ fontSize: 12 }}>+</span> Tarea
                <span style={{ marginLeft: 4, color: roleColor }}>✦</span>
                <span style={{ color: roleColor }}>IA</span>
              </button>
            )}
          </div>

          {/* Archivos adjuntos */}
          {messages.filter((m) => m.fileUrl).length > 0 && (
            <div style={{ borderTop: "1px solid var(--border)", padding: "8px 10px 6px" }}>
              <SectionLabel>Archivos</SectionLabel>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {messages.filter((m) => m.fileUrl).map((m) => (
                  m.fileType?.startsWith("image/") ? (
                    <a key={m.id} href={m.fileUrl} target="_blank" rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ display: "block" }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={m.fileUrl} alt={m.text}
                        style={{ width: "100%", maxHeight: 80, objectFit: "cover",
                          borderRadius: 5, display: "block" }} />
                    </a>
                  ) : (
                    <a key={m.id} href={m.fileUrl} target="_blank" rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{ display: "flex", alignItems: "center", gap: 5,
                        fontSize: 10.5, color: "var(--text)", textDecoration: "none",
                        padding: "3px 5px", borderRadius: 5,
                        background: "var(--surface2)", border: "1px solid var(--border)" }}>
                      <span>📎</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {m.text}
                      </span>
                    </a>
                  )
                ))}
              </div>
            </div>
          )}

          {/* Chat */}
          <div style={{ borderTop: "1px solid var(--border)", padding: "8px 10px 8px" }}>
            <SectionLabel>Chat del módulo</SectionLabel>
            <div ref={chatRef}
              style={{ maxHeight: 130, overflowY: "auto",
                display: "flex", flexDirection: "column", gap: 6 }}>
              {messages.length === 0 && (
                <span style={{ fontSize: 10.5, color: "var(--text3)", fontStyle: "italic" }}>
                  Sin mensajes aún…
                </span>
              )}
              {messages.map((msg) => (
                <MessageBubble key={msg.id} msg={msg} roleColor={roleColor} />
              ))}
            </div>
            <div style={{ display: "flex", gap: 4, marginTop: 6, alignItems: "center" }}
              onClick={(e) => e.stopPropagation()}>
              <input
                value={msgInput}
                onChange={(e) => setMsgInput(e.target.value)}
                onPaste={handlePaste}
                placeholder="Mensaje… (Ctrl+V pega imagen)"
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.stopPropagation(); sendMessage(); }
                  e.stopPropagation();
                }}
                style={{ flex: 1, fontSize: 11, padding: "4px 7px",
                  border: "1px solid var(--border)", borderRadius: "var(--radius-inner)",
                  background: "var(--surface)", color: "var(--text)", outline: "none" }}
              />
              {/* File attach button */}
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                style={{ display: "none" }}
                onChange={handleFileSelect}
              />
              <button
                onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}
                title="Adjuntar archivo"
                style={{ width: 22, height: 22, background: "var(--border)", color: "var(--text2)",
                  border: "none", borderRadius: 5, cursor: "pointer", fontSize: 12,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                📎
              </button>
              <button onClick={(e) => { e.stopPropagation(); sendMessage(); }}
                style={{ width: 22, height: 22, background: roleColor, color: "#fff",
                  border: "none", borderRadius: 5, cursor: "pointer", fontSize: 11,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                ↑
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ─────────────────────────────────────────── */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9.5, fontWeight: 700, textTransform: "uppercase",
      letterSpacing: "0.07em", color: "var(--text3)", marginBottom: 6 }}>
      {children}
    </div>
  );
}

function TaskRow({ task, roleColor, onToggle, onDelete }: {
  task: NodeTask; roleColor: string; onToggle: () => void; onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const alert = computeTaskAlertStatus(task);
  const showAlert = !task.done && task.dueDate && alert !== "no_date" && alert !== "on_track";
  const ac = showAlert ? ALERT_COLORS[alert] : null;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: "flex", alignItems: "flex-start", gap: 6,
        padding: "3px 0", cursor: "pointer", position: "relative" }}>
      {/* Checkbox */}
      <div
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        style={{ width: 13, height: 13, borderRadius: 3, flexShrink: 0, marginTop: 1,
          border: task.done ? "none" : "1.5px solid var(--border2)",
          background: task.done ? roleColor : "transparent",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.15s" }}>
        {task.done && <span style={{ color: "#fff", fontSize: 8, lineHeight: 1 }}>✓</span>}
      </div>
      {/* Text */}
      <span
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        style={{ flex: 1, fontSize: 11, lineHeight: 1.4,
          color: task.done ? "var(--text3)" : "var(--text)",
          textDecoration: task.done ? "line-through" : "none" }}>
        {task.text}
      </span>
      {/* Alert badge */}
      {showAlert && ac && (
        <span
          className={`task-alert-badge task-alert-${alert}`}
          title={`Fecha límite: ${task.dueDate}`}
          style={{ background: ac.bg, color: ac.fg, marginRight: hovered ? 18 : 0 }}>
          {ac.label}
        </span>
      )}
      {/* Delete button — visible on hover */}
      {hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Eliminar tarea"
          style={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)",
            width: 14, height: 14, borderRadius: 3, border: "none",
            background: "var(--border2)", color: "var(--text2)",
            fontSize: 8, lineHeight: 1, cursor: "pointer", padding: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.12s" }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "#E24B4A")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "var(--border2)")}
        >
          ✕
        </button>
      )}
    </div>
  );
}

function MessageBubble({ msg, roleColor }: { msg: ChatMessage; roleColor: string }) {
  const isImage = msg.fileType?.startsWith("image/");
  const isFile  = !!msg.fileUrl && !isImage;

  return (
    <div style={{ display: "flex", flexDirection: "column",
      alignItems: msg.isMe ? "flex-end" : "flex-start" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2,
        flexDirection: msg.isMe ? "row-reverse" : "row" }}>
        <span style={{ width: 14, height: 14, borderRadius: "50%",
          background: msg.userColor, color: "#fff", fontSize: 7, fontWeight: 700,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          {msg.userInitials}
        </span>
        <span style={{ fontSize: 9, color: "var(--text3)" }}>
          {msg.userName} · {fmtTime(msg.createdAt)}
        </span>
      </div>

      {isImage ? (
        <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={msg.fileUrl}
            alt={msg.text}
            style={{ maxWidth: 160, maxHeight: 120, borderRadius: 6,
              display: "block", cursor: "pointer", objectFit: "cover" }}
            onMouseDown={(e) => e.stopPropagation()}
          />
        </a>
      ) : isFile ? (
        <a href={msg.fileUrl} target="_blank" rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          style={{ display: "flex", alignItems: "center", gap: 5,
            padding: "4px 8px", borderRadius: 6, fontSize: 10.5,
            background: msg.isMe ? `${roleColor}18` : "var(--border)",
            color: "var(--text)", textDecoration: "none", maxWidth: 160 }}>
          <span>📎</span>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {msg.text}
          </span>
        </a>
      ) : (
        <div style={{ maxWidth: "88%", fontSize: 11, lineHeight: 1.4,
          color: "var(--text)", padding: "4px 7px",
          background: msg.isMe ? `${roleColor}18` : "var(--border)",
          borderRadius: msg.isMe ? "8px 8px 2px 8px" : "8px 8px 8px 2px",
          userSelect: "text", wordBreak: "break-word", whiteSpace: "pre-wrap" }}
          onMouseDown={(e) => e.stopPropagation()}>
          {linkify(msg.text)}
        </div>
      )}
    </div>
  );
}

/* Auto-linkify URLs in chat messages */
function linkify(text: string): React.ReactNode {
  const regex = /(https?:\/\/[^\s]+)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;
  let i = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    parts.push(
      <a key={i++} href={match[0]} target="_blank" rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        style={{ color: "#7C3AED", textDecoration: "underline", wordBreak: "break-all" }}>
        {match[0]}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : text;
}

const handleStyle: React.CSSProperties = {
  width: 10,
  height: 10,
  background: "#D1D5DB",
  border: "2px solid var(--surface)",
  borderRadius: "50%",
  cursor: "crosshair",
};
