"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/profiles";

interface WorkloadViewProps {
  onSelectView: (view: string) => void;
}

interface RawTask {
  assigned_to: string;
  done: boolean;
  due_date: string | null;
}

interface PersonProfile {
  id: string;
  full_name: string;
  email: string;
  color: string;
}

interface PersonRow {
  id: string;
  full_name: string;
  email: string;
  color: string;
  total: number;
  pending: number;
  overdue: number;
  dueThisWeek: number;
  done: number;
  overloaded: boolean;
}

const OVERLOAD_PENDING = 8;
const OVERLOAD_WEEK = 5;
const OVERLOAD_COLOR = "#E24B4A";

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function WorkloadView({ onSelectView }: WorkloadViewProps) {
  const [tasks, setTasks] = useState<RawTask[]>([]);
  const [profiles, setProfiles] = useState<PersonProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const supabase = createClient();
    (async () => {
      const { data: taskData } = await supabase
        .from("node_tasks")
        .select("assigned_to, done, due_date")
        .not("assigned_to", "is", null);
      if (cancelled) return;

      const rawTasks: RawTask[] = (taskData || []).map((r: any) => ({
        assigned_to: r.assigned_to,
        done: !!r.done,
        due_date: r.due_date ?? null,
      }));

      const ids = Array.from(new Set(rawTasks.map((t) => t.assigned_to)));
      let profileData: PersonProfile[] = [];
      if (ids.length > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, full_name, email, color")
          .in("id", ids);
        if (cancelled) return;
        profileData = (profs || []) as PersonProfile[];
      }

      setTasks(rawTasks);
      setProfiles(profileData);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { rows, summary, maxPending } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const todayStr = toDateStr(today);
    const weekEndStr = toDateStr(weekEnd);

    const profileById = new Map(profiles.map((p) => [p.id, p]));

    interface Agg {
      total: number;
      pending: number;
      overdue: number;
      dueThisWeek: number;
      done: number;
    }
    const aggById = new Map<string, Agg>();
    for (const t of tasks) {
      if (!t.assigned_to) continue;
      let agg = aggById.get(t.assigned_to);
      if (!agg) {
        agg = { total: 0, pending: 0, overdue: 0, dueThisWeek: 0, done: 0 };
        aggById.set(t.assigned_to, agg);
      }
      agg.total += 1;
      if (t.done) {
        agg.done += 1;
      } else {
        agg.pending += 1;
        if (t.due_date && t.due_date < todayStr) {
          agg.overdue += 1;
        } else if (t.due_date && t.due_date >= todayStr && t.due_date <= weekEndStr) {
          agg.dueThisWeek += 1;
        }
      }
    }

    const builtRows: PersonRow[] = [];
    for (const [id, agg] of Array.from(aggById.entries())) {
      if (agg.total < 1) continue;
      const prof = profileById.get(id);
      if (!prof) continue;
      builtRows.push({
        id,
        full_name: prof.full_name,
        email: prof.email,
        color: prof.color,
        total: agg.total,
        pending: agg.pending,
        overdue: agg.overdue,
        dueThisWeek: agg.dueThisWeek,
        done: agg.done,
        overloaded: agg.pending >= OVERLOAD_PENDING || agg.dueThisWeek >= OVERLOAD_WEEK,
      });
    }
    builtRows.sort((a, b) => b.pending - a.pending);

    const totalPending = builtRows.reduce((s, r) => s + r.pending, 0);
    const totalOverdue = builtRows.reduce((s, r) => s + r.overdue, 0);
    const max = builtRows.reduce((m, r) => Math.max(m, r.pending), 0);

    return {
      rows: builtRows,
      summary: { people: builtRows.length, totalPending, totalOverdue },
      maxPending: max,
    };
  }, [tasks, profiles]);

  if (loading) {
    return (
      <div className="wl-wrap">
        <div className="view-back-bar">
          <span className="view-back-title">Carga del equipo</span>
        </div>
        <div className="wl-loading">Cargando…</div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="wl-wrap">
        <div className="view-back-bar">
          <span className="view-back-title">Carga del equipo</span>
        </div>
        <div className="wl-empty">Nadie tiene tareas asignadas todavía.</div>
      </div>
    );
  }

  return (
    <div className="wl-wrap">
      <div className="view-back-bar">
        <span className="view-back-title">Carga del equipo</span>
      </div>

      <div className="wl-summary">
        <div className="pf-chip">
          <span className="pf-chip-value">{summary.people}</span>
          <span className="pf-chip-label">Personas con tareas</span>
        </div>
        <div className="pf-chip">
          <span className="pf-chip-value">{summary.totalPending}</span>
          <span className="pf-chip-label">Pendientes (equipo)</span>
        </div>
        <div className="pf-chip">
          <span
            className="pf-chip-value"
            style={summary.totalOverdue > 0 ? { color: OVERLOAD_COLOR } : undefined}
          >
            {summary.totalOverdue}
          </span>
          <span className="pf-chip-label">Vencidas (equipo)</span>
        </div>
      </div>

      <div className="wl-list">
        {rows.map((r) => {
          const pct = maxPending > 0 ? Math.round((r.pending / maxPending) * 100) : 0;
          return (
            <div
              key={r.id}
              className="wl-row"
              onClick={() => onSelectView("mytasks")}
              role="button"
              tabIndex={0}
            >
              <div className="wl-avatar" style={{ background: r.color }}>
                {getInitials(r.full_name || r.email)}
              </div>
              <div className="wl-info">
                <span className="wl-name">
                  {r.full_name || r.email}
                  {r.overloaded && (
                    <span className="wl-overload-badge">⚠ Sobrecargado</span>
                  )}
                </span>
                <span className="wl-email">{r.email}</span>
              </div>
              <div className="wl-load">
                <div className="wl-bar-wrap">
                  <div
                    className={`wl-bar-fill ${r.overloaded ? "over" : ""}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="wl-chips">
                  <span className="wl-chip">Pendientes: {r.pending}</span>
                  <span
                    className="wl-chip"
                    style={r.overdue > 0 ? { color: OVERLOAD_COLOR } : undefined}
                  >
                    Vencidas: {r.overdue}
                  </span>
                  <span className="wl-chip">Esta semana: {r.dueThisWeek}</span>
                  <span className="wl-chip">Completadas: {r.done}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
