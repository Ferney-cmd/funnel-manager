"use client";

import type { Node } from "reactflow";
import type { FunnelNodeData, ProjectMember, Project } from "@/lib/types";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/constants";
import { getInitials } from "@/lib/profiles";

interface RolesViewProps {
  project:      Project | undefined;
  nodes:        Node<FunnelNodeData>[];
  members:      ProjectMember[];
  onSelectView: (view: string) => void;
}

export function RolesView({ project, nodes, members, onSelectView }: RolesViewProps) {
  if (!project) {
    return (
      <div className="view-placeholder">
        <span style={{ fontSize: 32 }}>◎</span>
        <p>Selecciona un proyecto para ver los roles</p>
      </div>
    );
  }

  const roles = Object.keys(ROLE_LABELS);
  const sections = roles
    .map((role) => ({
      role,
      label: ROLE_LABELS[role],
      color: ROLE_COLORS[role],
      nodes: nodes.filter((n) => n.data.role === role),
    }))
    .filter((s) => s.nodes.length > 0);

  if (sections.length === 0) {
    return (
      <div className="view-placeholder">
        <span style={{ fontSize: 32 }}>◎</span>
        <p>No hay módulos creados aún.</p>
      </div>
    );
  }

  return (
    <div className="roles-view">
      <div className="view-back-bar">
        <button className="bt-back-btn" onClick={() => onSelectView("canvas")}>← Embudo</button>
        <span className="view-back-title">Roles · {project.name}</span>
      </div>
      <div className="roles-header">
        <div className="roles-header-title">Roles · {project.name}</div>
        <div className="roles-header-sub">{nodes.length} módulos · {sections.length} roles activos</div>
      </div>

      {sections.map(({ role, label, color, nodes: roleNodes }) => {
        const allTasks = roleNodes.flatMap((n) => n.data.tasks);
        const done     = allTasks.filter((t) => t.done).length;
        const pct      = allTasks.length ? Math.round((done / allTasks.length) * 100) : 0;

        return (
          <div key={role} className="roles-section">
            {/* Role header */}
            <div className="roles-section-header">
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
              <span className="roles-section-title" style={{ color }}>{label}</span>
              <span className="roles-section-meta">{roleNodes.length} módulos · {done}/{allTasks.length} tareas</span>
              <div className="roles-section-bar">
                <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 999, transition: "width 0.3s" }} />
              </div>
              <span className="roles-section-pct" style={{ color }}>{pct}%</span>
            </div>

            {/* Module cards */}
            <div className="roles-cards">
              {roleNodes.map((n) => {
                const t       = n.data.tasks;
                const d       = t.filter((x) => x.done).length;
                const pc      = t.length ? Math.round((d / t.length) * 100) : 0;
                const status  = pc === 100 ? "✓ Completado" : pc > 0 ? "En curso" : "Pendiente";
                const statusC = pc === 100 ? "#10B981" : pc > 0 ? "#F59E0B" : "#6B7280";
                const assignee = members.find((m) => m.id === n.data.assignedTo);

                return (
                  <div key={n.id} className="roles-card">
                    <div className="roles-card-top" style={{ borderTopColor: color }}>
                      <span style={{ fontSize: 18 }}>{n.data.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="roles-card-title">{n.data.title}</div>
                        {n.data.subtitle && (
                          <div className="roles-card-sub">{n.data.subtitle}</div>
                        )}
                      </div>
                      <span className="roles-card-status" style={{ background: `${statusC}22`, color: statusC }}>
                        {status}
                      </span>
                    </div>

                    {/* Progress */}
                    <div style={{ height: 4, background: "var(--border)", borderRadius: 999, overflow: "hidden", margin: "8px 0 6px" }}>
                      <div style={{ width: `${pc}%`, height: "100%", background: statusC }} />
                    </div>

                    {/* Tasks */}
                    <div className="roles-card-tasks">
                      {t.length === 0 ? (
                        <span style={{ color: "var(--text3)", fontSize: 11 }}>Sin tareas</span>
                      ) : t.map((task) => (
                        <div key={task.id} className="roles-task-row">
                          <span style={{
                            width: 10, height: 10, borderRadius: 2, flexShrink: 0,
                            background: task.done ? color : "transparent",
                            border: task.done ? "none" : `1.5px solid var(--border2)`,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {task.done && <span style={{ color: "#fff", fontSize: 7 }}>✓</span>}
                          </span>
                          <span style={{
                            fontSize: 11, color: task.done ? "var(--text3)" : "var(--text)",
                            textDecoration: task.done ? "line-through" : "none",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          }}>
                            {task.text}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Assignee */}
                    <div className="roles-card-footer">
                      <span style={{ fontSize: 10.5, color: "var(--text2)" }}>{d}/{t.length} tareas</span>
                      {assignee ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{
                            width: 16, height: 16, borderRadius: "50%",
                            background: assignee.color, color: "#fff",
                            fontSize: 7, fontWeight: 700,
                            display: "flex", alignItems: "center", justifyContent: "center",
                          }}>
                            {getInitials(assignee.full_name || assignee.email)}
                          </span>
                          <span style={{ fontSize: 10.5, color: "var(--text2)" }}>
                            {assignee.full_name || assignee.email}
                          </span>
                        </span>
                      ) : (
                        <span style={{ fontSize: 10, color: "#D97706" }}>⚠ Sin responsable</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
