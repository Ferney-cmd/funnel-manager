"use client";

import { useMemo, useState } from "react";
import type { Node } from "reactflow";
import type { FunnelNodeData, Project, NodeTask } from "@/lib/types";
import { PRIORITY_COLORS } from "@/lib/constants";

interface CalendarViewProps {
  project: Project | undefined;
  nodes: Node<FunnelNodeData>[];
  onSelectView: (view: string) => void;
}

interface FlatTask {
  task: NodeTask;
  nodeIcon: string;
}

const MONTH_NAMES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function parseDate(d: string): Date {
  return new Date(d + "T12:00:00");
}

/** Local YYYY-MM-DD key (no timezone shifting). */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Monday-based weekday index (0 = Mon … 6 = Sun) from a Date. */
function mondayIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function CalendarView({ project, nodes, onSelectView }: CalendarViewProps) {
  const [cursor, setCursor] = useState<Date>(() => new Date());

  /* Flatten tasks across nodes; keep only those with a valid dueDate. */
  const tasksByDay = useMemo(() => {
    const map = new Map<string, FlatTask[]>();
    for (const n of nodes) {
      for (const task of n.data.tasks) {
        if (!task.dueDate) continue;
        const d = parseDate(task.dueDate);
        if (isNaN(d.getTime())) continue;
        const key = dayKey(d);
        const arr = map.get(key);
        const ft: FlatTask = { task, nodeIcon: n.data.icon };
        if (arr) arr.push(ft);
        else map.set(key, [ft]);
      }
    }
    return map;
  }, [nodes]);

  /* Build a 6×7 grid of days for the cursor's month (Monday start). */
  const { cells, monthLabel } = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const lead = mondayIndex(firstOfMonth);
    const gridStart = addDays(firstOfMonth, -lead);
    const days = Array.from({ length: 42 }, (_, i) => {
      const date = addDays(gridStart, i);
      return {
        date,
        key: dayKey(date),
        inMonth: date.getMonth() === month,
      };
    });
    return {
      cells: days,
      monthLabel: `${MONTH_NAMES[month]} ${year}`,
    };
  }, [cursor]);

  const todayKey = dayKey(new Date());

  const goPrev = () => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1));
  const goNext = () => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1));
  const goToday = () => setCursor(new Date());

  return (
    <div className="cal-wrap">
      <div className="view-back-bar">
        <button className="bt-back-btn" onClick={() => onSelectView("canvas")}>← Embudo</button>
        <span className="view-back-title">Calendario · {project?.name}</span>
        <div className="cal-nav" style={{ marginLeft: "auto" }}>
          <button className="cal-nav-btn" onClick={goPrev} title="Mes anterior">‹</button>
          <span className="cal-nav-label">{monthLabel}</span>
          <button className="cal-nav-btn" onClick={goNext} title="Mes siguiente">›</button>
          <button className="cal-nav-btn cal-nav-today" onClick={goToday}>Hoy</button>
        </div>
      </div>

      <div className="cal-scroll">
        <div className="cal-grid cal-weekdays">
          {WEEKDAYS.map((w) => (
            <div key={w} className="cal-weekday">{w}</div>
          ))}
        </div>
        <div className="cal-grid cal-days">
          {cells.map((cell) => {
            const dayTasks = tasksByDay.get(cell.key) ?? [];
            const isToday = cell.key === todayKey;
            const shown = dayTasks.slice(0, 3);
            const extra = dayTasks.length - shown.length;
            return (
              <div key={cell.key} className={`cal-cell ${cell.inMonth ? "" : "out"}`}>
                <div className={`cal-daynum ${isToday ? "today" : ""}`}>
                  {cell.date.getDate()}
                </div>
                {shown.map((ft) => {
                  const pc = PRIORITY_COLORS[ft.task.priority ?? "normal"];
                  return (
                    <button
                      key={ft.task.id}
                      className="cal-chip"
                      title={ft.task.text}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectView("board");
                      }}
                      style={{ opacity: ft.task.done ? 0.5 : 1 }}
                    >
                      <span className="cal-chip-dot" style={{ background: pc.fg }} />
                      <span
                        className="cal-chip-text"
                        style={{ textDecoration: ft.task.done ? "line-through" : "none" }}
                      >
                        {ft.task.text}
                      </span>
                    </button>
                  );
                })}
                {extra > 0 && <div className="cal-more">+{extra} más</div>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
