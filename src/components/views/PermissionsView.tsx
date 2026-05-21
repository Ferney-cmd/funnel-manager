"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/profiles";
import type { ProjectMember, Project, ProjectRole } from "@/lib/types";
import { PROJECT_ROLE_COLORS } from "@/lib/constants";

interface PermissionsViewProps {
  project:          Project | undefined;
  members:          ProjectMember[];
  myRole:           ProjectRole;
  onSelectView:     (view: string) => void;
  onMembersChange?: () => void;
}

const PERMISSIONS = [
  { key: "view",    label: "Ver tareas",         minRole: "viewer"  },
  { key: "comment", label: "Comentar",            minRole: "viewer"  },
  { key: "toggle",  label: "Completar tareas",    minRole: "editor"  },
  { key: "add",     label: "Agregar tareas",      minRole: "editor"  },
  { key: "edit",    label: "Editar tareas",       minRole: "editor"  },
  { key: "delete",  label: "Eliminar tareas",     minRole: "owner"   },
  { key: "team",    label: "Gestionar equipo",    minRole: "owner"   },
  { key: "project", label: "Eliminar proyecto",   minRole: "owner"   },
] as const;

function roleAllows(memberRole: ProjectRole, minRole: "viewer" | "editor" | "owner"): boolean {
  const rank: Record<string, number> = { viewer: 0, editor: 1, owner: 2 };
  return rank[memberRole] >= rank[minRole];
}

export function PermissionsView({ project, members, myRole, onSelectView, onMembersChange }: PermissionsViewProps) {
  const supabase = createClient();
  const [saving, setSaving] = useState<string | null>(null);
  const isOwner = myRole === "owner";

  if (!project) {
    return (
      <div className="view-placeholder">
        <span style={{ fontSize: 32 }}>🔐</span>
        <p>Selecciona un proyecto para ver los permisos</p>
      </div>
    );
  }

  const handleRoleChange = async (member: ProjectMember, newRole: "editor" | "viewer") => {
    if (!isOwner || member.role === "owner") return;
    setSaving(member.id);
    await supabase
      .from("project_members")
      .update({ role: newRole })
      .eq("project_id", project.id)
      .eq("user_id", member.id);
    setSaving(null);
    onMembersChange?.();
  };

  return (
    <div className="perm-wrap">
      {/* back bar */}
      <div className="view-back-bar">
        <button className="bt-back-btn" onClick={() => onSelectView("canvas")}>← Embudo</button>
        <span className="view-back-title">Permisos · {project.name}</span>
      </div>

      <div className="perm-legend">
        <span className="perm-legend-item"><span style={{ color: PROJECT_ROLE_COLORS.owner }}>●</span> Dueño — acceso total (no editable)</span>
        <span className="perm-legend-item"><span style={{ color: PROJECT_ROLE_COLORS.editor }}>●</span> Project Manager — puede gestionar tareas</span>
        <span className="perm-legend-item"><span style={{ color: PROJECT_ROLE_COLORS.viewer }}>●</span> Colaborador — solo lectura y comentarios</span>
      </div>

      <div className="perm-table-wrap">
        <table className="perm-table">
          <thead>
            <tr>
              <th className="perm-th-member">Miembro</th>
              {PERMISSIONS.map(p => (
                <th key={p.key} className="perm-th-perm">{p.label}</th>
              ))}
              {isOwner && <th className="perm-th-role">Rol</th>}
            </tr>
          </thead>
          <tbody>
            {members.map(m => {
              const memberRole = m.role as ProjectRole;
              return (
                <tr key={m.id} className="perm-tr">
                  <td className="perm-td-member">
                    <span className="perm-avatar" style={{ background: m.color }}>
                      {getInitials(m.full_name || m.email)}
                    </span>
                    <div className="perm-member-info">
                      <span className="perm-member-name">{m.full_name || m.email}</span>
                      <span className="perm-member-role" style={{ color: PROJECT_ROLE_COLORS[memberRole] }}>
                        {memberRole === "owner" ? "Dueño" : memberRole === "editor" ? "Project Manager" : "Colaborador"}
                      </span>
                    </div>
                  </td>
                  {PERMISSIONS.map(p => {
                    const allowed = roleAllows(memberRole, p.minRole);
                    return (
                      <td key={p.key} className="perm-td-check">
                        <span className={`perm-check ${allowed ? "on" : "off"}`}>
                          {allowed ? "✓" : "–"}
                        </span>
                      </td>
                    );
                  })}
                  {isOwner && (
                    <td className="perm-td-role">
                      {memberRole === "owner" ? (
                        <span className="perm-owner-badge">Dueño</span>
                      ) : (
                        <select
                          className="perm-role-select"
                          value={memberRole}
                          disabled={saving === m.id}
                          onChange={e => handleRoleChange(m, e.target.value as "editor" | "viewer")}
                        >
                          <option value="editor">Project Manager</option>
                          <option value="viewer">Colaborador</option>
                        </select>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!isOwner && (
        <p className="perm-readonly-note">
          Solo el dueño del proyecto puede cambiar los roles de los miembros.
        </p>
      )}
    </div>
  );
}
