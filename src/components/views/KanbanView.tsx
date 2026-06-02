"use client";

import { useState } from "react";
import type { Node } from "reactflow";
import type { FunnelNodeData, ProjectMember, Project, TaskStatus, NodeTask } from "@/lib/types";
import { PRIORITY_COLORS } from "@/lib/constants";
import { getInitials } from "@/lib/profiles";

interface KanbanViewProps {
  project:  Project | undefined;
  nodes:    Node<FunnelNodeData>[];
  statuses: TaskStatus[];
  members:  ProjectMember[];
  canEdit:  boolean;
  onMoveTask:   (nodeId: string, taskId: string, statusId: string, done: boolean) => void;
  onSelectView: (view: string) => void;
}

interface FlatTask {
  task:      NodeTask;
  nodeId:    string;
  nodeTitle: string;
  nodeIcon:  string;
}

function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
}

export function KanbanView({
  project, nodes, statuses, members, canEdit, onMoveTask, onSelectView,
}: KanbanViewProps) {
  const [overCol, setOverCol] = useState<string | null>(null);

  /* Flatten all tasks across nodes */
  const flat: FlatTask[] = nodes.flatMap((n) =>
    n.data.tasks.map((task) => ({
      task,
      nodeId:    n.id,
      nodeTitle: n.data.title,
      nodeIcon:  n.data.icon,
    }))
  );

  const sortedStatuses = [...statuses].sort((a, b) => a.position - b.position);

  const backBar = (
    <div className="view-back-bar">
      <button className="bt-back-btn" onClick={() => onSelectView("canvas")}>← Embudo</button>
      <span className="view-back-title">Kanban · {project?.name}</span>
    </div>
  );

  if (sortedStatuses.length === 0) {
    return (
      <div className="kb-wrap">
        {backBar}
        <div className="kb-empty">Este proyecto no tiene estados configurados todavía.</div>
      </div>
    );
  }

  if (flat.length === 0) {
    return (
      <div className="kb-wrap">
        {backBar}
        <div className="kb-empty">
          <span style={{ fontSize: 40, display: "block", marginBottom: 8 }}>🗂️</span>
          Aún no hay tareas en este proyecto.
        </div>
      </div>
    );
  }

  const doneCol = sortedStatuses.find((s) => s.category === "done") ?? sortedStatuses[sortedStatuses.length - 1];
  const firstCol = sortedStatuses[0];

  /* Resolve which column a task belongs to */
  function columnForTask(ft: FlatTask): string {
    const matched = sortedStatuses.find((s) => s.id === ft.task.statusId);
    if (matched) return matched.id;
    if (ft.task.done) return doneCol.id;
    return firstCol.id;
  }

  const tasksByColumn: Record<string, FlatTask[]> = {};
  for (const s of sortedStatuses) tasksByColumn[s.id] = [];
  for (const ft of flat) tasksByColumn[columnForTask(ft)].push(ft);

  const handleDrop = (e: React.DragEvent, status: TaskStatus) => {
    e.preventDefault();
    setOverCol(null);
    if (!canEdit) return;
    try {
      const raw = e.dataTransfer.getData("application/json");
      if (!raw) return;
      const { taskId, nodeId } = JSON.parse(raw) as { taskId: string; nodeId: string };
      if (!taskId || !nodeId) return;
      onMoveTask(nodeId, taskId, status.id, status.category === "done");
    } catch {
      /* ignore malformed drop */
    }
  };

  return (
    <div className="kb-wrap">
      {backBar}
      <div className="kb-board">
        {sortedStatuses.map((status) => {
          const colTasks = tasksByColumn[status.id] ?? [];
          return (
            <div key={status.id} className="kb-col">
              <div className="kb-col-header">
                <span className="kb-col-dot" style={{ background: status.color }} />
                <span className="kb-col-name">{status.name}</span>
                <span className="kb-col-count">{colTasks.length}</span>
              </div>
              <div
                className={`kb-col-body${overCol === status.id ? " over" : ""}`}
                onDragOver={(e) => { if (canEdit) { e.preventDefault(); setOverCol(status.id); } }}
                onDragLeave={() => setOverCol((c) => (c === status.id ? null : c))}
                onDrop={(e) => handleDrop(e, status)}
              >
                {colTasks.map((ft) => {
                  const t = ft.task;
                  const pc = PRIORITY_COLORS[t.priority ?? "normal"];
                  const assignee = members.find((m) => m.id === t.assignedTo);
                  return (
                    <div
                      key={t.id}
                      className={`kb-card${t.done ? " done" : ""}`}
                      draggable={canEdit}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("application/json", JSON.stringify({ taskId: t.id, nodeId: ft.nodeId }));
                        e.dataTransfer.effectAllowed = "move";
                      }}
                    >
                      <div className="kb-card-title">{t.text}</div>
                      <div className="kb-card-origin">{ft.nodeIcon} {ft.nodeTitle}</div>
                      <div className="kb-card-meta">
                        {t.dueDate && (
                          <span className="kb-chip kb-date">📅 {fmtDate(t.dueDate)}</span>
                        )}
                        <span className="kb-chip" style={{ background: pc.bg, color: pc.fg }}>
                          {pc.label}
                        </span>
                        {assignee && (
                          <span
                            className="kb-avatar"
                            style={{ background: assignee.color }}
                            title={assignee.full_name || assignee.email}
                          >
                            {getInitials(assignee.full_name || assignee.email)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
                {colTasks.length === 0 && (
                  <div className="kb-col-empty">—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
