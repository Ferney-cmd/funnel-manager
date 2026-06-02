"use client";

import { PROJECT_STATUSES } from "@/lib/constants";
import { getInitials, type Profile } from "@/lib/profiles";
import type { Project } from "@/lib/types";

interface SidebarProps {
  activeProjectId: string;
  projects:        Project[];
  onSelectProject: (id: string) => void;
  activeView:      string;
  onSelectView:    (view: string) => void;
  onNewProject:    () => void;
  onNewSubproject: () => void;
  onDeleteProject: (id: string) => void;
  onAddModule:     () => void;
  onAddZone:       () => void;
  onLogout:        () => void;
  me:              Profile | null;
  onOpenProfile:   () => void;
  isAdmin:         boolean;
}

const BASE_VIEWS = [
  { id: "mytasks",  icon: "★",  label: "Mis Tareas" },
  { id: "canvas",   icon: "◈",  label: "Embudo"    },
  { id: "board",    icon: "▦",  label: "Dashboard" },
  { id: "roles",    icon: "◎",  label: "Roles"     },
  { id: "docs",     icon: "⊟",  label: "Docs"      },
  { id: "tablero",  icon: "▤",  label: "Resumen"   },
  { id: "permisos", icon: "🔐", label: "Permisos"  },
];

export function Sidebar({
  activeProjectId, projects,
  onSelectProject, activeView, onSelectView,
  onNewProject, onNewSubproject, onDeleteProject,
  onAddModule, onAddZone, onLogout,
  me, onOpenProfile, isAdmin,
}: SidebarProps) {

  /* Organiza proyectos en root + subproyectos */
  const rootProjects = projects.filter((p) => !p.parentProjectId);
  const subprojectsByParent = projects.reduce<Record<string, Project[]>>((acc, p) => {
    if (p.parentProjectId) {
      acc[p.parentProjectId] = acc[p.parentProjectId] || [];
      acc[p.parentProjectId].push(p);
    }
    return acc;
  }, {});

  const renderProjectRow = (p: Project, isSub = false) => (
    <div key={p.id} className={`sidebar-project-row ${isSub ? "sidebar-subproject-row" : ""}`}>
      <button
        className={`sidebar-item sidebar-project-btn ${p.id === activeProjectId ? "active" : ""}`}
        onClick={() => onSelectProject(p.id)}
      >
        <span className="sidebar-item-dot"
          style={{ background: PROJECT_STATUSES[p.status].color }} />
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
          {p.name}
        </span>
      </button>
      <button
        className="sidebar-delete-btn"
        title="Eliminar proyecto"
        onClick={(e) => {
          e.stopPropagation();
          onDeleteProject(p.id);
        }}
      >✕</button>
    </div>
  );

  return (
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-logo">
        <div className="sidebar-logo-icon">⚡</div>
        FunnelManager
      </div>

      {/* Projects */}
      <div className="sidebar-section">
        <div className="sidebar-section-label">Proyectos</div>
        {rootProjects.map((p) => (
          <div key={p.id}>
            {renderProjectRow(p, false)}
            {(subprojectsByParent[p.id] || []).map((sub) => renderProjectRow(sub, true))}
          </div>
        ))}
        {isAdmin && (
          <button className="sidebar-add-btn" onClick={onNewProject}>
            <span style={{ fontSize: 14 }}>+</span>
            Nuevo proyecto
          </button>
        )}
        {isAdmin && activeProjectId && (
          <button className="sidebar-add-btn" onClick={onNewSubproject} style={{ marginTop: 2 }}>
            <span style={{ fontSize: 14 }}>↳</span>
            Subproyecto
          </button>
        )}
      </div>

      <div className="sidebar-divider" />

      {/* Views */}
      <div className="sidebar-section">
        <div className="sidebar-section-label">Vistas</div>
        {BASE_VIEWS.map((v) => (
          <button key={v.id}
            className={`sidebar-item ${activeView === v.id ? "active" : ""}`}
            onClick={() => onSelectView(v.id)}>
            <span className="sidebar-item-icon">{v.icon}</span>
            {v.label}
          </button>
        ))}
        {isAdmin && (
          <button
            className={`sidebar-item ${activeView === "admin" ? "active" : ""}`}
            onClick={() => onSelectView("admin")}
          >
            <span className="sidebar-item-icon">⚙</span>
            Admin
          </button>
        )}
      </div>

      <div className="sidebar-divider" />

      {/* Canvas tools */}
      <div className="sidebar-section">
        <div className="sidebar-section-label">Canvas</div>
        <button className="sidebar-item" onClick={onAddModule}>
          <span className="sidebar-item-icon">+</span>
          Módulo
        </button>
        <button className="sidebar-item" onClick={onAddZone}>
          <span className="sidebar-item-icon">⬚</span>
          Zona
        </button>
        <button className="sidebar-item">
          <span className="sidebar-item-icon">⇢</span>
          Condicional
        </button>
      </div>

      <div className="sidebar-divider" style={{ marginTop: "auto" }} />

      {/* AI Copilot */}
      <div className="sidebar-section">
        <button className="sidebar-item">
          <span className="sidebar-item-icon" style={{ color: "#8B5CF6" }}>✦</span>
          <span>IA Copilot</span>
          <span style={{ width: 6, height: 6, borderRadius: "50%",
            background: "#10B981", marginLeft: "auto", flexShrink: 0 }} />
        </button>
        <button className="sidebar-item" onClick={onLogout}
          style={{ color: "var(--sidebar-muted)", marginTop: 4 }}>
          <span className="sidebar-item-icon">↩</span>
          <span>Cerrar sesión</span>
        </button>
      </div>

      {/* User card */}
      {me && (
        <button className="sidebar-user-card" onClick={onOpenProfile} title="Editar mi perfil">
          <div className="sidebar-user-avatar" style={{ background: me.color }}>
            {getInitials(me.full_name || me.email)}
          </div>
          <div className="sidebar-user-info">
            <span className="sidebar-user-name">{me.full_name || me.email}</span>
            <span className="sidebar-user-role">
              {me.platform_role === "super_admin" ? "Super Admin"
                : me.platform_role === "admin"   ? "Admin"
                : "Mi perfil →"}
            </span>
          </div>
        </button>
      )}
    </aside>
  );
}
