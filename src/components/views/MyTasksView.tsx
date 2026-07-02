"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { PRIORITY_COLORS } from "@/lib/constants";
import { getInitials, type Profile } from "@/lib/profiles";
import { QuickTaskModal, INBOX_NAME, type EditTask } from "./QuickTaskModal";
import { TemplatesModal } from "./TemplatesModal";
import { NotifyPrefs } from "./NotifyPrefs";

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
  nodeId: string;
  nodeTitle: string;
  nodeIcon: string;
  projectName: string;
  createdAt: string;
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

/** Fecha relativa estilo "Ayer" / "Hoy" / "Mañana" / "26 jun". */
function formatDueRelative(dueDate: string | null): string {
  if (!dueDate) return "Sin fecha";
  const today = startOfToday();
  const due = parseDue(dueDate);
  due.setHours(0, 0, 0, 0);
  const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Hoy";
  if (diff === -1) return "Ayer";
  if (diff === 1) return "Mañana";
  if (diff < -1) return `Hace ${-diff} días`;
  try {
    return parseDue(dueDate).toLocaleDateString("es-CO", { day: "2-digit", month: "short" });
  } catch {
    return dueDate;
  }
}

function longTodayLabel(): string {
  try {
    const s = new Date().toLocaleDateString("es-CO", {
      weekday: "long",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch {
    return "";
  }
}

type SectionKey = "overdue" | "today" | "week" | "upcoming" | "nodate";

const SECTION_ORDER: { key: SectionKey; label: string; reddish?: boolean }[] = [
  { key: "overdue", label: "Atrasadas", reddish: true },
  { key: "today", label: "Urgente / Hoy" },
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

type FilterKey = "all" | "urgent" | "overdue" | "today" | "nodate";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todas" },
  { key: "urgent", label: "Urgentes" },
  { key: "overdue", label: "Vencidas" },
  { key: "today", label: "Hoy" },
  { key: "nodate", label: "Sin fecha" },
];

export function MyTasksView({ me, onOpenTaskProject, onSelectView }: MyTasksViewProps) {
  const [tasks, setTasks] = useState<MyTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [quickOpen, setQuickOpen] = useState(false);
  const [editTask, setEditTask] = useState<MyTask | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  // Colapso de secciones (cerradas por defecto salvo Atrasadas/Hoy), recordado por usuario
  const COLLAPSE_KEY = "fm_mt_collapsed";
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    if (typeof window !== "undefined") {
      try { const s = localStorage.getItem(COLLAPSE_KEY); if (s) return JSON.parse(s); } catch { /* noop */ }
    }
    return { week: true, upcoming: true, nodate: true, completed: true };
  });
  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed)); } catch { /* noop */ }
  }, [collapsed]);
  const toggleSection = (k: string) => setCollapsed((p) => ({ ...p, [k]: !p[k] }));
  const setAllCollapsed = (v: boolean) =>
    setCollapsed({ overdue: v, today: v, week: v, upcoming: v, nodate: v, completed: v });
  const allKeys = [...SECTION_ORDER.map((s) => s.key), "completed"];
  const allCollapsed = allKeys.every((k) => collapsed[k]);

  const loadTasks = useCallback(async () => {
    const meId = me?.id;
    if (!meId) {
      setTasks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("node_tasks")
      .select(
        "id, text, done, due_date, priority, node_id, project_id, created_at, funnel_nodes(title, icon), projects(name)"
      )
      .eq("assigned_to", meId)
      .order("due_date", { ascending: true });

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
        nodeId: r.node_id,
        nodeTitle: node?.title ?? "",
        nodeIcon: node?.icon ?? "📦",
        projectName: proj?.name ?? "",
        createdAt: r.created_at ?? "",
      };
    });
    setTasks(mapped);
    setLoading(false);
  }, [me?.id]);

  useEffect(() => { loadTasks(); }, [loadTasks]);

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

  const { sections, completed, pendingCount, stats } = useMemo(() => {
    const today = startOfToday();
    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 7);

    const q = query.trim().toLowerCase();
    const matchesSearch = (t: MyTask) =>
      !q ||
      t.text.toLowerCase().includes(q) ||
      t.projectName.toLowerCase().includes(q) ||
      t.nodeTitle.toLowerCase().includes(q);

    const matchesFilter = (t: MyTask): boolean => {
      switch (filter) {
        case "urgent":
          return t.priority === "urgent" || t.priority === "high";
        case "overdue":
          return classifyTask(t, today, weekEnd) === "overdue";
        case "today":
          return classifyTask(t, today, weekEnd) === "today";
        case "nodate":
          return !t.dueDate;
        default:
          return true;
      }
    };

    const pendingAll = tasks.filter((t) => !t.done);
    const visible = tasks.filter((t) => matchesSearch(t) && matchesFilter(t));
    const pending = visible.filter((t) => !t.done);
    const done = visible.filter((t) => t.done);

    const grouped: Record<SectionKey, MyTask[]> = {
      overdue: [],
      today: [],
      week: [],
      upcoming: [],
      nodate: [],
    };
    for (const t of pending) grouped[classifyTask(t, today, weekEnd)].push(t);
    // Nuevas primero (estilo Asana): dentro de cada grupo, las creadas más recientemente arriba
    const newestFirst = (a: MyTask, b: MyTask) => (b.createdAt || "").localeCompare(a.createdAt || "");
    for (const k of Object.keys(grouped) as SectionKey[]) grouped[k].sort(newestFirst);
    done.sort(newestFirst);

    // Stats sobre TODO (no afectadas por filtro/búsqueda)
    const overdueN = pendingAll.filter((t) => classifyTask(t, today, weekEnd) === "overdue").length;
    const todayN = pendingAll.filter((t) => classifyTask(t, today, weekEnd) === "today").length;
    const completedN = tasks.filter((t) => t.done).length;
    const projectsN = new Set(pendingAll.map((t) => t.projectId)).size;

    return {
      sections: grouped,
      completed: done,
      pendingCount: pending.length,
      stats: { todayN, overdueN, completedN, projectsN },
    };
  }, [tasks, query, filter]);

  const statCards = [
    { value: stats.todayN, label: "Tareas hoy", color: "#7C3AED" },
    { value: stats.overdueN, label: "Vencidas", color: OVERDUE_COLOR },
    { value: stats.completedN, label: "Completadas", color: "#10B981" },
    { value: stats.projectsN, label: "Proyectos con tareas", color: "#6366F1" },
  ];
  const maxStat = Math.max(1, ...statCards.map((s) => s.value));

  const myInitials = getInitials(me?.full_name || me?.email || "");
  const myColor = me?.color || "#7C3AED";
  const myFirstName = (me?.full_name || me?.email || "").split(/[\s@]/)[0];

  const renderCard = (t: MyTask, sectionReddish?: boolean) => {
    const pc = PRIORITY_COLORS[t.priority] ?? PRIORITY_COLORS.normal;
    const today = startOfToday();
    let dateReddish = false;
    if (!t.done && t.dueDate) {
      const dueDay = parseDue(t.dueDate);
      dueDay.setHours(0, 0, 0, 0);
      dateReddish = dueDay.getTime() <= today.getTime();
    }
    const isPersonal = t.projectName === INBOX_NAME;
    return (
      <div
        key={t.id}
        className={`mt-card ${t.done ? "done" : ""}`}
        onClick={() => setEditTask(t)}
        role="button"
        tabIndex={0}
        title="Editar tarea"
      >
        <span className="mt-card-dot" style={{ background: sectionReddish ? OVERDUE_COLOR : pc.fg }} />
        <button
          className={`mt-check al-check ${t.done ? "done" : ""}`}
          title={t.done ? "Marcar pendiente" : "Marcar completada"}
          onClick={(e) => {
            e.stopPropagation();
            toggleDone(t.id);
          }}
        />
        <div className="mt-card-main">
          <span className={`mt-card-title ${t.done ? "done" : ""}`}>{t.text}</span>
          <div className="mt-card-tags">
            {isPersonal ? (
              <span className="mt-tag mt-tag-personal">🏠 Personal</span>
            ) : (
              <span
                className="mt-tag mt-tag-project"
                onClick={(e) => { e.stopPropagation(); onOpenTaskProject(t.projectId); }}
                title="Abrir proyecto"
              >
                📁 {t.projectName}
              </span>
            )}
            {!isPersonal && t.nodeTitle && (
              <span className="mt-tag">{t.nodeIcon} {t.nodeTitle}</span>
            )}
            <span className="mt-tag mt-tag-priority" style={{ background: pc.bg, color: pc.fg }}>
              {pc.label}
            </span>
            {t.dueDate && (
              <span
                className="mt-tag mt-tag-date"
                style={dateReddish ? { color: OVERDUE_COLOR, borderColor: OVERDUE_COLOR + "55" } : undefined}
              >
                🕑 {formatDueRelative(t.dueDate)}
              </span>
            )}
          </div>
        </div>
        <span className="mt-card-assignee">
          <span className="mt-card-avatar" style={{ background: myColor }}>{myInitials}</span>
          <span className="mt-card-assignee-name">{myFirstName}</span>
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
  const anyVisible =
    SECTION_ORDER.some(({ key }) => sections[key].length > 0) || completed.length > 0;

  return (
    <div className="mt-wrap">
      <div className="view-back-bar">
        <button className="bt-back-btn" onClick={() => onSelectView("canvas")}>← Embudo</button>
        <span className="view-back-title">Mis Tareas</span>
      </div>

      {/* Cabecera: título + fecha + buscador */}
      <div className="mt-header">
        <div className="mt-header-title">
          <h1>Mis tareas</h1>
          <span className="mt-header-date">{longTodayLabel()}</span>
        </div>
        <div className="mt-header-actions">
          <div className="mt-search">
            <span className="mt-search-icon">🔍</span>
            <input
              type="text"
              placeholder="Buscar tarea..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {me?.id && <NotifyPrefs userId={me.id} />}
          <button className="mt-tpl-btn" onClick={() => setTemplatesOpen(true)} title="Plantillas de tareas">
            ⛭ Plantillas
          </button>
          <button className="mt-new-btn" onClick={() => setQuickOpen(true)}>
            + Nueva tarea
          </button>
        </div>
      </div>

      {/* Tarjetas de stats */}
      <div className="mt-stats">
        {statCards.map((s) => (
          <div className="mt-stat" key={s.label}>
            <span className="mt-stat-value" style={{ color: s.color }}>{s.value}</span>
            <span className="mt-stat-label">{s.label}</span>
            <span className="mt-stat-bar">
              <span
                className="mt-stat-bar-fill"
                style={{ width: `${Math.round((s.value / maxStat) * 100)}%`, background: s.color }}
              />
            </span>
          </div>
        ))}
      </div>

      {/* Chips de filtro */}
      <div className="mt-filters">
        <span className="mt-filter-label">Filtrar:</span>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`mt-chip ${filter === f.key ? "active" : ""}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
        {hasAny && (
          <>
            <button className="mt-collapse-all" onClick={() => setAllCollapsed(!allCollapsed)}>
              {allCollapsed ? "▸ Expandir todo" : "▾ Colapsar todo"}
            </button>
            <span className="mt-pending-count">{pendingCount} pendientes</span>
          </>
        )}
      </div>

      {!hasAny ? (
        <div className="mt-empty">No tienes tareas asignadas</div>
      ) : !anyVisible ? (
        <div className="mt-empty">Ninguna tarea coincide con el filtro</div>
      ) : (
        <div className="mt-list">
          {SECTION_ORDER.map(({ key, label, reddish }) => {
            const items = sections[key];
            if (!items.length) return null;
            const isCollapsed = !!collapsed[key];
            return (
              <div key={key} className="mt-section">
                <button
                  className="mt-section-header mt-section-toggle"
                  onClick={() => toggleSection(key)}
                >
                  <span className="mt-sec-chevron">{isCollapsed ? "▸" : "▾"}</span>
                  <span style={reddish ? { color: OVERDUE_COLOR } : undefined}>{label}</span>
                  <span className="mt-section-count">{items.length}</span>
                </button>
                {!isCollapsed && items.map((t) => renderCard(t, reddish))}
              </div>
            );
          })}

          {completed.length > 0 && (
            <div className="mt-section">
              <button
                className="mt-section-header mt-section-toggle"
                onClick={() => toggleSection("completed")}
              >
                <span className="mt-sec-chevron">{collapsed["completed"] ? "▸" : "▾"}</span>
                <span>Completadas</span>
                <span className="mt-section-count">{completed.length}</span>
              </button>
              {!collapsed["completed"] && completed.map((t) => renderCard(t))}
            </div>
          )}
        </div>
      )}

      {quickOpen && me && (
        <QuickTaskModal
          me={me}
          onClose={() => setQuickOpen(false)}
          onSaved={loadTasks}
        />
      )}

      {editTask && me && (
        <QuickTaskModal
          me={me}
          task={{
            id: editTask.id,
            text: editTask.text,
            dueDate: editTask.dueDate,
            priority: editTask.priority,
            projectId: editTask.projectId,
            nodeId: editTask.nodeId,
            projectName: editTask.projectName,
          } as EditTask}
          onClose={() => setEditTask(null)}
          onSaved={loadTasks}
        />
      )}

      {templatesOpen && me && (
        <TemplatesModal
          me={me}
          onClose={() => setTemplatesOpen(false)}
          onApplied={loadTasks}
        />
      )}
    </div>
  );
}
