"use client";

import { useEffect, useState, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { PRIORITY_COLORS } from "@/lib/constants";
import type { Profile } from "@/lib/profiles";

interface MyTasksViewProps {
  me: Profile | null;
  onOpenTaskProject: (projectId: string) => void;
  onSelectView: (view: string) => void;
}

type Priority = keyof typeof PRIORITY_COLORS;

interface MyTask {
  id: string;
  text: string;
  done: boolean;
  dueDate: string | null;
  priority: Priority;
  projectId: string;
  nodeTitle: string;
  nodeIcon: string;
  projectName: string;
}

const OVERDUE_COLOR = "#E24B4A";

function firstOf<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDue(dueDate: string): Date {
  return new Date(dueDate + "T12:00:00");
}

function formatDue(dueDate: string | null): string {
  if (!dueDate) return "—";
  try {
    return parseDue(dueDate).toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return dueDate;
  }
}

type SectionKey = "overdue" | "today" | "week" | "upcoming" | "nodate";

const SECTION_ORDER: { key: SectionKey; label: string; reddish?: boolean }[] = [
  { key: "overdue", label: "Atrasadas", reddish: true },
  { key: "today", label: "Hoy" },
  { key: "week", label: "Esta semana" },
  { key: "upcoming", label: "Próximas" },
  { key: "nodate", label: "Sin fecha" },
];

function classifyTask(t: MyTask, today: Date, weekEnd: Date): SectionKey {
  if (!t.dueDate) return "nodate";
  const due = parseDue(t.dueDate);
  const dueDay = new Date(due);
  dueDay.setHours(0, 0, 0, 0);
  if (dueDay.getTime() < today.getTime()) return "overdue";
  if (dueDay.getTime() === today.getTime()) return "today";
  if (dueDay.getTime() <= weekEnd.getTime()) return "week";
  return "upcoming";
}

export function MyTasksView({ me, onOpenTaskProject, onSelectView }: MyTasksViewProps) {
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [completedOpen, setCompletedOpen] = useState(false);

  useEffect(() => {
    const meId = me?.id;
    if (!meId) {
      setTasks([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const supabase = createClient();
    (async () => {
      const { data } = await supabase
        .from("node_tasks")
        .select(
          "id, text, done, due_date, priority, node_id, project_id, funnel_nodes(title, icon), projects(name)"
        )
        .eq("assigned_to", meId)
        .order("due_date", { ascending: true });

      if (cancelled) return;

      const mapped: MyTask[] = (data || []).map((r: any) => {
        const node = firstOf<{ title?: string; icon?: string }>(r.funnel_nodes);
        const proj = firstOf<{ name?: string }>(r.projects);
        return {
          id: r.id,
          text: r.text,
          done: !!r.done,
          dueDate: r.due_date ?? null,
          priority: (r.priority ?? "normal") as Priority,
          projectId: r.project_id,
          nodeTitle: node?.title ?? "",
          nodeIcon: node?.icon ?? "📦",
          projectName: proj?.name ?? "",
        };
      });
      setTasks(mapped);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [me?.id]);

  const toggleDone = (id: string) => {
    const target = tasks.find((t) => t.id === id);
    if (!target) return;
    const newVal = !target.done;
    const snapshot = tasks;
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, done: newVal } : t)));
    const supabase = createClient();
    supabase
      .from("node_tasks")
      .update({ done: newVal })
      .eq("id", id)
      .then(({ error }) => {
        if (error) {
          setTasks(snapshot);
          alert("No se pudo guardar: " + error.message);
        }
      });
  };

  const { sections, completed, pendingCount } = useMemo(() => {
    const today = startOfToday();
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const pending = tasks.filter((t) => !t.done);
    const done = tasks.filter((t) => t.done);

    const grouped: Record<SectionKey, MyTask[]> = {
      overdue: [],
      today: [],
      week: [],
      upcoming: [],
      nodate: [],
    };
    for (const t of pending) {
      grouped[classifyTask(t, today, weekEnd)].push(t);
    }
    return { sections: grouped, completed: done, pendingCount: pending.length };
  }, [tasks]);

  const renderRow = (t: MyTask) => {
    const pc = PRIORITY_COLORS[t.priority] ?? PRIORITY_COLORS.normal;
    const today = startOfToday();
    let dateReddish = false;
    if (!t.done && t.dueDate) {
      const dueDay = parseDue(t.dueDate);
      dueDay.setHours(0, 0, 0, 0);
      dateReddish = dueDay.getTime() <= today.getTime();
    }
    return (
      <div
        key={t.id}
        className="mt-row"
        onClick={() => onOpenTaskProject(t.projectId)}
        role="button"
        tabIndex={0}
      >
        <button
          className={`mt-check al-check ${t.done ? "done" : ""}`}
          title={t.done ? "Marcar pendiente" : "Marcar completada"}
          onClick={(e) => {
            e.stopPropagation();
            toggleDone(t.id);
          }}
        />
        <span className={`mt-title ${t.done ? "done" : ""}`}>{t.text}</span>
        <span className="mt-origin">
          📁 {t.projectName} · {t.nodeIcon} {t.nodeTitle}
        </span>
        <span
          className="mt-date"
          style={dateReddish ? { color: OVERDUE_COLOR, fontWeight: 600 } : undefined}
        >
          {formatDue(t.dueDate)}
        </span>
        <span className="mt-priority" style={{ background: pc.bg, color: pc.fg }}>
          {pc.label}
        </span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="mt-wrap">
        <div className="view-back-bar">
          <button className="bt-back-btn" onClick={() => onSelectView("canvas")}>← Embudo</button>
          <span className="view-back-title">Mis Tareas</span>
        </div>
        <div className="mt-loading">Cargando…</div>
      </div>
    );
  }

  const hasAny = tasks.length > 0;

  return (
    <div className="mt-wrap">
      <div className="view-back-bar">
        <button className="bt-back-btn" onClick={() => onSelectView("canvas")}>← Embudo</button>
        <span className="view-back-title">Mis Tareas</span>
        {hasAny && (
          <span className="mt-section-count">{pendingCount} pendientes</span>
        )}
      </div>

      {!hasAny ? (
        <div className="mt-empty">No tienes tareas asignadas</div>
      ) : (
        <>
          {SECTION_ORDER.map(({ key, label, reddish }) => {
            const items = sections[key];
            if (!items.length) return null;
            return (
              <div key={key} className="mt-section">
                <div className="mt-section-header">
                  <span style={reddish ? { color: OVERDUE_COLOR } : undefined}>
                    {label}
                  </span>
                  <span className="mt-section-count">{items.length}</span>
                </div>
                {items.map(renderRow)}
              </div>
            );
          })}

          {completed.length > 0 && (
            <div className="mt-section">
              <button
                className="mt-section-header mt-section-toggle"
                onClick={() => setCompletedOpen((o) => !o)}
              >
                <span>{completedOpen ? "▾" : "▸"} Completadas</span>
                <span className="mt-section-count">{completed.length}</span>
              </button>
              {completedOpen && completed.map(renderRow)}
            </div>
          )}
        </>
      )}
    </div>
  );
}
