"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PROJECT_STATUSES } from "@/lib/constants";
import type { Project } from "@/lib/types";

interface PortfolioViewProps {
  projects: Project[];
  onOpenProject: (projectId: string) => void;
}

interface Aggregate {
  total: number;
  done: number;
  overdue: number;
  nextDue: string | null;
}

const OVERDUE_COLOR = "#E24B4A";

function emptyAggregate(): Aggregate {
  return { total: 0, done: 0, overdue: 0, nextDue: null };
}

function formatDue(dueDate: string | null): string {
  if (!dueDate) return "—";
  try {
    return new Date(dueDate + "T12:00:00").toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return dueDate;
  }
}

export function PortfolioView({ projects, onOpenProject }: PortfolioViewProps) {
  const [rows, setRows] = useState<
    { project_id: string; done: boolean; due_date: string | null }[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("node_tasks")
        .select("project_id, done, due_date");
      if (cancelled) return;
      setRows(
        (data || []).map((r: any) => ({
          project_id: r.project_id,
          done: !!r.done,
          due_date: r.due_date ?? null,
        }))
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const aggregates = useMemo(() => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const map = new Map<string, Aggregate>();
    for (const r of rows) {
      if (!r.project_id) continue;
      let agg = map.get(r.project_id);
      if (!agg) {
        agg = emptyAggregate();
        map.set(r.project_id, agg);
      }
      agg.total += 1;
      if (r.done) agg.done += 1;
      if (r.due_date && !r.done) {
        if (r.due_date < todayStr) {
          agg.overdue += 1;
        } else if (agg.nextDue === null || r.due_date < agg.nextDue) {
          // future-or-today, smallest wins
          agg.nextDue = r.due_date;
        }
      }
    }
    return map;
  }, [rows]);

  const summary = useMemo(() => {
    let totalOverdue = 0;
    let pctSum = 0;
    for (const p of projects) {
      const agg = aggregates.get(p.id) ?? emptyAggregate();
      totalOverdue += agg.overdue;
      pctSum += agg.total ? Math.round((agg.done / agg.total) * 100) : 0;
    }
    const avgProgress = projects.length
      ? Math.round(pctSum / projects.length)
      : 0;
    return { totalOverdue, avgProgress };
  }, [projects, aggregates]);

  if (loading) {
    return (
      <div className="pf-wrap">
        <div className="view-back-bar">
          <span className="view-back-title">Portafolio</span>
        </div>
        <div className="mt-loading">Cargando…</div>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="pf-wrap">
        <div className="view-back-bar">
          <span className="view-back-title">Portafolio</span>
        </div>
        <div className="mt-empty">No tienes proyectos.</div>
      </div>
    );
  }

  return (
    <div className="pf-wrap">
      <div className="view-back-bar">
        <span className="view-back-title">
          Portafolio · {projects.length} proyectos
        </span>
      </div>

      <div className="pf-summary">
        <div className="pf-chip">
          <span className="pf-chip-value">{projects.length}</span>
          <span className="pf-chip-label">Proyectos</span>
        </div>
        <div className="pf-chip">
          <span className="pf-chip-value">{summary.avgProgress}%</span>
          <span className="pf-chip-label">Avance promedio</span>
        </div>
        <div className="pf-chip">
          <span
            className="pf-chip-value"
            style={summary.totalOverdue > 0 ? { color: OVERDUE_COLOR } : undefined}
          >
            {summary.totalOverdue}
          </span>
          <span className="pf-chip-label">Vencidas</span>
        </div>
      </div>

      <table className="pf-table">
        <thead>
          <tr>
            <th className="pf-th">Proyecto</th>
            <th className="pf-th">Estado</th>
            <th className="pf-th">Avance</th>
            <th className="pf-th">Tareas</th>
            <th className="pf-th">Vencidas</th>
            <th className="pf-th">Próximo venc.</th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => {
            const agg = aggregates.get(p.id) ?? emptyAggregate();
            const pct = agg.total ? Math.round((agg.done / agg.total) * 100) : 0;
            const status = PROJECT_STATUSES[p.status];
            const isSub = !!p.parentProjectId;
            return (
              <tr
                key={p.id}
                className="pf-row"
                onClick={() => onOpenProject(p.id)}
                role="button"
                tabIndex={0}
              >
                <td className={`pf-name ${isSub ? "pf-sub" : ""}`}>
                  {isSub ? "↳ " : ""}
                  {p.name}
                </td>
                <td>
                  {status ? (
                    <span
                      className="pf-status-badge"
                      style={{ background: status.color + "22", color: status.color }}
                    >
                      {status.label}
                    </span>
                  ) : (
                    <span className="pf-status-badge">—</span>
                  )}
                </td>
                <td>
                  <div className="pf-progress">
                    <div className="pf-bar">
                      <div className="pf-bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="pf-pct">{pct}%</span>
                  </div>
                </td>
                <td className="pf-tasks">
                  {agg.done}/{agg.total}
                </td>
                <td>
                  {agg.overdue > 0 ? (
                    <span className="pf-overdue">{agg.overdue}</span>
                  ) : (
                    <span className="pf-zero">0</span>
                  )}
                </td>
                <td className="pf-nextdue">{formatDue(agg.nextDue)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
