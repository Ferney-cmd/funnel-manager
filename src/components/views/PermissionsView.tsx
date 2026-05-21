"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/profiles";
import type { Project, ProjectRole } from "@/lib/types";
import { PROJECT_ROLE_COLORS } from "@/lib/constants";

interface LocalMember {
  id:           string;   // profiles.id
  membershipId: string;   // project_members.id or "__owner__"
  full_name:    string;
  email:        string;
  color:        string;
  role:         ProjectRole;
  isOwner:      boolean;
}

interface PermissionsViewProps {
  project:      Project | undefined;
  projectId:    string;
  myRole:       ProjectRole;
  onSelectView: (view: string) => void;
}

const PERMISSIONS: { key: string; label: string; minRole: ProjectRole }[] = [
  { key: "view",    label: "Ver tareas",       minRole: "viewer" },
  { key: "comment", label: "Comentar",          minRole: "viewer" },
  { key: "toggle",  label: "Completar tareas",  minRole: "editor" },
  { key: "add",     label: "Agregar tareas",    minRole: "editor" },
  { key: "edit",    label: "Editar tareas",     minRole: "editor" },
  { key: "delete",  label: "Eliminar tareas",   minRole: "owner"  },
  { key: "team",    label: "Gestionar equipo",  minRole: "owner"  },
  { key: "project", label: "Eliminar proyecto", minRole: "owner"  },
];

const RANK: Record<string, number> = { viewer: 0, editor: 1, owner: 2 };
function roleAllows(memberRole: ProjectRole, minRole: ProjectRole): boolean {
  return RANK[memberRole] >= RANK[minRole];
}

export function PermissionsView({ project, projectId, myRole, onSelectView }: PermissionsViewProps) {
  const supabase = createClient();
  const [members,  setMembers]  = useState<LocalMember[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const isOwner = myRole === "owner";

  const loadMembers = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setErrorMsg(null);

    // 1. Get project owner uid
    const { data: proj } = await supabase
      .from("projects")
      .select("user_id")
      .eq("id", projectId)
      .single();
    const ownerUid = proj?.user_id as string | undefined;

    // 2. Get project_members rows (with their own id for updates)
    const { data: ms } = await supabase
      .from("project_members")
      .select("id, user_id, role")
      .eq("project_id", projectId);

    // 3. Collect all user IDs and load profiles
    const userIds = new Set<string>();
    if (ownerUid) userIds.add(ownerUid);
    (ms ?? []).forEach((m: any) => userIds.add(m.user_id));

    if (!userIds.size) { setMembers([]); setLoading(false); return; }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email, color")
      .in("id", Array.from(userIds));

    const pfMap = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const result: LocalMember[] = [];

    // Owner first
    if (ownerUid) {
      const p = pfMap.get(ownerUid) as any;
      result.push({
        id: ownerUid, membershipId: "__owner__",
        full_name: p?.full_name ?? "", email: p?.email ?? "",
        color: p?.color ?? "#7C3AED", role: "owner", isOwner: true,
      });
    }

    // Other members
    for (const m of (ms ?? []) as any[]) {
      if (m.user_id === ownerUid) continue; // skip if already in as owner
      const p = pfMap.get(m.user_id) as any;
      result.push({
        id: m.user_id, membershipId: m.id,
        full_name: p?.full_name ?? "", email: p?.email ?? "",
        color: p?.color ?? "#6B7280", role: m.role as ProjectRole, isOwner: false,
      });
    }

    setMembers(result);
    setLoading(false);
  }, [projectId, supabase]);

  useEffect(() => { loadMembers(); }, [loadMembers]);

  const handleRoleChange = async (member: LocalMember, newRole: "editor" | "viewer") => {
    if (!isOwner || member.isOwner) return;
    setSaving(member.id);
    setErrorMsg(null);

    // Optimistic update — show change instantly
    setMembers(prev =>
      prev.map(m => m.id === member.id ? { ...m, role: newRole } : m)
    );

    const { error } = await supabase
      .from("project_members")
      .update({ role: newRole })
      .eq("id", member.membershipId);

    if (error) {
      setErrorMsg("No se pudo guardar el cambio: " + error.message);
      // Revert
      setMembers(prev =>
        prev.map(m => m.id === member.id ? { ...m, role: member.role } : m)
      );
    }
    setSaving(null);
  };

  if (!project) {
    return (
      <div className="view-placeholder">
        <span style={{ fontSize: 32 }}>🔐</span>
        <p>Selecciona un proyecto para ver los permisos</p>
      </div>
    );
  }

  return (
    <div className="perm-wrap">
      {/* Back bar */}
      <div className="view-back-bar">
        <button className="bt-back-btn" onClick={() => onSelectView("canvas")}>← Embudo</button>
        <span className="view-back-title">Permisos · {project.name}</span>
      </div>

      {/* Legend */}
      <div className="perm-legend">
        <span className="perm-legend-item">
          <span style={{ color: PROJECT_ROLE_COLORS.owner }}>●</span> Dueño — acceso total (no editable)
        </span>
        <span className="perm-legend-item">
          <span style={{ color: PROJECT_ROLE_COLORS.editor }}>●</span> Project Manager — puede gestionar tareas
        </span>
        <span className="perm-legend-item">
          <span style={{ color: PROJECT_ROLE_COLORS.viewer }}>●</span> Colaborador — solo lectura y comentarios
        </span>
        {!isOwner && (
          <span style={{ color: "#F59E0B", fontStyle: "italic", fontSize: 11 }}>
            ⚠ Solo el dueño puede cambiar roles
          </span>
        )}
      </div>

      {/* Error */}
      {errorMsg && (
        <div style={{
          padding: "8px 24px", background: "#DC262618", color: "#DC2626",
          fontSize: 12.5, borderBottom: "1px solid #DC262630",
        }}>
          ⚠ {errorMsg}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="perm-loading">Cargando miembros…</div>
      ) : members.length === 0 ? (
        <div className="perm-loading">No hay miembros en este proyecto.</div>
      ) : (
        <div className="perm-table-wrap">
          <table className="perm-table">
            <thead>
              <tr>
                <th className="perm-th-member">Miembro</th>
                {PERMISSIONS.map(p => (
                  <th key={p.key} className="perm-th-perm">{p.label}</th>
                ))}
                <th className="perm-th-role">Rol</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr key={m.id} className="perm-tr">

                  {/* Member cell — use inner div for flex layout */}
                  <td className="perm-td-member">
                    <div className="perm-td-member-inner">
                      <span className="perm-avatar" style={{ background: m.color }}>
                        {getInitials(m.full_name || m.email)}
                      </span>
                      <div className="perm-member-info">
                        <span className="perm-member-name">{m.full_name || m.email}</span>
                        <span className="perm-member-role" style={{ color: PROJECT_ROLE_COLORS[m.role] }}>
                          {m.role === "owner" ? "Dueño" : m.role === "editor" ? "Project Manager" : "Colaborador"}
                        </span>
                      </div>
                    </div>
                  </td>

                  {/* Permission checks */}
                  {PERMISSIONS.map(p => {
                    const allowed = roleAllows(m.role, p.minRole);
                    return (
                      <td key={p.key} className="perm-td-check">
                        <span className={`perm-check ${allowed ? "on" : "off"}`}>
                          {allowed ? "✓" : "–"}
                        </span>
                      </td>
                    );
                  })}

                  {/* Role selector */}
                  <td className="perm-td-role">
                    {m.isOwner ? (
                      <span className="perm-owner-badge">Dueño</span>
                    ) : isOwner ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <select
                          className="perm-role-select"
                          value={m.role}
                          disabled={saving === m.id}
                          onChange={e => handleRoleChange(m, e.target.value as "editor" | "viewer")}
                        >
                          <option value="editor">Project Manager</option>
                          <option value="viewer">Colaborador</option>
                        </select>
                        {saving === m.id && (
                          <span style={{ fontSize: 10, color: "var(--text3)" }}>guardando…</span>
                        )}
                      </div>
                    ) : (
                      <span
                        className="perm-role-badge"
                        style={{
                          background: `${PROJECT_ROLE_COLORS[m.role]}22`,
                          color: PROJECT_ROLE_COLORS[m.role],
                        }}
                      >
                        {m.role === "editor" ? "Project Manager" : "Colaborador"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
