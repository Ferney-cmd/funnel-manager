"use client";

import { useState, useEffect, useRef } from "react";
import type { Project, ProjectMember } from "@/lib/types";
import { PROJECT_STATUSES, type ProjectStatus } from "@/lib/constants";
import { getInitials } from "@/lib/profiles";
import { ThemeToggle } from "./ThemeToggle";

interface TopbarProps {
  projectId:   string;
  projects:    Project[];
  progress:    number;
  members:     ProjectMember[];
  onlineUsers: string[];
  onRename:    (id: string, name: string) => void;
  onDuplicate: () => void;
  onAddModule: () => void;
  onOpenTeam:  () => void;
  unreadCount?:          number;
  onOpenNotifications?:  () => void;
  onChangeStatus?:       (status: ProjectStatus) => void;
}

export function Topbar({
  projectId, projects, progress,
  members, onlineUsers,
  onRename, onDuplicate, onAddModule, onOpenTeam,
  unreadCount = 0, onOpenNotifications,
  onChangeStatus,
}: TopbarProps) {
  const project    = projects.find((p) => p.id === projectId);
  const statusLabel = project ? PROJECT_STATUSES[project.status].label : "—";
  const isActive    = project?.status === "active";
  const blocked     = project?.blockedCount ?? 0;

  const [editing, setEditing] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [name, setName] = useState(project?.name ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setName(project?.name ?? ""); }, [project?.name]);
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  function commitName() {
    setEditing(false);
    const trimmed = name.trim();
    if (trimmed && trimmed !== project?.name) onRename(projectId, trimmed);
    else setName(project?.name ?? "");
  }

  const onlineSet     = new Set(onlineUsers);
  const onlineMembers = members.filter((m) => onlineSet.has(m.id));

  return (
    <header className="topbar">
      {editing ? (
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter")  commitName();
            if (e.key === "Escape") { setName(project?.name ?? ""); setEditing(false); }
          }}
          className="topbar-project-input"
        />
      ) : (
        <span
          className="topbar-project-name"
          onDoubleClick={() => setEditing(true)}
          title="Doble clic para renombrar"
          style={{ cursor: "text" }}
        >
          {project?.name ?? "—"}
        </span>
      )}

      {onChangeStatus && project ? (
        <div className="tb-status-menu">
          <button
            type="button"
            className={`tb-status-trigger topbar-badge ${isActive ? "topbar-badge-active" : ""}`}
            style={!isActive ? { background: "#FEF3C7", color: "#92400E" } : undefined}
            onClick={() => setStatusOpen((o) => !o)}
            onBlur={() => setTimeout(() => setStatusOpen(false), 120)}
          >
            {statusLabel}
          </button>
          {statusOpen && (
            <div className="tb-status-dropdown">
              {(Object.keys(PROJECT_STATUSES) as ProjectStatus[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`tb-status-option${project.status === key ? " active" : ""}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onChangeStatus(key); setStatusOpen(false); }}
                >
                  {PROJECT_STATUSES[key].label}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <span className={`topbar-badge ${isActive ? "topbar-badge-active" : ""}`}
          style={!isActive ? { background: "#FEF3C7", color: "#92400E" } : undefined}>
          {statusLabel}
        </span>
      )}

      {blocked > 0 && (
        <span className="topbar-badge topbar-badge-blocked">
          {blocked} bloqueado{blocked > 1 ? "s" : ""}
        </span>
      )}

      <div className="topbar-progress-wrap">
        <span className="topbar-progress-label">{progress}% completado</span>
        <div className="topbar-progress-bar">
          <div className="topbar-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {onlineMembers.length > 0 && (
        <div className="topbar-presence" title={`${onlineMembers.length} en línea`}>
          {onlineMembers.slice(0, 5).map((m) => (
            <div key={m.id} className="topbar-avatar" title={m.full_name || m.email}>
              <span style={{ background: m.color, color: "#fff" }}>
                {getInitials(m.full_name || m.email)}
              </span>
              <span className="topbar-avatar-dot" />
            </div>
          ))}
          {onlineMembers.length > 5 && (
            <span className="topbar-presence-extra">+{onlineMembers.length - 5}</span>
          )}
        </div>
      )}

      <ThemeToggle />

      {onOpenNotifications && (
        <button
          className="topbar-notif-btn"
          onClick={onOpenNotifications}
          title="Notificaciones"
          style={{ position: "relative" }}
        >
          🔔
          {unreadCount > 0 && (
            <span
              style={{
                position: "absolute", top: 2, right: 2,
                background: "#E24B4A", color: "#fff",
                fontSize: 9, fontWeight: 700, lineHeight: 1,
                borderRadius: 99, padding: "2px 4px",
                minWidth: 14, textAlign: "center",
              }}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      )}

      <button className="topbar-btn" onClick={onOpenTeam} title="Gestionar equipo">
        <span>👥</span>
        Equipo
      </button>

      <button className="topbar-btn" onClick={onDuplicate} title="Duplicar lanzamiento">
        <span>⧉</span>
        Duplicar
      </button>

      <button className="topbar-btn topbar-btn-primary" onClick={onAddModule} title="Agregar módulo">
        <span>+</span>
        Módulo
      </button>
    </header>
  );
}
