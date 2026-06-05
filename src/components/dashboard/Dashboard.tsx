"use client";

import { useState } from "react";
import type { Node } from "reactflow";
import type { FunnelNodeData, ProjectMember, Project } from "@/lib/types";
import { ROLE_LABELS, ROLE_COLORS } from "@/lib/constants";
import { getInitials } from "@/lib/profiles";

interface DashboardProps {
  project:       Project | undefined;
  nodes:         Node<FunnelNodeData>[];
  members:       ProjectMember[];
  onSelectView?: (view: string) => void;
}

export function Dashboard({ project, nodes, members, onSelectView }: DashboardProps) {
  const [aiSummary, setAiSummary]   = useState<string>("");
  const [aiLoading, setAiLoading]   = useState<boolean>(false);
  const [aiError,   setAiError]     = useState<string>("");

  if (!project) {
    return (
      <div className="dash-empty">
        <span style={{ fontSize: 32 }}>📊</span>
        <p>Selecciona un proyecto para ver el tablero</p>
      </div>
    );
  }

  /* ── Aggregations ──────────────────────────────────────────── */
  const allTasks  = nodes.flatMap((n) => n.data.tasks);
  const tasksDone = allTasks.filter((t) => t.done).length;
  const totalTasks = allTasks.length;
  const overall   = totalTasks ? Math.round((tasksDone / totalTasks) * 100) : 0;

  const totalModules    = nodes.length;
  const completedModules = nodes.filter((n) =>
    n.data.tasks.length > 0 && n.data.tasks.every((t) => t.done)
  ).length;
  const blockedModules = nodes.filter((n) =>
    n.data.tasks.length > 0 &&
    !n.data.tasks.some((t) => t.done) &&
    n.data.tasks.length >= 2
  );
  const noOwnerModules  = nodes.filter((n) => !n.data.assignedTo);
  const noTasksModules  = nodes.filter((n) => n.data.tasks.length === 0);

  /* ── AI Summary handler ────────────────────────────────────── */
  async function handleAiSummary() {
    setAiLoading(true);
    setAiError("");
    setAiSummary("");
    try {
      const res = await fetch("/api/ai/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: project!.name,
          stats: {
            total:            totalTasks,
            done:             tasksDone,
            pct:              overall,
            modules:          totalModules,
            completedModules,
            blocked:          blockedModules.length,
          },
        }),
      });
      const data = await res.json();
      if (data.error) {
        if (data.error === "AI_NOT_CONFIGURED") {
          setAiError("⚠ La IA no está configurada. Configura ANTHROPIC_API_KEY en EasyPanel.");
        } else {
          setAiError(data.error as string);
        }
      } else {
        setAiSummary(data.summary as string);
      }
    } catch {
      setAiError("Error al conectar con la IA. Intenta de nuevo.");
    } finally {
      setAiLoading(false);
    }
  }

  /* Per-role progress */
  const roleStats = Object.keys(ROLE_LABELS).map((role) => {
    const roleNodes = nodes.filter((n) => n.data.role === role);
    const tasks     = roleNodes.flatMap((n) => n.data.tasks);
    const done      = tasks.filter((t) => t.done).length;
    return {
      role,
      label: ROLE_LABELS[role],
      color: ROLE_COLORS[role],
      modules: roleNodes.length,
      tasks:   tasks.length,
      done,
      progress: tasks.length ? Math.round((done / tasks.length) * 100) : 0,
    };
  }).filter((r) => r.modules > 0);

  /* Per-person workload */
  const personStats = members.map((m) => {
    const myModules  = nodes.filter((n) => n.data.assignedTo === m.id);
    const myTasks    = myModules.flatMap((n) => n.data.tasks);
    const myDone     = myTasks.filter((t) => t.done).length;
    return {
      ...m,
      modules: myModules.length,
      tasks:   myTasks.length,
      done:    myDone,
      progress: myTasks.length ? Math.round((myDone / myTasks.length) * 100) : 0,
    };
  }).sort((a, b) => b.modules - a.modules);

  /* Recent activity (last 8 messages across all nodes) */
  const recentMessages = nodes
    .flatMap((n) =>
      n.data.messages.map((m) => ({ ...m, nodeTitle: n.data.title }))
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 8);

  return (
    <div className="dashboard">
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div className="view-back-bar">
        <button className="bt-back-btn" onClick={() => onSelectView?.("canvas")}>← Embudo</button>
        <span className="view-back-title">Resumen · {project.name}</span>
      </div>
      {/* ── Header ── */}
      <div className="dash-hero">
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div className="dash-hero-label">Tablero del jefe · {project.name}</div>
            <div className="dash-hero-title">{overall}% completado</div>
            <div className="dash-hero-sub">
              {tasksDone} de {totalTasks} tareas · {completedModules}/{totalModules} módulos completos
            </div>
          </div>
          <button
            onClick={handleAiSummary}
            disabled={aiLoading}
            style={{
              flexShrink: 0,
              marginTop: 2,
              padding: "5px 12px",
              fontSize: 12,
              fontWeight: 600,
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
              cursor: aiLoading ? "not-allowed" : "pointer",
              opacity: aiLoading ? 0.6 : 1,
              whiteSpace: "nowrap",
            }}
          >
            {aiLoading ? "Generando…" : "✨ Resumen IA"}
          </button>
        </div>
        <div className="dash-hero-bar">
          <div className="dash-hero-bar-fill" style={{ width: `${overall}%` }} />
        </div>
      </div>

      {/* ── AI Summary card ── */}
      {aiLoading && (
        <div style={{
          margin: "0 0 12px",
          padding: "12px 16px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          fontSize: 13,
          color: "var(--text2)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}>
          <span style={{
            display: "inline-block",
            width: 14,
            height: 14,
            border: "2px solid var(--border)",
            borderTopColor: "var(--brand)",
            borderRadius: "50%",
            animation: "spin 0.8s linear infinite",
          }} />
          Generando resumen…
        </div>
      )}
      {!aiLoading && aiError && (
        <div style={{
          margin: "0 0 12px",
          padding: "12px 16px",
          background: "var(--surface)",
          border: "1px solid #FCA5A5",
          borderRadius: 10,
          fontSize: 13,
          color: "#DC2626",
        }}>
          {aiError}
        </div>
      )}
      {!aiLoading && aiSummary && (
        <div style={{
          margin: "0 0 12px",
          padding: "14px 16px",
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          position: "relative",
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--brand)", marginBottom: 6, letterSpacing: "0.04em" }}>
            ✨ RESUMEN IA
          </div>
          <div style={{ fontSize: 13, color: "var(--text)", fontStyle: "italic", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
            {aiSummary}
          </div>
          <button
            onClick={() => setAiSummary("")}
            aria-label="Cerrar resumen"
            style={{
              position: "absolute",
              top: 10,
              right: 10,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              fontSize: 14,
              color: "var(--text3)",
              lineHeight: 1,
              padding: 2,
            }}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Atención requerida ── */}
      {(blockedModules.length > 0 || noOwnerModules.length > 0 || noTasksModules.length > 0) && (
        <div className="dash-section">
          <div className="dash-section-title">⚠ Atención requerida</div>
          <div className="dash-alert-grid">
            {blockedModules.length > 0 && (
              <div className="dash-alert" style={{ borderColor: "#FCA5A5" }}>
                <div className="dash-alert-num" style={{ color: "#DC2626" }}>{blockedModules.length}</div>
                <div className="dash-alert-label">módulos sin avance</div>
                <div className="dash-alert-detail">
                  {blockedModules.slice(0, 3).map((n) => n.data.title).join(" · ")}
                  {blockedModules.length > 3 && ` +${blockedModules.length - 3}`}
                </div>
              </div>
            )}
            {noOwnerModules.length > 0 && (
              <div className="dash-alert" style={{ borderColor: "#FCD34D" }}>
                <div className="dash-alert-num" style={{ color: "#D97706" }}>{noOwnerModules.length}</div>
                <div className="dash-alert-label">módulos sin responsable</div>
                <div className="dash-alert-detail">
                  {noOwnerModules.slice(0, 3).map((n) => n.data.title).join(" · ")}
                  {noOwnerModules.length > 3 && ` +${noOwnerModules.length - 3}`}
                </div>
              </div>
            )}
            {noTasksModules.length > 0 && (
              <div className="dash-alert" style={{ borderColor: "#A5B4FC" }}>
                <div className="dash-alert-num" style={{ color: "#4F46E5" }}>{noTasksModules.length}</div>
                <div className="dash-alert-label">módulos sin tareas</div>
                <div className="dash-alert-detail">
                  {noTasksModules.slice(0, 3).map((n) => n.data.title).join(" · ")}
                  {noTasksModules.length > 3 && ` +${noTasksModules.length - 3}`}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="dash-grid">
        {/* ── Por rol ── */}
        <div className="dash-section">
          <div className="dash-section-title">Avance por rol</div>
          {roleStats.length === 0 ? (
            <div className="dash-empty-line">Aún no hay módulos creados.</div>
          ) : roleStats.map((r) => (
            <div key={r.role} className="dash-row">
              <div style={{ display: "flex", alignItems: "center", gap: 8, width: 160, flexShrink: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: r.color }} />
                <span style={{ fontSize: 13, color: "var(--text)" }}>{r.label}</span>
              </div>
              <div style={{ flex: 1, height: 6, background: "var(--border)",
                borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: `${r.progress}%`, height: "100%", background: r.color,
                  transition: "width 0.3s" }} />
              </div>
              <div style={{ fontSize: 12, color: "var(--text2)", width: 110, textAlign: "right", flexShrink: 0 }}>
                {r.done}/{r.tasks} · {r.progress}%
              </div>
            </div>
          ))}
        </div>

        {/* ── Por persona ── */}
        <div className="dash-section">
          <div className="dash-section-title">Carga del equipo</div>
          {personStats.length === 0 ? (
            <div className="dash-empty-line">No hay miembros aún.</div>
          ) : personStats.map((p) => (
            <div key={p.id} className="dash-row">
              <div style={{ display: "flex", alignItems: "center", gap: 8, width: 200, flexShrink: 0, minWidth: 0 }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%",
                  background: p.color, color: "#fff", fontSize: 11, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {getInitials(p.full_name || p.email)}
                </span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--text)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {p.full_name || p.email}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--text3)" }}>
                    {p.role === "owner" ? "Administrador" : p.role === "editor" ? "Editor" : "Solo lectura"}
                  </div>
                </div>
              </div>
              <div style={{ flex: 1, height: 6, background: "var(--border)",
                borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: `${p.progress}%`, height: "100%", background: p.color,
                  transition: "width 0.3s" }} />
              </div>
              <div style={{ fontSize: 12, color: "var(--text2)", width: 130, textAlign: "right", flexShrink: 0 }}>
                {p.modules} mód · {p.done}/{p.tasks} tareas
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Lista de módulos ── */}
      <div className="dash-section">
        <div className="dash-section-title">Estado por módulo</div>
        {nodes.length === 0 ? (
          <div className="dash-empty-line">No hay módulos. Crea uno desde la vista Embudo.</div>
        ) : (
          <div className="dash-modules">
            {nodes
              .slice()
              .sort((a, b) => a.position.x - b.position.x)
              .map((n) => {
                const t = n.data.tasks;
                const d = t.filter((x) => x.done).length;
                const pc = t.length ? Math.round((d / t.length) * 100) : 0;
                const status = pc === 100 ? "completado" :
                               pc > 0     ? "en curso"   : "pendiente";
                const statusColor = pc === 100 ? "#10B981" : pc > 0 ? "#F59E0B" : "#6B7280";
                const assignee = members.find((m) => m.id === n.data.assignedTo);

                return (
                  <div key={n.id} className="dash-module">
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 16 }}>{n.data.icon}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {n.data.title}
                        </div>
                        <div style={{ fontSize: 10.5, color: ROLE_COLORS[n.data.role] }}>
                          {ROLE_LABELS[n.data.role]}
                        </div>
                      </div>
                      <span style={{ fontSize: 9.5, fontWeight: 600, padding: "2px 7px",
                        borderRadius: 999, background: `${statusColor}22`, color: statusColor,
                        textTransform: "uppercase", letterSpacing: "0.05em" }}>
                        {status}
                      </span>
                    </div>
                    <div style={{ height: 4, background: "var(--border)",
                      borderRadius: 999, overflow: "hidden", marginBottom: 6 }}>
                      <div style={{ width: `${pc}%`, height: "100%", background: statusColor }} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
                      fontSize: 11, color: "var(--text2)" }}>
                      <span>{d}/{t.length} tareas</span>
                      {assignee ? (
                        <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          <span style={{ width: 14, height: 14, borderRadius: "50%",
                            background: assignee.color, color: "#fff", fontSize: 7, fontWeight: 700,
                            display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {getInitials(assignee.full_name || assignee.email)}
                          </span>
                          {assignee.full_name || assignee.email}
                        </span>
                      ) : (
                        <span style={{ color: "#D97706", fontSize: 10.5 }}>⚠ Sin responsable</span>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* ── Actividad reciente ── */}
      {recentMessages.length > 0 && (
        <div className="dash-section">
          <div className="dash-section-title">Actividad reciente del chat</div>
          <div className="dash-activity">
            {recentMessages.map((m) => (
              <div key={m.id} className="dash-activity-row">
                <span style={{ width: 22, height: 22, borderRadius: "50%",
                  background: m.userColor, color: "#fff", fontSize: 9, fontWeight: 700,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {m.userInitials}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11.5, color: "var(--text)" }}>
                    <strong>{m.userName}</strong>
                    <span style={{ color: "var(--text3)" }}> en </span>
                    <strong>{m.nodeTitle}</strong>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text2)",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {m.text}
                  </div>
                </div>
                <span style={{ fontSize: 10, color: "var(--text3)", flexShrink: 0 }}>
                  {fmtRelative(m.createdAt)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function fmtRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1)   return "ahora";
  if (min < 60)  return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24)   return `${hr}h`;
  const d = Math.floor(hr / 24);
  return `${d}d`;
}
