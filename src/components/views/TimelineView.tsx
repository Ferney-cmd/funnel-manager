"use client";

import { useMemo, useState } from "react";
import type { Node } from "reactflow";
import type { FunnelNodeData, Project, NodeTask } from "@/lib/types";
import { PRIORITY_COLORS } from "@/lib/constants";

interface TimelineViewProps {
  project: Project | undefined;
  nodes: Node<FunnelNodeData>[];
  onSelectView: (view: string) => void;
}

interface FlatTask {
  task: NodeTask;
  nodeTitle: string;
  nodeIcon: string;
}

const DAY_MS = 1000 * 60 * 60 * 24;
const ROW_H = 32;
const LABEL_W = 200;

function parseDate(d: string): Date {
  return new Date(d + "T12:00:00");
}

/** Midnight-normalized day difference (b - a) in whole days. */
function daysBetween(a: Date, b: Date): number {
  const a0 = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const b0 = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((b0 - a0) / DAY_MS);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmtRange(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
  const s = start.toLocaleDateString("es-CO", opts);
  if (daysBetween(start, end) === 0) return s;
  return `${s} → ${end.toLocaleDateString("es-CO", opts)}`;
}

const MONTH_NAMES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function TimelineView({ project, nodes, onSelectView }: TimelineViewProps) {
  const [zoom, setZoom] = useState<"week" | "month">("month");
  const dayWidth = zoom === "week" ? 36 : 12;

  const backBar = (
    <div className="view-back-bar">
      <button className="bt-back-btn" onClick={() => onSelectView("canvas")}>← Embudo</button>
      <span className="view-back-title">Cronograma · {project?.name}</span>
      <div className="tl-zoom" style={{ marginLeft: "auto" }}>
        <button
          className={`tl-zoom-btn ${zoom === "week" ? "active" : ""}`}
          onClick={() => setZoom("week")}
        >Semana</button>
        <button
          className={`tl-zoom-btn ${zoom === "month" ? "active" : ""}`}
          onClick={() => setZoom("month")}
        >Mes</button>
      </div>
    </div>
  );

  /* Flatten tasks across nodes */
  const allFlat: FlatTask[] = useMemo(
    () =>
      nodes.flatMap((n) =>
        n.data.tasks.map((task) => ({
          task,
          nodeTitle: n.data.title,
          nodeIcon: n.data.icon,
        }))
      ),
    [nodes]
  );

  /* Tasks with at least one date go on the grid; the rest are counted in the footer. */
  const dated = useMemo(
    () => allFlat.filter((ft) => ft.task.dueDate || ft.task.startDate),
    [allFlat]
  );
  const undatedCount = allFlat.length - dated.length;

  /* Compute start/end Date per task. end = due ?? start; start = start ?? due.
     Se descartan fechas inválidas para no romper el cálculo del rango. */
  const ranges = useMemo(
    () =>
      dated.flatMap((ft) => {
        const endStr = ft.task.dueDate ?? ft.task.startDate!;
        const startStr = ft.task.startDate ?? ft.task.dueDate!;
        let start = parseDate(startStr);
        let end = parseDate(endStr);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
        if (end.getTime() < start.getTime()) [start, end] = [end, start];
        return [{ ...ft, start, end }];
      }),
    [dated]
  );

  /* Domain across all dated tasks, padded. */
  const domain = useMemo(() => {
    if (ranges.length === 0) return null;
    let min = ranges[0].start;
    let max = ranges[0].end;
    for (const r of ranges) {
      if (r.start.getTime() < min.getTime()) min = r.start;
      if (r.end.getTime() > max.getTime()) max = r.end;
    }
    const minDate = addDays(min, -3);
    let maxDate = addDays(max, 3);
    // Ensure at least ~14 days of width.
    const span = daysBetween(minDate, maxDate) + 1;
    if (span < 14) maxDate = addDays(maxDate, 14 - span);
    return { minDate, maxDate };
  }, [ranges]);

  /* Group rows by module, preserving node order. */
  const groups = useMemo(() => {
    const byModule = new Map<string, { icon: string; tasks: typeof ranges }>();
    for (const r of ranges) {
      const g = byModule.get(r.nodeTitle);
      if (g) g.tasks.push(r);
      else byModule.set(r.nodeTitle, { icon: r.nodeIcon, tasks: [r] });
    }
    return Array.from(byModule.entries()).map(([title, { icon, tasks }]) => ({ title, icon, tasks }));
  }, [ranges]);

  if (!domain) {
    return (
      <div className="tl-wrap">
        {backBar}
        <div className="tl-empty">No hay tareas con fechas todavía.</div>
      </div>
    );
  }

  const { minDate, maxDate } = domain;
  // Tope de seguridad: nunca renderizar más de MAX_DAYS columnas (evita
  // congelar el navegador si una tarea tiene una fecha muy lejana/errónea).
  const MAX_DAYS = 800;
  const rawTotalDays = daysBetween(minDate, maxDate) + 1;
  const clamped = rawTotalDays > MAX_DAYS;
  const totalDays = Math.min(Math.max(rawTotalDays, 1), MAX_DAYS);
  const gridWidth = totalDays * dayWidth;

  /* Date ticks for the header. */
  const ticks = Array.from({ length: totalDays }, (_, i) => {
    const d = addDays(minDate, i);
    return { i, date: d, isMonthStart: d.getDate() === 1 || i === 0 };
  });

  const today = new Date();
  const todayOffset = daysBetween(minDate, today);
  const todayInRange = todayOffset >= 0 && todayOffset < totalDays;

  return (
    <div className="tl-wrap">
      {backBar}
      <div className="tl-scroll">
        <div className="tl-grid" style={{ width: LABEL_W + gridWidth }}>
          {/* Header row */}
          <div className="tl-row tl-datehead" style={{ height: ROW_H }}>
            <div className="tl-label-col" style={{ height: ROW_H }} />
            <div style={{ position: "relative", width: gridWidth, height: ROW_H }}>
              {ticks.map((t) => (
                <div
                  key={t.i}
                  style={{
                    position: "absolute",
                    left: t.i * dayWidth,
                    width: dayWidth,
                    top: 0,
                    height: ROW_H,
                    borderLeft: t.isMonthStart
                      ? "1px solid var(--border)"
                      : "1px solid transparent",
                    fontSize: 9,
                    color: "var(--text3)",
                    textAlign: "center",
                    lineHeight: "12px",
                    paddingTop: 3,
                    overflow: "hidden",
                  }}
                >
                  {t.isMonthStart && (
                    <div style={{ fontWeight: 700, color: "var(--text2)", whiteSpace: "nowrap" }}>
                      {MONTH_NAMES[t.date.getMonth()]}
                    </div>
                  )}
                  {(zoom === "week" || t.date.getDate() % 5 === 1) && <div>{t.date.getDate()}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* Body: module groups + task rows. Today line spans the body. */}
          <div style={{ position: "relative" }}>
            {todayInRange && (
              <div
                className="tl-today"
                style={{ left: LABEL_W + todayOffset * dayWidth + dayWidth / 2 }}
                title="Hoy"
              />
            )}

            {groups.map((g) => (
              <div key={g.title}>
                <div className="tl-row tl-module-header" style={{ height: ROW_H }}>
                  <div className="tl-label-col" style={{ height: ROW_H, fontWeight: 700 }}>
                    <span style={{ marginRight: 6 }}>{g.icon}</span>
                    {g.title}
                  </div>
                  <div style={{ width: gridWidth }} />
                </div>

                {g.tasks.map((r) => {
                  const offset = daysBetween(minDate, r.start);
                  const span = daysBetween(r.start, r.end) + 1;
                  const left = offset * dayWidth;
                  const width = Math.max(span, 1) * dayWidth;
                  const pc = PRIORITY_COLORS[r.task.priority ?? "normal"];
                  const tip = `${r.task.text} · ${fmtRange(r.start, r.end)}`;

                  return (
                    <div
                      key={r.task.id}
                      className="tl-row"
                      style={{ height: ROW_H, cursor: "pointer", opacity: r.task.done ? 0.45 : 1 }}
                      onClick={() => onSelectView("board")}
                      title={tip}
                    >
                      <div
                        className="tl-label-col"
                        style={{ height: ROW_H, paddingLeft: 24 }}
                      >
                        <span style={{ marginRight: 6, flexShrink: 0 }}>{r.nodeIcon}</span>
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            textDecoration: r.task.done ? "line-through" : "none",
                          }}
                        >
                          {r.task.text}
                        </span>
                      </div>
                      <div style={{ position: "relative", width: gridWidth, height: ROW_H }}>
                        {r.task.isMilestone ? (
                          <div
                            className="tl-milestone"
                            style={{
                              left: left + dayWidth / 2 - 7,
                              background: pc.fg,
                            }}
                          />
                        ) : (
                          <div
                            className="tl-bar"
                            style={{ left, width, background: pc.fg }}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {(undatedCount > 0 || clamped) && (
        <div className="tl-footer">
          {undatedCount > 0 && (
            <span>{undatedCount} {undatedCount === 1 ? "tarea sin fecha" : "tareas sin fecha"} (no se muestran en el cronograma)</span>
          )}
          {clamped && (
            <span style={{ marginLeft: undatedCount > 0 ? 12 : 0, color: "#E24B4A" }}>
              ⚠ El rango de fechas es muy amplio; se muestra una ventana de {MAX_DAYS} días. Revisa tareas con fechas muy lejanas.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
