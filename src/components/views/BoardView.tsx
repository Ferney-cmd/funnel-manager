"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import type { Node } from "reactflow";
import type { FunnelNodeData, ProjectMember, Project, TaskPriority, ProjectRole, NodeTask } from "@/lib/types";
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
  onMoveTaskToNode: (taskId: string, fromNodeId: string, toNodeId: string, targetIndex: number) => void;
  onSelectView: (view: string) => void;
  commentsByTask:  Record<string, import("@/lib/types").TaskComment[]>;
  loadingComments: Record<string, boolean>;
  onLoadComments:  (taskId: string) => void;
  onAddComment:    (taskId: string, text: string) => void;
  onRenameSection: (nodeId: string, title: string) => void;
  onSetSectionRole: (nodeId: string, role: string) => void;
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

/* ── Toolbar option types ── */
type SortBy   = "manual" | "due" | "priority" | "name";
type GroupBy  = "module" | "assignee" | "priority" | "status";

const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export function BoardView({
  project, nodes, members, me, myRole,
  onAddTask, onToggleTask, onDeleteTask, onSendMessage, onAddModule,
  onUpdateTask, onMoveTaskToNode, onSelectView,
  commentsByTask, loadingComments, onLoadComments, onAddComment,
  onRenameSection, onSetSectionRole,
}: BoardViewProps) {
  const canEdit   = myRole === "owner" || myRole === "editor";

  // Montado en cliente (para portal SSR-safe en Next.js)
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const canDelete = myRole === "owner";

  /* ── Multi-select state ── */
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const toggleSelect = (taskId: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    next.has(taskId) ? next.delete(taskId) : next.add(taskId);
    return next;
  });
  const clearSelection = () => setSelectedIds(new Set());

  const [collapsed,    setCollapsed]   = useState<Record<string, boolean>>({});
  const [expandedSubtasks, setExpandedSubtasks] = useState<Set<string>>(new Set());
  const toggleSubtasks = useCallback((taskId: string) => {
    setExpandedSubtasks((prev) => {
      const next = new Set(prev);
      next.has(taskId) ? next.delete(taskId) : next.add(taskId);
      return next;
    });
  }, []);
  const [selectedTask, setSelectedTask]= useState<{ nodeId: string; taskId: string } | null>(null);
  const [addingIn,     setAddingIn]    = useState<string | null>(null);
  const [addText,      setAddText]     = useState("");
  const [addDate,      setAddDate]     = useState("");
  const [addPriority,  setAddPriority] = useState<TaskPriority>("normal");

  /* ── Inline name editing ── */
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editText,      setEditText]      = useState("");

  /* ── Inline section (module) name editing ── */
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionText,      setSectionText]      = useState("");

  /* ── Section role dropdown ── */
  const [roleMenuNodeId, setRoleMenuNodeId] = useState<string | null>(null);
  const [roleMenuPos,    setRoleMenuPos]    = useState<{ top: number; left: number } | null>(null);
  const [roleCustomMode, setRoleCustomMode] = useState<boolean>(false);
  const [roleCustomText, setRoleCustomText] = useState<string>("");
  const roleMenuRef = useRef<HTMLDivElement>(null);

  const closeRoleMenu = useCallback(() => {
    setRoleMenuNodeId(null);
    setRoleMenuPos(null);
    setRoleCustomMode(false);
    setRoleCustomText("");
  }, []);

  /* ── Drag & drop (reorder / move tasks; module mode only) ── */
  const dragRef = useRef<{ taskId: string; fromNodeId: string } | null>(null);
  const [draggingId,   setDraggingId]   = useState<string | null>(null);
  const [dropIndicator, setDropIndicator] = useState<{ nodeId: string; index: number } | null>(null);

  const clearDrag = useCallback(() => {
    dragRef.current = null;
    setDraggingId(null);
    setDropIndicator(null);
  }, []);

  /* ── Toolbar state ── */
  const [filterAssignee, setFilterAssignee] = useState<string>("");   // "" all, "none" sin asignar, else member id
  const [filterPriority, setFilterPriority] = useState<string>("");   // "" all, else priority
  const [sortBy,         setSortBy]         = useState<SortBy>("manual");
  const [groupBy,        setGroupBy]        = useState<GroupBy>("module");
  const [showCompleted,  setShowCompleted]  = useState<boolean>(true);
  const [openPopover,    setOpenPopover]    = useState<null | "filter" | "sort" | "group" | "options">(null);

  /* ── Saved views (localStorage) ── */
  type SavedView = {
    name: string;
    filterAssignee: string;
    filterPriority: string;
    sortBy: SortBy;
    groupBy: GroupBy;
    showCompleted: boolean;
  };
  const [savedViews,     setSavedViews]     = useState<SavedView[]>([]);
  const [savedViewsOpen, setSavedViewsOpen] = useState(false);
  const [newViewName,    setNewViewName]    = useState("");
  const savedViewsRef = useRef<HTMLDivElement>(null);

  const toolbarRef = useRef<HTMLDivElement>(null);

  /* Load saved views when project changes */
  useEffect(() => {
    if (!project?.id || typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(`fm_views_${project.id}`);
      setSavedViews(raw ? JSON.parse(raw) : []);
    } catch { setSavedViews([]); }
  }, [project?.id]);

  /* close saved-views popover on outside click */
  useEffect(() => {
    if (!savedViewsOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (savedViewsRef.current && !savedViewsRef.current.contains(e.target as globalThis.Node)) setSavedViewsOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [savedViewsOpen]);

  /* close popover on outside click */
  useEffect(() => {
    if (!openPopover) return;
    const onDoc = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as globalThis.Node)) setOpenPopover(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [openPopover]);

  /* close section role dropdown on outside click or scroll */
  useEffect(() => {
    if (!roleMenuNodeId) return;
    const onDoc = (e: MouseEvent) => {
      if (roleMenuRef.current && !roleMenuRef.current.contains(e.target as globalThis.Node)) closeRoleMenu();
    };
    const onScroll = (e: Event) => {
      // ignore scrolling that happens inside the dropdown itself (browsing roles)
      if (roleMenuRef.current && roleMenuRef.current.contains(e.target as globalThis.Node)) return;
      closeRoleMenu();
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [roleMenuNodeId, closeRoleMenu]);

  const filtersActive = filterAssignee !== "" || filterPriority !== "";
  const clearFilters = () => { setFilterAssignee(""); setFilterPriority(""); };

  /* ── AI task generation (one section at a time) ── */
  type AiSuggestion = { text: string; priority: TaskPriority };
  const [aiNodeId,      setAiNodeId]      = useState<string | null>(null);
  const [aiPrompt,      setAiPrompt]      = useState("");
  const [aiLoading,     setAiLoading]     = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const [aiChecked,     setAiChecked]     = useState<boolean[]>([]);
  const [aiError,       setAiError]       = useState("");

  const toggleCollapse = useCallback((id: string) =>
    setCollapsed((p) => ({ ...p, [id]: !p[id] })), []);

  const clearAi = () => {
    setAiNodeId(null); setAiPrompt(""); setAiLoading(false);
    setAiSuggestions([]); setAiChecked([]); setAiError("");
  };

  const openAi = (nodeId: string) => {
    clearAdd();
    setAddingIn(null);
    setAiNodeId(nodeId); setAiPrompt(""); setAiLoading(false);
    setAiSuggestions([]); setAiChecked([]); setAiError("");
  };

  const generateAi = async (node: Node<FunnelNodeData>) => {
    if (!aiPrompt.trim() || aiLoading) return;
    setAiLoading(true); setAiError(""); setAiSuggestions([]); setAiChecked([]);
    try {
      const res = await fetch("/api/ai/tasks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          context: {
            nodeTitle: node.data.title,
            role: node.data.role,
            existingTasks: node.data.tasks.map((t) => t.text),
          },
        }),
      });
      const data = await res.json();
      if (data?.error === "AI_NOT_CONFIGURED") {
        setAiError("⚠ La IA no está configurada. Pídele al administrador configurar la API key.");
      } else if (data?.error || !Array.isArray(data?.tasks)) {
        setAiError("No se pudo generar. Intenta de nuevo.");
      } else {
        const valid = ["low", "normal", "high", "urgent"];
        const sugg: AiSuggestion[] = data.tasks
          .filter((t: any) => t && typeof t.text === "string" && t.text.trim())
          .map((t: any) => ({
            text: String(t.text),
            priority: (valid.includes(t.priority) ? t.priority : "normal") as TaskPriority,
          }));
        if (sugg.length === 0) {
          setAiError("No se pudo generar. Intenta de nuevo.");
        } else {
          setAiSuggestions(sugg);
          setAiChecked(sugg.map(() => true));
        }
      }
    } catch {
      setAiError("No se pudo generar. Intenta de nuevo.");
    } finally {
      setAiLoading(false);
    }
  };

  const addAiSelected = (nodeId: string) => {
    aiSuggestions.forEach((s, i) => {
      if (aiChecked[i]) onAddTask(nodeId, s.text, undefined, s.priority);
    });
    clearAi();
  };

  useEffect(() => {
    if (selectedTask?.taskId) onLoadComments(selectedTask.taskId);
  }, [selectedTask?.taskId, onLoadComments]);

  /* Clear multi-selection when groupBy changes */
  useEffect(() => { clearSelection(); }, [groupBy]); // eslint-disable-line react-hooks/exhaustive-deps

  const clearAdd = () => { setAddingIn(null); setAddText(""); setAddDate(""); setAddPriority("normal"); };

  const submitAdd = (nodeId: string) => {
    if (!addText.trim()) return;
    onAddTask(nodeId, addText.trim(), addDate || undefined, addPriority);
    clearAdd();
  };

  /* ── Inline edit handlers ── */
  const startEdit = (task: NodeTask) => { setEditingTaskId(task.id); setEditText(task.text); };
  const cancelEdit = () => { setEditingTaskId(null); setEditText(""); };
  const commitEdit = (nodeId: string, task: NodeTask) => {
    const next = editText.trim();
    if (next && next !== task.text) onUpdateTask(nodeId, task.id, { text: next });
    cancelEdit();
  };

  /* ── Inline section-name edit handlers ── */
  const startSectionEdit = (nodeId: string, title: string) => {
    setEditingSectionId(nodeId); setSectionText(title);
  };
  const cancelSectionEdit = () => { setEditingSectionId(null); setSectionText(""); };
  const commitSectionEdit = (nodeId: string, currentTitle: string) => {
    const next = sectionText.trim();
    if (next && next !== currentTitle) onRenameSection(nodeId, next);
    cancelSectionEdit();
  };

  /* ── Sorting helper ── */
  const sortTasks = useCallback((tasks: NodeTask[]): NodeTask[] => {
    const arr = [...tasks];
    switch (sortBy) {
      case "due":
        arr.sort((a, b) => {
          const av = a.dueDate ? new Date(a.dueDate).getTime() : Infinity;
          const bv = b.dueDate ? new Date(b.dueDate).getTime() : Infinity;
          return av - bv;
        });
        break;
      case "priority":
        arr.sort((a, b) => PRIORITY_RANK[a.priority ?? "normal"] - PRIORITY_RANK[b.priority ?? "normal"]);
        break;
      case "name":
        arr.sort((a, b) => a.text.localeCompare(b.text, "es"));
        break;
      case "manual":
      default:
        arr.sort((a, b) => a.order - b.order);
        break;
    }
    return arr;
  }, [sortBy]);

  /* ── Filter helper ── */
  const passFilters = useCallback((t: NodeTask): boolean => {
    if (filterAssignee === "none") { if (t.assignedTo) return false; }
    else if (filterAssignee !== "") { if (t.assignedTo !== filterAssignee) return false; }
    if (filterPriority !== "" && (t.priority ?? "normal") !== filterPriority) return false;
    if (!showCompleted && t.done) return false;
    return true;
  }, [filterAssignee, filterPriority, showCompleted]);

  /* ── Derived groups (non-module modes) ── */
  type FlatRow  = { task: NodeTask; node: Node<FunnelNodeData> };
  type DerivedGroup = { key: string; label: string; icon?: string; rows: FlatRow[] };

  const derivedGroups = useMemo<DerivedGroup[]>(() => {
    if (groupBy === "module") return [];

    const flat: FlatRow[] = [];
    for (const n of nodes) {
      for (const t of n.data.tasks) {
        if (passFilters(t)) flat.push({ task: t, node: n });
      }
    }

    const groups: DerivedGroup[] = [];

    if (groupBy === "assignee") {
      const map = new Map<string, FlatRow[]>();
      for (const r of flat) {
        const key = r.task.assignedTo || "__none__";
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(r);
      }
      for (const m of members) {
        const rows = map.get(m.id);
        if (rows) groups.push({ key: m.id, label: m.full_name || m.email, rows });
      }
      const noneRows = map.get("__none__");
      if (noneRows) groups.push({ key: "__none__", label: "Sin asignar", rows: noneRows });
    } else if (groupBy === "priority") {
      const order: TaskPriority[] = ["urgent", "high", "normal", "low"];
      const map = new Map<TaskPriority, FlatRow[]>();
      for (const r of flat) {
        const p = r.task.priority ?? "normal";
        if (!map.has(p)) map.set(p, []);
        map.get(p)!.push(r);
      }
      for (const p of order) {
        const rows = map.get(p);
        if (rows) groups.push({ key: p, label: PRIORITY_COLORS[p].label, rows });
      }
    } else if (groupBy === "status") {
      const pending = flat.filter((r) => !r.task.done);
      const done    = flat.filter((r) => r.task.done);
      if (pending.length) groups.push({ key: "pending", label: "Pendientes", rows: pending });
      if (done.length)    groups.push({ key: "done",    label: "Completadas", rows: done });
    }

    // sort within each group
    for (const g of groups) {
      const sorted = sortTasks(g.rows.map((r) => r.task));
      const byId = new Map(g.rows.map((r) => [r.task.id, r]));
      g.rows = sorted.map((t) => byId.get(t.id)!);
    }

    return groups;
  }, [groupBy, nodes, members, passFilters, sortTasks]);

  /* ── taskId → {nodeId, task} lookup for bulk actions ── */
  const taskLookup = useMemo(() => {
    const map = new Map<string, { nodeId: string; task: import("@/lib/types").NodeTask }>();
    for (const n of nodes) {
      for (const t of n.data.tasks) {
        map.set(t.id, { nodeId: n.id, task: t });
      }
    }
    return map;
  }, [nodes]);

  if (!project) return (
    <div className="view-placeholder">
      <span style={{ fontSize: 32 }}>▤</span>
      <p>Selecciona un proyecto</p>
    </div>
  );

  /* ── Export CSV ── */
  function exportCSV() {
    const rows: string[][] = [["Módulo", "Tarea", "Responsable", "Fecha límite", "Prioridad", "Estado"]];
    for (const node of nodes) {
      for (const task of node.data.tasks) {
        const assignee = members.find((m) => m.id === task.assignedTo)?.full_name ?? "";
        rows.push([
          node.data.title,
          task.text,
          assignee,
          task.dueDate ?? "",
          task.priority ?? "normal",
          task.done ? "Completada" : "Pendiente",
        ]);
      }
    }
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project?.name ?? "tablero"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const totalTasks = nodes.reduce((a, n) => a + n.data.tasks.length, 0);
  const doneTasks  = nodes.reduce((a, n) => a + n.data.tasks.filter((t) => t.done).length, 0);
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  /* selected task object */
  const selNode = selectedTask ? nodes.find((n) => n.id === selectedTask.nodeId) : null;
  const selTask = selNode?.data.tasks.find((t) => t.id === selectedTask?.taskId) ?? null;

  const panelOpen = !!selTask;

  /* ── Subtask child row (1 level deep, no checkbox, no subtask expand) ── */
  const renderSubtaskRow = (t: NodeTask, node: Node<FunnelNodeData>) => {
    const alert    = computeTaskAlertStatus(t);
    const ac       = ALERT_COLORS[alert];
    const pc       = PRIORITY_COLORS[t.priority ?? "normal"];
    const assignee = members.find((m) => m.id === t.assignedTo);
    const isActive = selectedTask?.taskId === t.id;

    return (
      <div
        key={`sub:${node.id}:${t.id}`}
        className={`al-task-row al-subtask-row${t.done ? " done" : ""}${isActive ? " active" : ""}`}
        onClick={() => setSelectedTask({ nodeId: node.id, taskId: t.id })}
      >
        <div className="al-check-cell">
          <button
            className={`al-check${t.done ? " done" : ""}`}
            onClick={(e) => { e.stopPropagation(); onToggleTask(node.id, t.id); }}
          />
        </div>
        <div className="al-col-name al-task-name">
          <span className={`al-task-text${t.done ? " done" : ""}`}>{t.text}</span>
        </div>
        <div className="al-col-assignee">
          {assignee ? (
            <span className="al-avatar" style={{ background: assignee.color }} title={assignee.full_name || assignee.email}>
              {getInitials(assignee.full_name || assignee.email)}
            </span>
          ) : (
            <span className="al-avatar empty" title="Sin asignar">+</span>
          )}
        </div>
        <div className="al-col-date">
          {t.dueDate ? (
            <span className="al-date-chip" style={{ color: alert === "overdue" || alert === "due_today" ? "#E24B4A" : "var(--text2)" }}>
              📅 {fmtDate(t.dueDate)}
            </span>
          ) : (
            <span className="al-date-empty">—</span>
          )}
        </div>
        <div className="al-col-priority">
          <span className="al-priority-chip" style={{ background: pc.bg, color: pc.fg }}>{pc.label}</span>
        </div>
        <div className="al-col-status">
          {!t.done && t.dueDate && (
            <span className={`task-alert-badge task-alert-${alert}`} style={{ background: ac.bg, color: ac.fg }}>{ac.label}</span>
          )}
          {t.done && <span style={{ fontSize: 11, color: "#10B981" }}>✓ Hecha</span>}
        </div>
      </div>
    );
  };

  /* ── Reusable task row ──
     dndIndex: visual index within the section. When provided (module mode + canEdit)
     the row becomes draggable and a drop target. */
  const renderTaskRow = (t: NodeTask, node: Node<FunnelNodeData>, dndIndex?: number) => {
    const alert    = computeTaskAlertStatus(t);
    const ac       = ALERT_COLORS[alert];
    const pc       = PRIORITY_COLORS[t.priority ?? "normal"];
    const assignee = members.find((m) => m.id === t.assignedTo);
    const isActive  = selectedTask?.taskId === t.id;
    const isEditing = editingTaskId === t.id;
    const dndOn     = canEdit && groupBy === "module" && sortBy === "manual" && dndIndex !== undefined && !isEditing;
    const isMultiSelected = selectedIds.has(t.id);
    const anySelected = selectedIds.size > 0;

    // Subtask children (root tasks only — parentTaskId == null)
    const nodeTaskList = node.data.tasks;
    const isRootTask = !t.parentTaskId;
    const children = isRootTask ? nodeTaskList.filter((c) => c.parentTaskId === t.id) : [];
    const hasChildren = children.length > 0;
    const subExpanded = expandedSubtasks.has(t.id);

    const showIndicatorBefore =
      dndOn && dropIndicator?.nodeId === node.id && dropIndicator.index === dndIndex;

    return (
      <div key={`wrap:${node.id}:${t.id}`}>
        {showIndicatorBefore && <div className="al-drop-indicator" />}
      <div
        key={`${node.id}:${t.id}`}
        draggable={dndOn}
        className={`al-task-row${t.done ? " done" : ""}${isActive ? " active" : ""}${draggingId === t.id ? " dragging" : ""}${isMultiSelected ? " multi-selected" : ""}`}
        onClick={() => { if (!isEditing) setSelectedTask({ nodeId: node.id, taskId: t.id }); }}
        onDragStart={dndOn ? (e) => {
          dragRef.current = { taskId: t.id, fromNodeId: node.id };
          e.dataTransfer.effectAllowed = "move";
          try { e.dataTransfer.setData("text/plain", t.id); } catch {}
          setDraggingId(t.id);
        } : undefined}
        onDragOver={dndOn ? (e) => {
          if (!dragRef.current) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "move";
          const rect = e.currentTarget.getBoundingClientRect();
          const after = e.clientY - rect.top > rect.height / 2;
          const idx = after ? dndIndex! + 1 : dndIndex!;
          setDropIndicator((cur) =>
            cur && cur.nodeId === node.id && cur.index === idx ? cur : { nodeId: node.id, index: idx }
          );
        } : undefined}
        onDrop={dndOn ? (e) => {
          e.preventDefault();
          e.stopPropagation();
          const drag = dragRef.current;
          if (!drag) { clearDrag(); return; }
          const rect = e.currentTarget.getBoundingClientRect();
          const after = e.clientY - rect.top > rect.height / 2;
          const idx = after ? dndIndex! + 1 : dndIndex!;
          if (!(drag.taskId === t.id)) {
            onMoveTaskToNode(drag.taskId, drag.fromNodeId, node.id, idx);
          }
          clearDrag();
        } : undefined}
        onDragEnd={dndOn ? clearDrag : undefined}
      >
        {/* checkbox cell: sel-check (square) overlays al-check (circle) on hover */}
        <div className="al-check-cell">
          {hasChildren && (
            <button
              className="al-subtask-toggle"
              onClick={(e) => { e.stopPropagation(); toggleSubtasks(t.id); }}
              title={subExpanded ? "Ocultar subtareas" : `Ver ${children.length} subtarea${children.length !== 1 ? "s" : ""}`}
            >
              {subExpanded ? "▾" : "▸"} {children.length}
            </button>
          )}
          {canEdit && (
            <button
              className={`al-sel-check${isMultiSelected ? " checked" : ""}${anySelected ? " always-show" : ""}`}
              onClick={(e) => { e.stopPropagation(); toggleSelect(t.id); }}
              title={isMultiSelected ? "Deseleccionar" : "Seleccionar"}
              aria-label={isMultiSelected ? "Deseleccionar tarea" : "Seleccionar tarea"}
            />
          )}
          <button
            className={`al-check${t.done ? " done" : ""}`}
            onClick={(e) => { e.stopPropagation(); onToggleTask(node.id, t.id); }}
          />
        </div>

        {/* name */}
        <div className="al-col-name al-task-name">
          {isEditing ? (
            <input
              autoFocus
              type="text"
              className="al-task-name-input"
              value={editText}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setEditText(e.target.value)}
              onBlur={() => commitEdit(node.id, t)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") commitEdit(node.id, t);
                if (e.key === "Escape") cancelEdit();
              }}
            />
          ) : (
            <span
              className={`al-task-text${t.done ? " done" : ""}${canEdit ? " editable" : ""}`}
              onClick={(e) => { if (canEdit) { e.stopPropagation(); startEdit(t); } }}
            >
              {t.text}
            </span>
          )}
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
      {/* Subtask rows (1 level deep) */}
      {hasChildren && subExpanded && children.map((child) => renderSubtaskRow(child, node))}
      </div>
    );
  };

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

      {/* ── Toolbar ── */}
      <div className="lt-toolbar" ref={toolbarRef}>
        {/* Filtrar */}
        <div style={{ position: "relative" }}>
          <button
            className={`lt-tool-btn${filtersActive ? " active" : ""}`}
            onClick={() => setOpenPopover((p) => (p === "filter" ? null : "filter"))}
          >
            Filtrar ▾
          </button>
          {openPopover === "filter" && (
            <div className="lt-popover">
              <div className="lt-popover-row">
                <span className="lt-pop-label">Responsable</span>
                <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)}>
                  <option value="">Todos</option>
                  <option value="none">Sin asignar</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>{m.full_name || m.email}</option>
                  ))}
                </select>
              </div>
              <div className="lt-popover-row">
                <span className="lt-pop-label">Prioridad</span>
                <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
                  <option value="">Todas</option>
                  <option value="low">Baja</option>
                  <option value="normal">Normal</option>
                  <option value="high">Alta</option>
                  <option value="urgent">Urgente</option>
                </select>
              </div>
              {filtersActive && (
                <button className="lt-clear-link" onClick={clearFilters}>Limpiar filtros</button>
              )}
            </div>
          )}
        </div>

        {/* Ordenar */}
        <div style={{ position: "relative" }}>
          <button
            className={`lt-tool-btn${sortBy !== "manual" ? " active" : ""}`}
            onClick={() => setOpenPopover((p) => (p === "sort" ? null : "sort"))}
          >
            Ordenar ▾
          </button>
          {openPopover === "sort" && (
            <div className="lt-popover">
              {([
                ["manual",   "Manual"],
                ["due",      "Fecha límite"],
                ["priority", "Prioridad"],
                ["name",     "Nombre (A–Z)"],
              ] as [SortBy, string][]).map(([val, label]) => (
                <label key={val} className="lt-popover-row lt-radio">
                  <input
                    type="radio"
                    name="lt-sort"
                    checked={sortBy === val}
                    onChange={() => setSortBy(val)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Agrupar */}
        <div style={{ position: "relative" }}>
          <button
            className={`lt-tool-btn${groupBy !== "module" ? " active" : ""}`}
            onClick={() => setOpenPopover((p) => (p === "group" ? null : "group"))}
          >
            Agrupar ▾
          </button>
          {openPopover === "group" && (
            <div className="lt-popover">
              {([
                ["module",   "Módulo"],
                ["assignee", "Responsable"],
                ["priority", "Prioridad"],
                ["status",   "Estado"],
              ] as [GroupBy, string][]).map(([val, label]) => (
                <label key={val} className="lt-popover-row lt-radio">
                  <input
                    type="radio"
                    name="lt-group"
                    checked={groupBy === val}
                    onChange={() => setGroupBy(val)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        {/* Opciones */}
        <div style={{ position: "relative" }}>
          <button
            className="lt-tool-btn"
            onClick={() => setOpenPopover((p) => (p === "options" ? null : "options"))}
          >
            Opciones ▾
          </button>
          {openPopover === "options" && (
            <div className="lt-popover">
              <label className="lt-popover-row lt-radio">
                <input
                  type="checkbox"
                  checked={showCompleted}
                  onChange={(e) => setShowCompleted(e.target.checked)}
                />
                <span>Mostrar tareas completadas</span>
              </label>
            </div>
          )}
        </div>

        {/* Saved views */}
        <div style={{ position: "relative" }} ref={savedViewsRef}>
          <button
            className={`lt-tool-btn${savedViewsOpen ? " active" : ""}`}
            onClick={() => { setOpenPopover(null); setSavedViewsOpen((p) => !p); }}
            title="Vistas guardadas"
          >
            💾
          </button>
          {savedViewsOpen && (
            <div className="al-savedviews-popover">
              <div style={{ marginBottom: 8 }}>
                <input
                  className="al-savedviews-input"
                  placeholder="Nombre de esta vista…"
                  value={newViewName}
                  onChange={(e) => setNewViewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") setSavedViewsOpen(false); }}
                />
                <button
                  className="lt-tool-btn"
                  style={{ marginTop: 6, width: "100%" }}
                  disabled={!newViewName.trim()}
                  onClick={() => {
                    if (!newViewName.trim() || !project?.id) return;
                    const view: SavedView = {
                      name: newViewName.trim(),
                      filterAssignee, filterPriority, sortBy, groupBy, showCompleted,
                    };
                    const next = [...savedViews.slice(-9), view];
                    setSavedViews(next);
                    localStorage.setItem(`fm_views_${project.id}`, JSON.stringify(next));
                    setNewViewName("");
                  }}
                >
                  Guardar
                </button>
              </div>
              {savedViews.length > 0 && (
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 6 }}>
                  {savedViews.map((sv, i) => (
                    <div key={i} className="al-savedview-item">
                      <span
                        style={{ flex: 1, cursor: "pointer", fontSize: 12 }}
                        onClick={() => {
                          setFilterAssignee(sv.filterAssignee);
                          setFilterPriority(sv.filterPriority);
                          setSortBy(sv.sortBy);
                          setGroupBy(sv.groupBy);
                          setShowCompleted(sv.showCompleted);
                          setSavedViewsOpen(false);
                        }}
                      >
                        {sv.name}
                      </span>
                      <button
                        style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text3)", fontSize: 12, padding: "0 4px" }}
                        title="Eliminar vista"
                        onClick={() => {
                          const next = savedViews.filter((_, j) => j !== i);
                          setSavedViews(next);
                          if (project?.id) localStorage.setItem(`fm_views_${project.id}`, JSON.stringify(next));
                        }}
                      >
                        🗑
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {savedViews.length === 0 && (
                <div style={{ fontSize: 11, color: "var(--text3)", textAlign: "center", paddingTop: 4 }}>
                  No hay vistas guardadas
                </div>
              )}
            </div>
          )}
        </div>

        {/* Export CSV */}
        <button
          className="lt-tool-btn"
          onClick={exportCSV}
          title="Exportar tareas a CSV"
          style={{ marginLeft: "auto" }}
        >
          ⬇ CSV
        </button>
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
          ) : groupBy === "module" ? (
            nodes.map((n) => {
              const isCol     = collapsed[n.id] ?? false;
              const roleColor = ROLE_COLORS[n.data.role] ?? "#7C3AED";
              const doneCnt   = n.data.tasks.filter((t) => t.done).length;
              const visibleTasks = sortTasks(n.data.tasks.filter(passFilters));

              return (
                <div key={n.id} className="al-section">
                  {/* Section header */}
                  <div className="al-section-header">
                    <button className="al-chevron" onClick={() => toggleCollapse(n.id)}>
                      {isCol ? "▸" : "▾"}
                    </button>
                    <span className="al-section-icon">{n.data.icon}</span>
                    {editingSectionId === n.id ? (
                      <input
                        autoFocus
                        type="text"
                        className="al-section-name-input"
                        value={sectionText}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setSectionText(e.target.value)}
                        onBlur={() => commitSectionEdit(n.id, n.data.title)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") commitSectionEdit(n.id, n.data.title);
                          if (e.key === "Escape") cancelSectionEdit();
                        }}
                      />
                    ) : (
                      <span
                        className={`al-section-name${canEdit ? " editable" : ""}`}
                        onClick={canEdit ? (e) => { e.stopPropagation(); startSectionEdit(n.id, n.data.title); } : undefined}
                      >
                        {n.data.title}
                      </span>
                    )}
                    {canEdit ? (
                      <span style={{ position: "relative" }} onClick={(e) => e.stopPropagation()}>
                        <button
                          className="al-role-chip"
                          style={{ color: roleColor }}
                          title="Cambiar rol"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (roleMenuNodeId === n.id) {
                              closeRoleMenu();
                            } else {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setRoleMenuPos({ top: rect.bottom + 4, left: rect.left });
                              setRoleCustomMode(false);
                              setRoleCustomText("");
                              setRoleMenuNodeId(n.id);
                            }
                          }}
                        >
                          <span className="al-role-dot" style={{ background: roleColor }} />
                          {ROLE_LABELS[n.data.role] ?? n.data.role}
                          <span style={{ fontSize: 8 }}>▾</span>
                        </button>
                        {mounted && roleMenuNodeId === n.id && roleMenuPos && createPortal(
                          <div
                            className="al-role-dropdown"
                            ref={roleMenuRef}
                            style={{
                              top: roleMenuPos.top,
                              left: Math.min(roleMenuPos.left, (typeof window !== "undefined" ? window.innerWidth : roleMenuPos.left + 250) - 250),
                            }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {roleCustomMode ? (
                              <div className="al-role-custom">
                                <input
                                  autoFocus
                                  type="text"
                                  placeholder="Nombre del rol…"
                                  value={roleCustomText}
                                  onChange={(e) => setRoleCustomText(e.target.value)}
                                  onKeyDown={(e) => {
                                    e.stopPropagation();
                                    if (e.key === "Enter") {
                                      const v = roleCustomText.trim();
                                      if (v) { onSetSectionRole(n.id, v); closeRoleMenu(); }
                                    }
                                    if (e.key === "Escape") { setRoleCustomMode(false); setRoleCustomText(""); }
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const v = roleCustomText.trim();
                                    if (v) { onSetSectionRole(n.id, v); closeRoleMenu(); }
                                  }}
                                >
                                  Guardar
                                </button>
                              </div>
                            ) : (
                              <>
                                {Object.keys(ROLE_LABELS).map((roleKey) => (
                                  <button
                                    key={roleKey}
                                    className="al-role-option"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSetSectionRole(n.id, roleKey);
                                      closeRoleMenu();
                                    }}
                                  >
                                    <span className="al-role-dot" style={{ background: ROLE_COLORS[roleKey] ?? "#7C3AED" }} />
                                    {ROLE_LABELS[roleKey]}
                                  </button>
                                ))}
                                <button
                                  className="al-role-option"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRoleCustomText("");
                                    setRoleCustomMode(true);
                                  }}
                                >
                                  ➕ Otro…
                                </button>
                              </>
                            )}
                          </div>,
                          document.body
                        )}
                      </span>
                    ) : (
                      <span className="al-section-role" style={{ color: roleColor }}>
                        {ROLE_LABELS[n.data.role] ?? n.data.role}
                      </span>
                    )}
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
                    {canEdit && (
                      <button
                        className="ai-trigger-btn"
                        onClick={() => openAi(n.id)}
                        title="Generar tareas con IA"
                      >
                        ✨ IA
                      </button>
                    )}
                  </div>

                  {!isCol && (
                    <>
                      {/* ── AI composer ── */}
                      {aiNodeId === n.id && (
                        <div className="ai-composer">
                          <div className="ai-composer-row">
                            <input
                              autoFocus
                              type="text"
                              className="ai-input"
                              placeholder="Describe qué tareas necesitas… ej: 5 tareas para configurar el dominio"
                              value={aiPrompt}
                              disabled={aiLoading}
                              onChange={(e) => setAiPrompt(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") generateAi(n);
                                if (e.key === "Escape") clearAi();
                              }}
                            />
                            <button
                              className="ai-generate-btn"
                              onClick={() => generateAi(n)}
                              disabled={aiLoading || !aiPrompt.trim()}
                            >
                              {aiLoading ? "Generando…" : "Generar"}
                            </button>
                            <button className="ai-cancel-btn" onClick={clearAi} title="Cerrar">✕</button>
                          </div>

                          {aiError && <div className="ai-error">{aiError}</div>}

                          {aiSuggestions.length > 0 && (
                            <>
                              <div className="ai-suggestions">
                                {aiSuggestions.map((s, i) => {
                                  const pc = PRIORITY_COLORS[s.priority];
                                  return (
                                    <label key={i} className="ai-suggestion-row">
                                      <input
                                        type="checkbox"
                                        className="ai-checkbox"
                                        checked={aiChecked[i] ?? false}
                                        onChange={(e) =>
                                          setAiChecked((prev) => {
                                            const next = [...prev];
                                            next[i] = e.target.checked;
                                            return next;
                                          })
                                        }
                                      />
                                      <span className="ai-suggestion-text">{s.text}</span>
                                      <span className="ai-chip" style={{ background: pc.bg, color: pc.fg }}>
                                        {pc.label}
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                              <div className="ai-composer-actions">
                                <button
                                  className="ai-add-btn"
                                  onClick={() => addAiSelected(n.id)}
                                  disabled={!aiChecked.some(Boolean)}
                                >
                                  Agregar seleccionadas
                                </button>
                                <button className="ai-discard-btn" onClick={clearAi}>Descartar</button>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {/* Task rows (drop target wrapper for reorder / move) */}
                      {(() => {
                        const dndActive = canEdit && groupBy === "module" && sortBy === "manual";
                        return (
                          <div
                            className="al-section-body"
                            onDragOver={dndActive ? (e) => {
                              if (!dragRef.current) return;
                              e.preventDefault();
                              e.dataTransfer.dropEffect = "move";
                              // Only set "append" indicator when not hovering a specific row.
                              if (e.target === e.currentTarget) {
                                const idx = visibleTasks.length;
                                setDropIndicator((cur) =>
                                  cur && cur.nodeId === n.id && cur.index === idx ? cur : { nodeId: n.id, index: idx }
                                );
                              }
                            } : undefined}
                            onDrop={dndActive ? (e) => {
                              if (!dragRef.current) { clearDrag(); return; }
                              // Only handle drops that landed on the body itself (rows handle their own).
                              if (e.target !== e.currentTarget) return;
                              e.preventDefault();
                              const drag = dragRef.current;
                              onMoveTaskToNode(drag.taskId, drag.fromNodeId, n.id, visibleTasks.length);
                              clearDrag();
                            } : undefined}
                          >
                            {visibleTasks.map((t, i) => renderTaskRow(t, n, i))}
                            {/* trailing drop indicator (append position) */}
                            {dndActive && dropIndicator?.nodeId === n.id && dropIndicator.index === visibleTasks.length && (
                              <div className="al-drop-indicator" />
                            )}
                          </div>
                        );
                      })()}

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
            })
          ) : (
            /* ── Non-module grouping ── */
            derivedGroups.map((g) => {
              const isCol = collapsed[`g:${g.key}`] ?? false;
              return (
                <div key={g.key} className="al-section">
                  <div className="al-section-header">
                    <button className="al-chevron" onClick={() => toggleCollapse(`g:${g.key}`)}>
                      {isCol ? "▸" : "▾"}
                    </button>
                    <span className="al-section-name">{g.label}</span>
                    <span className="al-section-count">{g.rows.length}</span>
                  </div>
                  {!isCol && g.rows.map((r) => renderTaskRow(r.task, r.node))}
                </div>
              );
            })
          )}
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

      {/* ── Bulk actions bar ── */}
      {selectedIds.size > 0 && (
        <div className="al-bulk-bar">
          <div className="al-bulk-left">
            <span className="al-bulk-count">{selectedIds.size} tarea{selectedIds.size !== 1 ? "s" : ""} seleccionada{selectedIds.size !== 1 ? "s" : ""}</span>
            <button className="al-bulk-btn al-bulk-deselect" onClick={clearSelection}>✕ Deseleccionar todo</button>
          </div>
          {canEdit && (
            <div className="al-bulk-right">
              {/* Completar pending tasks */}
              <button
                className="al-bulk-btn"
                onClick={() => {
                  selectedIds.forEach((id) => {
                    const entry = taskLookup.get(id);
                    if (entry && !entry.task.done) onToggleTask(entry.nodeId, id);
                  });
                  clearSelection();
                }}
              >
                ✓ Completar
              </button>
              {/* Marcar pendiente */}
              <button
                className="al-bulk-btn"
                onClick={() => {
                  selectedIds.forEach((id) => {
                    const entry = taskLookup.get(id);
                    if (entry && entry.task.done) onToggleTask(entry.nodeId, id);
                  });
                  clearSelection();
                }}
              >
                ↩ Pendiente
              </button>
              {/* Mover a módulo */}
              {groupBy === "module" && (
                <select
                  className="al-bulk-btn al-bulk-move"
                  defaultValue=""
                  onChange={(e) => {
                    const toNodeId = e.target.value;
                    if (!toNodeId) return;
                    const toNode = nodes.find((n) => n.id === toNodeId);
                    const targetIndex = toNode ? toNode.data.tasks.length : 0;
                    selectedIds.forEach((id) => {
                      const entry = taskLookup.get(id);
                      if (entry && entry.nodeId !== toNodeId) {
                        onMoveTaskToNode(id, entry.nodeId, toNodeId, targetIndex);
                      }
                    });
                    clearSelection();
                    e.target.value = "";
                  }}
                >
                  <option value="">↗ Mover a módulo…</option>
                  {nodes.map((n) => (
                    <option key={n.id} value={n.id}>{n.data.icon} {n.data.title}</option>
                  ))}
                </select>
              )}
              {/* Eliminar (owner only) */}
              {canDelete && (
                <button
                  className="al-bulk-btn al-bulk-delete"
                  onClick={() => {
                    if (!confirm(`¿Eliminar ${selectedIds.size} tarea${selectedIds.size !== 1 ? "s" : ""} seleccionada${selectedIds.size !== 1 ? "s" : ""}?`)) return;
                    selectedIds.forEach((id) => {
                      const entry = taskLookup.get(id);
                      if (entry) onDeleteTask(entry.nodeId, id);
                    });
                    clearSelection();
                  }}
                >
                  🗑 Eliminar
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
