"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getInitials, type Profile } from "@/lib/profiles";

interface Member extends Profile {
  membership_id: string;
  member_role:   "owner" | "editor" | "viewer";
  is_owner:      boolean;
}

interface TeamModalProps {
  projectId: string;
  onClose:   () => void;
}

const ROLE_LABEL: Record<string, string> = {
  owner:  "Administrador",
  editor: "Editor",
  viewer: "Solo lectura",
};

const ROLE_COLOR: Record<string, string> = {
  owner:  "#7C3AED",
  editor: "#10B981",
  viewer: "#6B7280",
};

export function TeamModal({ projectId, onClose }: TeamModalProps) {
  const supabase = createClient();

  const [members,       setMembers]       = useState<Member[]>([]);
  const [allUsers,      setAllUsers]      = useState<Profile[]>([]);
  const [search,        setSearch]        = useState("");
  const [loading,       setLoading]       = useState(true);
  const [currentUid,    setCurrentUid]    = useState<string>("");
  const [ownerUid,      setOwnerUid]      = useState<string>("");
  const [pendingInvites, setPendingInvites] =
    useState<{ id: string; email: string; role: string; created_at: string }[]>([]);
  const [inviteEmail,   setInviteEmail]   = useState("");
  const [inviteRole,    setInviteRole]    = useState<"editor" | "viewer">("editor");
  const [inviting,      setInviting]      = useState(false);

  async function loadData() {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    setCurrentUid(user?.id ?? "");

    const { data: project } = await supabase
      .from("projects").select("user_id")
      .eq("id", projectId).single();
    setOwnerUid(project?.user_id ?? "");

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, email, color, platform_role")
      .order("full_name", { ascending: true });
    const allProfiles = (profiles || []) as Profile[];
    setAllUsers(allProfiles);

    const { data: ms } = await supabase
      .from("project_members")
      .select("id, user_id, role")
      .eq("project_id", projectId);

    const memberRows: Member[] = (ms ?? []).map((m: any) => {
      const p = allProfiles.find((u) => u.id === m.user_id);
      return {
        id: m.user_id, full_name: p?.full_name ?? "—", email: p?.email ?? "—",
        color: p?.color ?? "#7C3AED",
        platform_role: p?.platform_role ?? "user",
        membership_id: m.id, member_role: m.role, is_owner: false,
      };
    });

    if (project?.user_id) {
      const ownerProf = allProfiles.find((u) => u.id === project.user_id);
      memberRows.unshift({
        id: project.user_id,
        full_name: ownerProf?.full_name ?? "—",
        email: ownerProf?.email ?? "—",
        color: ownerProf?.color ?? "#7C3AED",
        platform_role: ownerProf?.platform_role ?? "user",
        membership_id: "__owner__",
        member_role: "owner",
        is_owner: true,
      });
    }

    setMembers(memberRows);

    const { data: invites } = await supabase
      .from("invitations")
      .select("id, email, role, created_at")
      .eq("project_id", projectId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    setPendingInvites((invites ?? []) as { id: string; email: string; role: string; created_at: string }[]);

    setLoading(false);
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadData(); }, [projectId]);

  const isOwner = currentUid === ownerUid;

  async function addMember(userId: string, role: "editor" | "viewer") {
    const { error } = await supabase.from("project_members").insert({
      project_id: projectId, user_id: userId, role, invited_by: currentUid,
    });
    if (error) { alert("No se pudo agregar: " + error.message); return; }
    setSearch("");
    loadData();
  }

  async function updateRole(memberId: string, role: "editor" | "viewer") {
    const { error } = await supabase
      .from("project_members").update({ role }).eq("id", memberId);
    if (error) { alert("No se pudo cambiar el rol: " + error.message); return; }
    loadData();
  }

  async function removeMember(memberId: string) {
    if (!confirm("¿Quitar este miembro del proyecto?")) return;
    const { error } = await supabase
      .from("project_members").delete().eq("id", memberId);
    if (error) { alert("No se pudo eliminar: " + error.message); return; }
    loadData();
  }

  async function inviteByEmail(rawEmail: string, role: "editor" | "viewer") {
    const email = rawEmail.trim().toLowerCase();
    if (!email.includes("@")) { alert("Introduce un email válido."); return; }

    setInviting(true);
    try {
      // Look up an existing profile with that email (case-insensitive).
      const { data: existing } = await supabase
        .from("profiles").select("id").ilike("email", email).maybeSingle();

      if (existing?.id) {
        // Profile exists → add directly as a project member.
        const { error } = await supabase.from("project_members").insert({
          project_id: projectId, user_id: existing.id, role, invited_by: currentUid,
        });
        if (error) {
          if (error.code === "23505") { alert("Ya es miembro del proyecto."); }
          else { alert("No se pudo agregar: " + error.message); }
          return;
        }
        setInviteEmail("");
        loadData();
        return;
      }

      // No profile yet → create a pending invitation.
      const { error } = await supabase.from("invitations").insert({
        project_id: projectId, email, role, invited_by: currentUid, status: "pending",
      });
      if (error) {
        if (error.code === "23505") { alert("Ya existe una invitación pendiente para ese email."); }
        else { alert("No se pudo invitar: " + error.message); }
        return;
      }
      alert("Invitación pendiente enviada. " +
        "La persona obtendrá acceso automáticamente cuando se registre con ese email.");
      setInviteEmail("");
      loadData();
    } finally {
      setInviting(false);
    }
  }

  async function revokeInvite(id: string) {
    const { error } = await supabase
      .from("invitations").update({ status: "revoked" }).eq("id", id);
    if (error) { alert("No se pudo revocar: " + error.message); return; }
    loadData();
  }

  const memberIds   = new Set(members.map((m) => m.id));
  const q           = search.trim().toLowerCase();
  const candidates  = allUsers
    .filter((u) => !memberIds.has(u.id))
    .filter((u) => q && (u.email.toLowerCase().includes(q) || u.full_name.toLowerCase().includes(q)))
    .slice(0, 8);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">Equipo del proyecto</div>
            <div className="modal-subtitle">
              {isOwner ? "Tú eres el administrador" : "Solo el administrador puede gestionar miembros"}
            </div>
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text2)" }}>
            Cargando…
          </div>
        ) : (
          <>
            {isOwner && (
              <div className="modal-section">
                <div className="modal-section-label">Invitar por email</div>
                <div style={{ display: "flex", gap: 8, alignItems: "stretch" }}>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !inviting) inviteByEmail(inviteEmail, inviteRole);
                    }}
                    placeholder="persona@email.com"
                    className="modal-input"
                    style={{ flex: 1, marginBottom: 0 }}
                  />
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as "editor" | "viewer")}
                    className="role-select"
                    style={{ minWidth: 110 }}>
                    <option value="editor">Editor</option>
                    <option value="viewer">Colaborador</option>
                  </select>
                  <button
                    className="btn-mini-primary"
                    disabled={inviting}
                    onClick={() => inviteByEmail(inviteEmail, inviteRole)}>
                    {inviting ? "Invitando…" : "Invitar"}
                  </button>
                </div>
                <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 6 }}>
                  Puedes invitar a personas aunque todavía no tengan cuenta.
                </div>

                <div className="modal-section-label" style={{ marginTop: 16 }}>
                  Buscar usuario existente
                </div>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por nombre o email…"
                  className="modal-input"
                />
                {candidates.length > 0 && (
                  <div className="member-picker">
                    {candidates.map((u) => (
                      <div key={u.id} className="member-pick-row">
                        <span className="member-avatar" style={{ background: u.color }}>
                          {getInitials(u.full_name || u.email)}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {u.full_name || "Sin nombre"}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text3)",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {u.email}
                          </div>
                        </div>
                        <button className="btn-mini-secondary"
                          onClick={() => addMember(u.id, "viewer")}>+ Lectura</button>
                        <button className="btn-mini-primary"
                          onClick={() => addMember(u.id, "editor")}>+ Editor</button>
                      </div>
                    ))}
                  </div>
                )}
                {q && candidates.length === 0 && (
                  <div style={{ fontSize: 11.5, color: "var(--text3)", marginTop: 8 }}>
                    Ningún usuario encontrado con &quot;{search}&quot;
                  </div>
                )}
              </div>
            )}

            <div className="modal-section">
              <div className="modal-section-label">Miembros ({members.length})</div>
              {members.map((m) => (
                <div key={m.membership_id} className="member-row">
                  <span className="member-avatar" style={{ background: m.color }}>
                    {getInitials(m.full_name || m.email)}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.full_name || "Sin nombre"}
                      {m.id === currentUid && (
                        <span style={{ marginLeft: 6, fontSize: 10, color: "var(--text3)", fontWeight: 400 }}>
                          (Tú)
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: "var(--text3)",
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {m.email}
                    </div>
                  </div>
                  {m.is_owner ? (
                    <span className="role-badge"
                      style={{ background: ROLE_COLOR.owner, color: "#fff" }}>
                      {ROLE_LABEL.owner}
                    </span>
                  ) : (
                    <>
                      {isOwner ? (
                        <select
                          value={m.member_role}
                          onChange={(e) => updateRole(m.membership_id, e.target.value as "editor" | "viewer")}
                          className="role-select">
                          <option value="editor">Editor</option>
                          <option value="viewer">Solo lectura</option>
                        </select>
                      ) : (
                        <span className="role-badge"
                          style={{ background: `${ROLE_COLOR[m.member_role]}22`, color: ROLE_COLOR[m.member_role] }}>
                          {ROLE_LABEL[m.member_role]}
                        </span>
                      )}
                      {isOwner && (
                        <button onClick={() => removeMember(m.membership_id)}
                          className="btn-mini-remove" title="Quitar miembro">✕</button>
                      )}
                    </>
                  )}
                </div>
              ))}
            </div>

            {isOwner && pendingInvites.length > 0 && (
              <div className="modal-section">
                <div className="modal-section-label">
                  Invitaciones pendientes ({pendingInvites.length})
                </div>
                {pendingInvites.map((inv) => (
                  <div key={inv.id} className="member-row">
                    <span className="member-avatar"
                      style={{ background: "var(--text3)", color: "#fff" }}>
                      @
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {inv.email}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--text3)" }}>
                        Pendiente de registro
                      </div>
                    </div>
                    <span className="role-badge"
                      style={{ background: `${ROLE_COLOR[inv.role] ?? ROLE_COLOR.viewer}22`,
                        color: ROLE_COLOR[inv.role] ?? ROLE_COLOR.viewer }}>
                      {ROLE_LABEL[inv.role] ?? inv.role}
                    </span>
                    <button onClick={() => revokeInvite(inv.id)}
                      className="btn-mini-remove" title="Revocar invitación">✕</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
