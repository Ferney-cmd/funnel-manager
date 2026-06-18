"use client";

import type { Project } from "@/lib/types";

/* Vistas que ahora viven como pestañas dentro de la página Dashboard */
export const DASHBOARD_TABS: { id: string; label: string; icon: string }[] = [
  { id: "board",     label: "Lista",        icon: "▦" },
  { id: "kanban",    label: "Kanban",       icon: "▥" },
  { id: "timeline",  label: "Cronograma",   icon: "▭" },
  { id: "calendar",  label: "Calendario",   icon: "📅" },
  { id: "workload",  label: "Carga equipo", icon: "⚖" },
  { id: "roles",     label: "Roles",        icon: "◎" },
  { id: "docs",      label: "Docs",         icon: "⊟" },
  { id: "permisos",  label: "Permisos",     icon: "🔐" },
  { id: "portfolio", label: "Portafolio",   icon: "◫" },
];

export const DASHBOARD_GROUP = new Set(DASHBOARD_TABS.map((t) => t.id));

/* Pestañas que NO se limitan a un solo proyecto */
const MULTI_PROJECT = new Set(["portfolio", "workload"]);

interface DashboardTabsProps {
  activeView:      string;
  onSelectView:    (view: string) => void;
  projects:        Project[];
  activeProjectId: string;
  onSelectProject: (id: string) => void;
}

export function DashboardTabs({
  activeView, onSelectView, projects, activeProjectId, onSelectProject,
}: DashboardTabsProps) {
  const project = projects.find((p) => p.id === activeProjectId);
  const scoped  = !MULTI_PROJECT.has(activeView);

  return (
    <div className="dtabs-wrap">
      <div className="dtabs-bar">
        {/* Selector de proyecto compartido (estilo Asana) */}
        <div className="dtabs-project" title={scoped ? "Proyecto activo" : "Esta vista muestra todos los proyectos"}>
          <span className="dtabs-project-square">
            {(project?.name ?? "?").charAt(0).toUpperCase()}
          </span>
          <select
            className="dtabs-project-select"
            value={activeProjectId}
            onChange={(e) => onSelectProject(e.target.value)}
          >
            {projects.filter((p) => !p.parentProjectId).map((p) => {
              const subs = projects.filter((s) => s.parentProjectId === p.id);
              return (
                <optgroup key={p.id} label={p.name}>
                  <option value={p.id}>{p.name}</option>
                  {subs.map((s) => (
                    <option key={s.id} value={s.id}>↳ {s.name}</option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>

        {/* Pestañas */}
        <div className="dtabs-tabs">
          {DASHBOARD_TABS.map((t) => (
            <button
              key={t.id}
              className={`dtab${activeView === t.id ? " active" : ""}`}
              onClick={() => onSelectView(t.id)}
            >
              <span className="dtab-icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
