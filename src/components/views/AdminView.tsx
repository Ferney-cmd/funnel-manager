"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { getAllProfiles, getInitials, isSuperAdmin, type Profile, type PlatformRole } from "@/lib/profiles";
import { PLATFORM_ROLE_LABELS } from "@/lib/constants";

interface AdminViewProps {
  me:           Profile | null;
  onSelectView: (view: string) => void;
}

export function AdminView({ me, onSelectView }: AdminViewProps) {
  const supabase = createClient();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const canManageAdmins = isSuperAdmin(me);

  useEffect(() => {
    (async () => {
      const all = await getAllProfiles();
      setUsers(all);
      setLoading(false);
    })();
  }, []);

  const handleRoleChange = async (userId: string, newRole: PlatformRole) => {
    setSaving(userId);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({ platform_role: newRole })
        .eq("id", userId);
      if (error) throw error;
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, platform_role: newRole } : u));
    } catch (err: any) {
      alert("Error al cambiar el rol: " + (err?.message ?? err));
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return <div className="admin-view"><p style={{ color: "var(--text2)" }}>Cargando usuarios...</p></div>;
  }

  return (
    <div className="admin-view">
      <div className="view-back-bar">
        <button className="bt-back-btn" onClick={() => onSelectView("canvas")}>← Embudo</button>
        <span className="view-back-title">Gestión de Usuarios</span>
      </div>
      <div className="admin-header">
        <div className="admin-title">Gestión de Usuarios</div>
        <div className="admin-subtitle">
          {users.length} usuarios registrados ·
          {canManageAdmins
            ? " puedes asignar roles de Admin y Super Admin"
            : " puedes ver pero no cambiar roles de Admin"}
        </div>
      </div>

      <div className="admin-table">
        <div className="admin-row header">
          <div></div>
          <div>Nombre</div>
          <div>Email</div>
          <div>Rol</div>
          <div></div>
        </div>

        {users.map((u) => {
          const isSelf = u.id === me?.id;
          const isTargetSuperAdmin = u.platform_role === "super_admin";
          // Solo super_admin puede cambiar roles a/desde super_admin o admin
          // Admin no puede cambiar el rol de un super_admin ni convertir a alguien en super_admin
          const canEdit = !isSelf && (
            canManageAdmins || (!isTargetSuperAdmin && u.platform_role !== "admin")
          );

          return (
            <div key={u.id} className="admin-row">
              <div className="admin-avatar" style={{ background: u.color }}>
                {getInitials(u.full_name || u.email)}
              </div>
              <div className="admin-name">
                {u.full_name || "(sin nombre)"}
                {isSelf && <span style={{ marginLeft: 6, fontSize: 10, color: "var(--text2)" }}>(tú)</span>}
              </div>
              <div className="admin-email">{u.email}</div>
              <div>
                {canEdit ? (
                  <select
                    className={`admin-role-select ${u.platform_role}`}
                    value={u.platform_role}
                    onChange={(e) => handleRoleChange(u.id, e.target.value as PlatformRole)}
                    disabled={saving === u.id}
                  >
                    <option value="user">{PLATFORM_ROLE_LABELS.user}</option>
                    <option value="admin">{PLATFORM_ROLE_LABELS.admin}</option>
                    {canManageAdmins && (
                      <option value="super_admin">{PLATFORM_ROLE_LABELS.super_admin}</option>
                    )}
                  </select>
                ) : (
                  <span className={`admin-role-select ${u.platform_role}`} style={{ display: "inline-block" }}>
                    {PLATFORM_ROLE_LABELS[u.platform_role]}
                  </span>
                )}
              </div>
              <div>
                {saving === u.id && <span className="admin-locked">guardando...</span>}
                {isSelf && <span className="admin-locked">no editable</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
