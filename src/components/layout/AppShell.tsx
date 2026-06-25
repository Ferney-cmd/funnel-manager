"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { applyNodeChanges, applyEdgeChanges, addEdge } from "reactflow";
import type { Node, Edge, NodeChange, EdgeChange, Connection } from "reactflow";

import { createClient } from "@/lib/supabase/client";
import { Sidebar }      from "./Sidebar";
import { Topbar }       from "./Topbar";
import { FunnelCanvas } from "@/components/canvas/FunnelCanvas";
import { TeamModal }     from "@/components/team/TeamModal";
import { Dashboard }     from "@/components/dashboard/Dashboard";
import { RolesView }     from "@/components/views/RolesView";
import { DocsView }      from "@/components/views/DocsView";
import { BoardView }     from "@/components/views/BoardView";
import { KanbanView }    from "@/components/views/KanbanView";
import { TimelineView }  from "@/components/views/TimelineView";
import { CalendarView }  from "@/components/views/CalendarView";
import { MyTasksView }   from "@/components/views/MyTasksView";
import { PortfolioView }  from "@/components/views/PortfolioView";
import { WorkloadView }   from "@/components/views/WorkloadView";
import { AdminView }       from "@/components/views/AdminView";
import { PermissionsView } from "@/components/views/PermissionsView";
import { NotificationsPanel } from "@/components/views/NotificationsPanel";
import { ProjectWizard }   from "@/components/project/ProjectWizard";
import { DuplicateModal }  from "@/components/project/DuplicateModal";
import SearchModal         from "@/components/search/SearchModal";
import { CopilotPanel }    from "@/components/copilot/CopilotPanel";
import { DashboardTabs, DASHBOARD_GROUP } from "./DashboardTabs";
import { playChime, ensureNotificationPermission, showBrowserNotification } from "@/lib/notify";

interface Toast { id: string; title: string; body: string; }
import { getCurrentProfile, getInitials, isSuperAdmin, type Profile } from "@/lib/profiles";
import { ProfileModal } from "@/components/profile/ProfileModal";
import type { FunnelNodeData, Project, ChatMessage, ProjectMember, ZoneNodeData, TaskPriority, ProjectRole, TaskStatus } from "@/lib/types";
import { ROLE_LABELS, type ProjectStatus } from "@/lib/constants";

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function getMyProjectRole(
  meId: string | undefined,
  project: Project | undefined,
  members: ProjectMember[]
): ProjectRole {
  if (!meId || !project) return "viewer";
  if (project.ownerId === meId) return "owner";
  const m = members.find((mb) => mb.id === meId);
  if (m?.role === "editor") return "editor";
  return "viewer";
}

function computeProgress(nodes: Node<FunnelNodeData>[]): number {
  const all = nodes.flatMap((n) => n.data?.tasks ?? []);
  if (!all.length) return 0;
  return Math.round((all.filter((t) => t.done).length / all.length) * 100);
}

type NodesMap = Record<string, Node<FunnelNodeData>[]>;
type ZonesMap = Record<string, Node<ZoneNodeData>[]>;
type EdgesMap  = Record<string, Edge[]>;

export function AppShell() {
  const supabase = createClient();

  const [projects,         setProjects]         = useState<Project[]>([]);
  const [activeProjectId,  setActiveProjectId]  = useState<string>("");
  const [activeView,       setActiveView]        = useState("canvas");
  const [nodesMap,         setNodesMap]          = useState<NodesMap>({});
  const [zonesMap,         setZonesMap]          = useState<ZonesMap>({});
  const [edgesMap,         setEdgesMap]          = useState<EdgesMap>({});
  const [loading,          setLoading]           = useState(true);
  const [teamOpen,         setTeamOpen]          = useState(false);
  const [profileOpen,      setProfileOpen]        = useState(false);
  const [wizardOpen,       setWizardOpen]         = useState(false);
  const [wizardParentId,   setWizardParentId]     = useState<string | null>(null);
  const [me,               setMe]               = useState<Profile | null>(null);
  const [membersByProject, setMembersByProject]  = useState<Record<string, ProjectMember[]>>({});
  const [statusesByProject, setStatusesByProject] = useState<Record<string, TaskStatus[]>>({});
  const [onlineUsers,      setOnlineUsers]       = useState<string[]>([]);
  const [commentsByTask,   setCommentsByTask]    = useState<Record<string, import("@/lib/types").TaskComment[]>>({});
  const [loadingComments,  setLoadingComments]   = useState<Record<string, boolean>>({});
  const [notifOpen,        setNotifOpen]         = useState(false);
  const [unreadCount,      setUnreadCount]       = useState(0);
  const [searchOpen,       setSearchOpen]        = useState(false);
  const [copilotOpen,      setCopilotOpen]       = useState(false);
  const [duplicateOpen,    setDuplicateOpen]     = useState(false);
  const [toasts,           setToasts]            = useState<Toast[]>([]);

  const pushToast = useCallback((title: string, body: string) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, title, body }].slice(-4));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 7000);
  }, []);

  // Ref to avoid stale closure in realtime handlers
  const activeProjectIdRef = useRef(activeProjectId);
  const meRef              = useRef(me);
  const seenNotifIds       = useRef<Set<string>>(new Set());
  const notifBaseline      = useRef<string>("");
  useEffect(() => { activeProjectIdRef.current = activeProjectId; }, [activeProjectId]);
  useEffect(() => { meRef.current = me; }, [me]);

  /* Pide permiso de notificaciones del navegador una vez que hay sesión */
  useEffect(() => { if (me) ensureNotificationPermission(); }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Persistencia de UI efímera (último proyecto + pestaña) ──── */
  // Restaura la última pestaña usada al montar (solo vistas conocidas)
  useEffect(() => {
    const KNOWN = ["canvas","board","kanban","timeline","calendar","mytasks","portfolio","workload","tablero","roles","docs","permisos","admin"];
    const v = typeof window !== "undefined" ? localStorage.getItem("fm_lastView") : null;
    if (v && KNOWN.includes(v)) setActiveView(v);
  }, []);
  // Guarda el proyecto activo y la pestaña cuando cambian
  useEffect(() => {
    if (activeProjectId && typeof window !== "undefined")
      localStorage.setItem("fm_lastProjectId", activeProjectId);
  }, [activeProjectId]);
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("fm_lastView", activeView);
  }, [activeView]);

  /* ── Ctrl+K / Cmd+K → open search ──────────────────────────── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ── Load profile + projects on mount ───────────────────────── */
  useEffect(() => {
    async function init() {
      try {
        const profile = await getCurrentProfile();
        setMe(profile);

        const { data: projs, error } = await supabase
          .from("projects")
          .select("*")
          .order("created_at", { ascending: true });

        if (error) console.error("Error cargando proyectos:", error.message);

        if (projs && projs.length > 0) {
          const mapped: Project[] = projs.map((p: any) => ({
            id: p.id, name: p.name,
            description:     p.description || "",
            client:          p.client || "",
            status:          p.status,
            progress:        0,
            blockedCount:    0,
            ownerId:         p.user_id ?? null,
            parentProjectId: p.parent_project_id ?? null,
            startDate:       p.start_date ?? null,
            endDate:         p.end_date   ?? null,
          }));
          setProjects(mapped);
          // Restaura el último proyecto usado si sigue existiendo; si no, el primero
          const savedId = typeof window !== "undefined" ? localStorage.getItem("fm_lastProjectId") : null;
          const initialId = savedId && mapped.some((p) => p.id === savedId) ? savedId : mapped[0].id;
          setActiveProjectId(initialId);
        }
      } catch (err) {
        console.error("Error al inicializar AppShell:", err);
      } finally {
        setLoading(false);
      }
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Load members of active project ─────────────────────────── */
  useEffect(() => {
    if (!activeProjectId || membersByProject[activeProjectId]) return;
    async function loadMembers() {
      const { data: project } = await supabase
        .from("projects").select("user_id").eq("id", activeProjectId).single();

      const { data: ms } = await supabase
        .from("project_members")
        .select("user_id, role")
        .eq("project_id", activeProjectId);

      const memberIds = new Set<string>();
      if (project?.user_id) memberIds.add(project.user_id);
      (ms || []).forEach((m: any) => memberIds.add(m.user_id));

      if (memberIds.size === 0) {
        setMembersByProject((prev) => ({ ...prev, [activeProjectId]: [] }));
        return;
      }

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, email, color")
        .in("id", Array.from(memberIds));

      const result: ProjectMember[] = (profiles || []).map((p: any) => ({
        id: p.id, full_name: p.full_name, email: p.email, color: p.color,
        role: project?.user_id === p.id
          ? "owner"
          : ((ms || []).find((m: any) => m.user_id === p.id)?.role ?? "viewer"),
      }));
      setMembersByProject((prev) => ({ ...prev, [activeProjectId]: result }));
    }
    loadMembers();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  /* ── Load task_statuses of active project ───────────────────── */
  useEffect(() => {
    if (!activeProjectId || statusesByProject[activeProjectId]) return;
    async function loadStatuses() {
      const { data } = await supabase
        .from("task_statuses")
        .select("id, name, color, category, position")
        .eq("project_id", activeProjectId)
        .order("position");
      const mapped: TaskStatus[] = (data || []).map((s: any) => ({
        id: s.id, name: s.name, color: s.color,
        category: s.category, position: s.position,
      }));
      setStatusesByProject((prev) => ({ ...prev, [activeProjectId]: mapped }));
    }
    loadStatuses();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  /* ── Reusable loader: fetch + populate maps for a project ───── */
  const loadProjectData = useCallback(async (projectId: string) => {
    if (!projectId) return;

    const [{ data: nodesData }, { data: edgesData }, { data: zonesData }] = await Promise.all([
      supabase
        .from("funnel_nodes")
        .select("*, node_tasks(*), node_messages(*)")
        .eq("project_id", projectId),
      supabase
        .from("funnel_edges")
        .select("*")
        .eq("project_id", projectId),
      supabase
        .from("funnel_zones")
        .select("*")
        .eq("project_id", projectId),
    ]);

    const myId = meRef.current?.id;
    const rawNodes: Node<FunnelNodeData>[] = (nodesData || []).map((n: any) => {
        const messages: import("@/lib/types").ChatMessage[] = (n.node_messages || [])
          .sort((a: any, b: any) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
          .map((m: any) => ({
            id: m.id, userId: m.user_id, userName: m.user_name,
            userInitials: m.user_initials, userColor: m.user_color,
            text: m.text, createdAt: m.created_at,
            fileUrl: m.file_url || undefined, fileType: m.file_type || undefined,
            isMe: myId ? m.user_id === myId : !!m.is_me,
            readBy: (m.read_by as string[]) || [],
          }));
        const hasUnread = myId
          ? messages.some((m) => m.userId !== myId && !m.readBy.includes(myId))
          : n.has_unread || false;
        return {
          id: n.id,
          type: "funnelNode",
          zIndex: 1,
          position: { x: n.position_x, y: n.position_y },
          data: {
            title:         n.title,
            subtitle:      n.subtitle || "",
            icon:          n.icon || "📦",
            role:          n.role,
            ownerInitials: n.owner_initials || "",
            ownerColor:    n.owner_color || "#7C3AED",
            assignedTo:    n.assigned_to || null,
            hasUnread,
            tasks: (n.node_tasks || [])
              .sort((a: any, b: any) => a.ord - b.ord)
              .map((t: any) => ({
                id:          t.id,
                text:        t.text,
                description: t.description || "",
                done:        t.done,
                order:       t.ord,
                dueDate:     t.due_date   ?? null,
                startDate:   t.start_date ?? null,
                isMilestone: t.is_milestone ?? false,
                priority:    t.priority   ?? "normal",
                assignedTo:  t.assigned_to ?? null,
                statusId:    t.status_id  ?? null,
              })),
            messages,
          },
        };
      });
      const nodes: Node<FunnelNodeData>[] = rawNodes;

      const edges: Edge[] = (edgesData || []).map((e: any) => ({
        id: e.id, source: e.source, target: e.target,
        sourceHandle: e.source_handle, targetHandle: e.target_handle,
        type: "funnelEdge", animated: e.animated,
        data: { dashed: e.dashed, label: e.label },
      }));

      const zones: Node<ZoneNodeData>[] = (zonesData || []).map((z: any) => ({
        id: z.id,
        type: "zoneNode",
        position: { x: z.position_x, y: z.position_y },
        zIndex: -1,
        style: { width: z.width, height: z.height },
        data: { label: z.label, color: z.color, width: z.width, height: z.height },
      }));

    setNodesMap((prev) => ({ ...prev, [projectId]: nodes }));
    setEdgesMap((prev) => ({ ...prev, [projectId]: edges }));
    setZonesMap((prev) => ({ ...prev, [projectId]: zones }));

    const progress = computeProgress(nodes);
    setProjects((prev) =>
      prev.map((p) => (p.id === projectId ? { ...p, progress } : p))
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stable ref to the loader for use inside the realtime subscribe callback
  const loadProjectDataRef = useRef(loadProjectData);
  useEffect(() => { loadProjectDataRef.current = loadProjectData; });

  /* ── Load nodes + zones + edges when project changes ────────── */
  useEffect(() => {
    if (!activeProjectId || nodesMap[activeProjectId] !== undefined) return;
    loadProjectData(activeProjectId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  /* ── Realtime: mensajes, tareas, nodos, edges ───────────────── */
  useEffect(() => {
    if (!activeProjectId || !me) return;

    const pid = activeProjectId; // captura estable para filtros del servidor

    const channel = supabase
      .channel(`rt:${pid}`)

      /* ── PROBLEMA 1: chat ─────────────────────────────────── */
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "node_messages",
          filter: `project_id=eq.${pid}` },
        (payload) => {
          const m = payload.new as any;
          if (m.user_id === meRef.current?.id) return; // propio, ya está en estado
          const cur = activeProjectIdRef.current;
          setNodesMap((prev) => {
            const nodes = prev[cur] ?? [];
            if (!nodes.some((n) => n.id === m.node_id)) return prev;
            return {
              ...prev,
              [cur]: nodes.map((n) =>
                n.id !== m.node_id ? n : {
                  ...n,
                  data: {
                    ...n.data,
                    hasUnread: true,
                    messages: [...n.data.messages, {
                      id: m.id, userId: m.user_id, userName: m.user_name,
                      userInitials: m.user_initials, userColor: m.user_color,
                      text: m.text, createdAt: m.created_at,
                      fileUrl: m.file_url || undefined,
                      fileType: m.file_type || undefined,
                      isMe: false, readBy: [],
                    }],
                  },
                }
              ),
            };
          });
        }
      )

      /* ── Tareas: toggle de otro usuario (UPDATE) ─────────── */
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "node_tasks",
          filter: `project_id=eq.${pid}` },
        (payload) => {
          const t = payload.new as any;
          const cur = activeProjectIdRef.current;
          setNodesMap((prev) => {
            const nodes = prev[cur] ?? [];
            if (!nodes.some((n) => n.data.tasks.some((tk) => tk.id === t.id))) return prev;
            return {
              ...prev,
              [cur]: nodes.map((n) => ({
                ...n,
                data: {
                  ...n.data,
                  tasks: n.data.tasks.map((tk) =>
                    tk.id !== t.id ? tk : { ...tk, done: t.done, statusId: t.status_id ?? tk.statusId }
                  ),
                },
              })),
            };
          });
        }
      )

      /* ── Tareas: nueva tarea de otro usuario (INSERT) ────── */
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "node_tasks",
          filter: `project_id=eq.${pid}` },
        (payload) => {
          const t = payload.new as any;
          const cur = activeProjectIdRef.current;
          setNodesMap((prev) => {
            const nodes = prev[cur] ?? [];
            const target = nodes.find((n) => n.id === t.node_id);
            if (!target) return prev;
            if (target.data.tasks.some((tk) => tk.id === t.id)) return prev; // ya existe (insert propio)
            return {
              ...prev,
              [cur]: nodes.map((n) =>
                n.id !== t.node_id ? n : {
                  ...n,
                  data: {
                    ...n.data,
                    tasks: [...n.data.tasks, {
                      id:       t.id,
                      text:     t.text,
                      description: t.description || "",
                      done:     t.done,
                      order:    t.ord,
                      dueDate:  t.due_date  ?? null,
                      priority: t.priority  ?? "normal",
                    }]
                      .sort((a, b) => a.order - b.order),
                  },
                }
              ),
            };
          });
        }
      )

      /* ── Tareas: eliminar tarea de otro usuario (DELETE) ─── */
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "node_tasks",
          filter: `project_id=eq.${pid}` },
        (payload) => {
          const t = payload.old as any;
          if (!t?.id) return;
          const cur = activeProjectIdRef.current;
          setNodesMap((prev) => {
            const nodes = prev[cur] ?? [];
            return {
              ...prev,
              [cur]: nodes.map((n) => ({
                ...n,
                data: { ...n.data, tasks: n.data.tasks.filter((tk) => tk.id !== t.id) },
              })),
            };
          });
        }
      )

      /* ── PROBLEMA 2: dueño del módulo (UPDATE de nodos) ───── */
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "funnel_nodes",
          filter: `project_id=eq.${pid}` },
        (payload) => {
          const n = payload.new as any;
          const cur = activeProjectIdRef.current;
          setNodesMap((prev) => {
            const nodes = prev[cur] ?? [];
            if (!nodes.some((node) => node.id === n.id)) return prev;
            return {
              ...prev,
              [cur]: nodes.map((node) =>
                node.id !== n.id ? node : {
                  ...node,
                  position: { x: n.position_x, y: n.position_y },
                  data: {
                    ...node.data,
                    title:         n.title,
                    subtitle:      n.subtitle || "",
                    icon:          n.icon || "📦",
                    role:          n.role,
                    ownerInitials: n.owner_initials || "",
                    ownerColor:    n.owner_color || "#7C3AED",
                    assignedTo:    n.assigned_to || null,
                  },
                }
              ),
            };
          });
        }
      )

      /* ── Nodos: otro usuario añadió módulo (INSERT) ─────────── */
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "funnel_nodes",
          filter: `project_id=eq.${pid}` },
        (payload) => {
          const n = payload.new as any;
          const cur = activeProjectIdRef.current;
          setNodesMap((prev) => {
            const nodes = prev[cur] ?? [];
            if (nodes.some((node) => node.id === n.id)) return prev; // ya existe (insert propio)
            const newNode: Node<FunnelNodeData> = {
              id: n.id, type: "funnelNode", zIndex: 1,
              position: { x: n.position_x, y: n.position_y },
              data: {
                title:         n.title,
                subtitle:      n.subtitle || "",
                icon:          n.icon || "📦",
                role:          n.role,
                ownerInitials: n.owner_initials || "",
                ownerColor:    n.owner_color || "#7C3AED",
                assignedTo:    n.assigned_to || null,
                tasks: [], messages: [], hasUnread: false,
              },
            };
            return { ...prev, [cur]: [...nodes, newNode] };
          });
        }
      )

      /* ── Nodos: otro usuario eliminó módulo (DELETE) ─────────── */
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "funnel_nodes",
          filter: `project_id=eq.${pid}` },
        (payload) => {
          const n = payload.old as any;
          if (!n?.id) return;
          const cur = activeProjectIdRef.current;
          setNodesMap((prev) => {
            const nodes = prev[cur] ?? [];
            if (!nodes.some((node) => node.id === n.id)) return prev;
            return { ...prev, [cur]: nodes.filter((node) => node.id !== n.id) };
          });
        }
      )

      /* ── PROBLEMA 3: conexiones — nuevo edge (INSERT) ─────── */
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "funnel_edges",
          filter: `project_id=eq.${pid}` },
        (payload) => {
          const e = payload.new as any;
          const cur = activeProjectIdRef.current;
          setEdgesMap((prev) => {
            const edges = prev[cur] ?? [];
            if (edges.some((edge) => edge.id === e.id)) return prev; // ya existe (insert propio)
            const newEdge: Edge = {
              id: e.id, source: e.source, target: e.target,
              sourceHandle: e.source_handle ?? null,
              targetHandle: e.target_handle ?? null,
              type: "funnelEdge", animated: e.animated ?? false,
              data: { dashed: e.dashed ?? false, label: e.label ?? "" },
            };
            return { ...prev, [cur]: [...edges, newEdge] };
          });
        }
      )

      /* ── PROBLEMA 3: conexiones — eliminar edge (DELETE) ──── */
      .on("postgres_changes",
        { event: "DELETE", schema: "public", table: "funnel_edges",
          filter: `project_id=eq.${pid}` },
        (payload) => {
          const e = payload.old as any;
          if (!e?.id) return;
          const cur = activeProjectIdRef.current;
          setEdgesMap((prev) => {
            const edges = prev[cur] ?? [];
            return { ...prev, [cur]: edges.filter((edge) => edge.id !== e.id) };
          });
        }
      )

      /* ── Comentarios de tareas (task_comments) ────────────── */
      .on("postgres_changes",
        { event: "*", schema: "public", table: "task_comments",
          filter: `project_id=eq.${pid}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as any;
          if (!row?.id) return;
          const taskId = row.task_id;
          const myId = meRef.current?.id;

          setCommentsByTask((prev) => {
            const existing = prev[taskId];
            // Solo reconciliamos si la tarea ya fue abierta (cargada).
            if (existing === undefined) return prev;

            if (payload.eventType === "DELETE") {
              return { ...prev, [taskId]: existing.filter((c) => c.id !== row.id) };
            }

            const mapped: import("@/lib/types").TaskComment = {
              id:           row.id,
              taskId:       row.task_id,
              userId:       row.user_id,
              userName:     row.user_name,
              userInitials: row.user_initials,
              userColor:    row.user_color,
              text:         row.text,
              createdAt:    row.created_at,
              isMe:         myId ? row.user_id === myId : false,
            };

            if (payload.eventType === "UPDATE") {
              return {
                ...prev,
                [taskId]: existing.map((c) => (c.id === row.id ? mapped : c)),
              };
            }

            // INSERT: idempotente por id; ignora si ya está (p.ej. el propio optimista)
            if (existing.some((c) => c.id === row.id)) return prev;
            return { ...prev, [taskId]: [...existing, mapped] };
          });
        }
      )

      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Resync tras (re)conexión para recuperar eventos perdidos.
          loadProjectDataRef.current(activeProjectIdRef.current);
        }
      });

    return () => { supabase.removeChannel(channel); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, me?.id]);

  /* ── Presencia: usuarios en línea ───────────────────────────── */
  useEffect(() => {
    if (!activeProjectId || !me) return;

    const ch = supabase
      .channel(`presence:${activeProjectId}`)
      .on("presence", { event: "sync" }, () => {
        const state = ch.presenceState<{ user_id: string }>();
        const ids = Object.values(state).flat().map((p) => p.user_id);
        setOnlineUsers(ids);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await ch.track({ user_id: me.id });
        }
      });

    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId, me?.id]);

  /* ── Notificaciones: conteo + avisos (realtime + polling de respaldo) ─
     El realtime de Supabase no siempre entrega los INSERT a tiempo, así que
     un poll cada 25s garantiza que los avisos (sonido + toast + navegador)
     y el contador funcionen de forma confiable. Se deduplica por id. */
  useEffect(() => {
    if (!me) return;
    const myId = me.id;
    let cancelled = false;
    const seen = seenNotifIds.current;
    // Base de corte tomada del SERVIDOR (evita desfase de reloj cliente/servidor).
    // Hasta que se resuelva, "" hace que el poll espere (no dispara avisos viejos).
    notifBaseline.current = "";
    supabase
      .from("notifications")
      .select("created_at")
      .eq("user_id", myId)
      .order("created_at", { ascending: false })
      .limit(1)
      .then(({ data }) => {
        if (!cancelled) notifBaseline.current = data?.[0]?.created_at ?? new Date(0).toISOString();
      });

    const fireFx = (n: { id: string; read?: boolean; title?: string; body?: string }) => {
      if (seen.has(n.id)) return;
      seen.add(n.id);
      const title = n.title || "Nueva notificación";
      const body  = n.body  || "";
      playChime();
      pushToast(title, body);
      if (typeof document !== "undefined" && document.hidden) {
        showBrowserNotification(title, body);
      }
    };

    const refreshCount = () => {
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", myId)
        .eq("read", false)
        .then(({ count }) => { if (!cancelled) setUnreadCount(count ?? 0); });
    };

    refreshCount();

    // Realtime (instantáneo cuando funciona)
    const ch = supabase
      .channel(`notif-rt:${myId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${myId}` },
        (payload) => {
          if (cancelled) return;
          const n = payload.new as { id: string; read?: boolean; title?: string; body?: string; created_at?: string };
          if (!n.read) setUnreadCount((c) => c + 1);
          if (n.created_at && n.created_at > notifBaseline.current) notifBaseline.current = n.created_at;
          if (!n.read) fireFx(n);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${myId}` },
        () => { if (!cancelled) refreshCount(); }
      )
      .subscribe();

    // Polling de respaldo: trae las nuevas desde el último corte y dispara fx
    const poll = setInterval(async () => {
      if (cancelled || !notifBaseline.current) return;  // espera a tener base del servidor
      const { data } = await supabase
        .from("notifications")
        .select("id, title, body, read, created_at")
        .eq("user_id", myId)
        .gt("created_at", notifBaseline.current)
        .order("created_at", { ascending: true })
        .limit(20);
      if (cancelled || !data) return;
      for (const n of data as { id: string; title?: string; body?: string; read?: boolean; created_at: string }[]) {
        if (n.created_at > notifBaseline.current) notifBaseline.current = n.created_at;
        if (!n.read) fireFx(n);
      }
      refreshCount();
    }, 15000);

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
      clearInterval(poll);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id]);

  const currentNodes   = useMemo(() => nodesMap[activeProjectId]  ?? [], [nodesMap,  activeProjectId]);
  const currentEdges   = useMemo(() => edgesMap[activeProjectId]  ?? [], [edgesMap,  activeProjectId]);
  const currentZones   = useMemo(() => zonesMap[activeProjectId]  ?? [], [zonesMap,  activeProjectId]);
  const globalProgress = useMemo(() => computeProgress(currentNodes), [currentNodes]);

  /* ── Sync progress into project list ───────────────────────── */
  useEffect(() => {
    if (!activeProjectId) return;
    const progress = computeProgress(currentNodes);
    setProjects((prev) =>
      prev.map((p) => (p.id === activeProjectId ? { ...p, progress } : p))
    );
  }, [currentNodes, activeProjectId]);

  /* ── Node / edge changes — split zone vs funnel ─────────────── */
  const handleNodesChange = useCallback((changes: NodeChange[]) => {
    const zoneIds = new Set((zonesMap[activeProjectId] ?? []).map((z) => z.id));

    const zoneChanges   = changes.filter((c) => "id" in c && zoneIds.has(c.id));
    const funnelChanges = changes.filter((c) => !("id" in c) || !zoneIds.has(c.id));

    if (zoneChanges.length) {
      setZonesMap((prev) => ({
        ...prev,
        [activeProjectId]: applyNodeChanges(zoneChanges, prev[activeProjectId] ?? []) as Node<ZoneNodeData>[],
      }));
      // Persist position
      zoneChanges
        .filter((c): c is Extract<NodeChange, { type: "position" }> =>
          c.type === "position" && !c.dragging && !!c.position
        )
        .forEach((c) => {
          supabase.from("funnel_zones")
            .update({ position_x: c.position!.x, position_y: c.position!.y })
            .eq("id", c.id).then(() => {});
        });
      // Persist deletions (Delete key)
      zoneChanges
        .filter((c): c is Extract<NodeChange, { type: "remove" }> => c.type === "remove")
        .forEach((c) => {
          supabase.from("funnel_zones").delete().eq("id", c.id).then(() => {});
        });
    }

    if (funnelChanges.length) {
      setNodesMap((prev) => ({
        ...prev,
        [activeProjectId]: applyNodeChanges(funnelChanges, prev[activeProjectId] ?? []) as Node<FunnelNodeData>[],
      }));
      // Persist position
      funnelChanges
        .filter((c): c is Extract<NodeChange, { type: "position" }> =>
          c.type === "position" && !c.dragging && !!c.position
        )
        .forEach((c) => {
          supabase.from("funnel_nodes")
            .update({ position_x: c.position!.x, position_y: c.position!.y })
            .eq("id", c.id).then(() => {});
        });
      // Persist deletions (Delete key) — cascades to tasks/messages
      funnelChanges
        .filter((c): c is Extract<NodeChange, { type: "remove" }> => c.type === "remove")
        .forEach((c) => {
          supabase.from("funnel_nodes").delete().eq("id", c.id).then(() => {});
        });
    }
  }, [activeProjectId, zonesMap, supabase]);

  /* ── Persist node/zone position on drag stop (confiable: posición final) ── */
  const handleNodeDragStop = useCallback((_evt: React.MouseEvent, node: Node) => {
    const zoneIds = new Set((zonesMap[activeProjectId] ?? []).map((z) => z.id));
    const table = zoneIds.has(node.id) ? "funnel_zones" : "funnel_nodes";
    const x = Math.round(node.position.x);
    const y = Math.round(node.position.y);
    // Asegura el store (por si algún cambio visual quedó pendiente)
    const setMap = zoneIds.has(node.id) ? setZonesMap : setNodesMap;
    setMap((prev: any) => ({
      ...prev,
      [activeProjectId]: (prev[activeProjectId] ?? []).map((n: any) =>
        n.id !== node.id ? n : { ...n, position: { x, y } }
      ),
    }));
    supabase.from(table).update({ position_x: x, position_y: y }).eq("id", node.id).then(({ error }) => {
      if (error) console.error("No se pudo guardar la posición:", error.message);
    });
  }, [activeProjectId, zonesMap, supabase]);

  const handleEdgesChange = useCallback((changes: EdgeChange[]) => {
    setEdgesMap((prev) => ({
      ...prev,
      [activeProjectId]: applyEdgeChanges(changes, prev[activeProjectId] ?? []),
    }));
    // Persist edge deletions
    changes
      .filter((c): c is Extract<EdgeChange, { type: "remove" }> => c.type === "remove")
      .forEach((c) => {
        supabase.from("funnel_edges").delete().eq("id", c.id).then(() => {});
      });
  }, [activeProjectId, supabase]);

  /* ── Connect nodes ──────────────────────────────────────────── */
  const handleConnect = useCallback((connection: Connection) => {
    const edgeId = `e-${uid()}`;
    setEdgesMap((prev) => ({
      ...prev,
      [activeProjectId]: addEdge(
        { ...connection, id: edgeId, type: "funnelEdge", animated: false },
        prev[activeProjectId] ?? []
      ),
    }));
    supabase.from("funnel_edges").insert({
      id: edgeId, project_id: activeProjectId,
      source: connection.source, target: connection.target,
      source_handle: connection.sourceHandle, target_handle: connection.targetHandle,
      animated: false, dashed: false,
    }).then(() => {});
  }, [activeProjectId, supabase]);

  /* ── Task toggle ────────────────────────────────────────────── */
  const handleTaskToggle = useCallback((nodeId: string, taskId: string) => {
    setNodesMap((prev) => {
      const nodes  = prev[activeProjectId] ?? [];
      const node   = nodes.find((n) => n.id === nodeId);
      const task   = node?.data.tasks.find((t) => t.id === taskId);
      if (!task) return prev;
      const newDone = !task.done;
      const snapshot = prev;
      supabase.from("node_tasks").update({ done: newDone }).eq("id", taskId).then(({ error }) => {
        if (error) { setNodesMap(snapshot); alert("No se pudo guardar: " + error.message); }
      });
      return {
        ...prev,
        [activeProjectId]: nodes.map((n) =>
          n.id !== nodeId ? n : {
            ...n,
            data: {
              ...n.data,
              tasks: n.data.tasks.map((t) => t.id === taskId ? { ...t, done: newDone } : t),
            },
          }
        ),
      };
    });
  }, [activeProjectId, supabase]);

  /* ── Update node data ───────────────────────────────────────── */
  const handleUpdateNodeData = useCallback((nodeId: string, updates: { title?: string; subtitle?: string; icon?: string; role?: string; assignedTo?: string | null; ownerInitials?: string; ownerColor?: string }) => {
    setNodesMap((prev) => ({
      ...prev,
      [activeProjectId]: (prev[activeProjectId] ?? []).map((n) =>
        n.id !== nodeId ? n : { ...n, data: { ...n.data, ...updates } }
      ),
    }));
    const dbUpdates: Record<string, string | null> = {};
    if (updates.title         !== undefined) dbUpdates.title          = updates.title!;
    if (updates.role          !== undefined) dbUpdates.role           = updates.role!;
    if (updates.icon          !== undefined) dbUpdates.icon           = updates.icon!;
    if (updates.subtitle      !== undefined) dbUpdates.subtitle       = updates.subtitle!;
    if (updates.assignedTo    !== undefined) dbUpdates.assigned_to    = updates.assignedTo;
    if (updates.ownerInitials !== undefined) dbUpdates.owner_initials = updates.ownerInitials;
    if (updates.ownerColor    !== undefined) dbUpdates.owner_color    = updates.ownerColor;
    if (Object.keys(dbUpdates).length) {
      supabase.from("funnel_nodes").update(dbUpdates).eq("id", nodeId).then(() => {});
    }
  }, [activeProjectId, supabase]);

  /* ── Delete module (node) ───────────────────────────────────── */
  const handleDeleteModule = useCallback((nodeId: string) => {
    setNodesMap((prev) => {
      const snapshot = prev;
      supabase.from("funnel_nodes").delete().eq("id", nodeId).then(({ error }) => {
        if (error) { setNodesMap(snapshot); alert("No se pudo eliminar el módulo: " + error.message); }
      });
      return {
        ...prev,
        [activeProjectId]: (prev[activeProjectId] ?? []).filter((n) => n.id !== nodeId),
      };
    });
    // Limpia edges conectados al nodo eliminado
    setEdgesMap((prev) => ({
      ...prev,
      [activeProjectId]: (prev[activeProjectId] ?? []).filter((e) => e.source !== nodeId && e.target !== nodeId),
    }));
  }, [activeProjectId, supabase]);

  /* ── Delete task from node ──────────────────────────────────── */
  const handleDeleteTask = useCallback((nodeId: string, taskId: string) => {
    setNodesMap((prev) => {
      const snapshot = prev;
      supabase.from("node_tasks").delete().eq("id", taskId).then(({ error }) => {
        if (error) { setNodesMap(snapshot); alert("No se pudo guardar: " + error.message); }
      });
      return {
        ...prev,
        [activeProjectId]: (prev[activeProjectId] ?? []).map((n) =>
          n.id !== nodeId ? n : {
            ...n,
            data: { ...n.data, tasks: n.data.tasks.filter((t) => t.id !== taskId) },
          }
        ),
      };
    });
  }, [activeProjectId, supabase]);

  /* ── Add task to node ───────────────────────────────────────── */
  const handleAddTask = useCallback((nodeId: string, text: string, dueDate?: string, priority?: TaskPriority) => {
    const taskId = `t-${uid()}`;
    const nodes  = nodesMap[activeProjectId] ?? [];
    const node   = nodes.find((n) => n.id === nodeId);
    const order  = node?.data.tasks.length ?? 0;
    setNodesMap((prev) => {
      const snapshot = prev;
      supabase.from("node_tasks").insert({
        id: taskId, node_id: nodeId, text, done: false, ord: order,
        due_date: dueDate   || null,
        priority: priority  || "normal",
      }).then(({ error }) => {
        if (error) { setNodesMap(snapshot); alert("No se pudo guardar: " + error.message); }
      });
      return {
        ...prev,
        [activeProjectId]: (prev[activeProjectId] ?? []).map((n) =>
          n.id !== nodeId ? n : {
            ...n,
            data: {
              ...n.data,
              tasks: [...n.data.tasks, {
                id: taskId, text, done: false, order,
                dueDate:  dueDate  ?? null,
                priority: priority ?? "normal",
              }],
            },
          }
        ),
      };
    });
  }, [activeProjectId, nodesMap, supabase]);

  /* ── Update task fields (text / dueDate / priority / assignedTo) ─── */
  const handleUpdateTask = useCallback((
    nodeId: string,
    taskId: string,
    updates: { text?: string; dueDate?: string | null; priority?: TaskPriority; assignedTo?: string | null; description?: string }
  ) => {
    let snapshot: NodesMap = {};
    setNodesMap((prev) => {
      snapshot = prev;
      return {
        ...prev,
        [activeProjectId]: (prev[activeProjectId] ?? []).map((n) =>
          n.id !== nodeId ? n : {
            ...n,
            data: {
              ...n.data,
              tasks: n.data.tasks.map((t) =>
                t.id !== taskId ? t : { ...t, ...updates }
              ),
            },
          }
        ),
      };
    });
    const db: Record<string, unknown> = {};
    if (updates.text        !== undefined) db.text        = updates.text;
    if (updates.dueDate     !== undefined) db.due_date    = updates.dueDate;
    if (updates.priority    !== undefined) db.priority    = updates.priority;
    if (updates.assignedTo  !== undefined) db.assigned_to = updates.assignedTo;
    if (updates.description !== undefined) db.description = updates.description;
    if (Object.keys(db).length)
      supabase.from("node_tasks").update(db).eq("id", taskId).then(({ error }) => {
        if (error) { setNodesMap(snapshot); alert("No se pudo guardar: " + error.message); }
      });
  }, [activeProjectId, supabase]);

  /* ── Move task to a different status (Kanban drag) ──────────── */
  const handleMoveTask = useCallback((nodeId: string, taskId: string, statusId: string, done: boolean) => {
    let snapshot: NodesMap | null = null;
    setNodesMap((prev) => {
      snapshot = prev;
      return {
        ...prev,
        [activeProjectId]: (prev[activeProjectId] ?? []).map((n) =>
          n.id !== nodeId ? n : {
            ...n,
            data: { ...n.data, tasks: n.data.tasks.map((t) => t.id === taskId ? { ...t, statusId, done } : t) },
          }
        ),
      };
    });
    supabase.from("node_tasks").update({ status_id: statusId, done }).eq("id", taskId).then(({ error }) => {
      if (error && snapshot) { setNodesMap(snapshot); alert("No se pudo mover la tarea: " + error.message); }
    });
  }, [activeProjectId, supabase]);

  /* ── Move task within / between nodes (List view DnD) ───────── */
  const handleMoveTaskToNode = useCallback((taskId: string, fromNodeId: string, toNodeId: string, targetIndex: number) => {
    let snapshot: NodesMap | null = null;
    setNodesMap((prev) => {
      snapshot = prev;
      const nodes = prev[activeProjectId] ?? [];
      const fromNode = nodes.find((n) => n.id === fromNodeId);
      const moving = fromNode?.data.tasks.find((t) => t.id === taskId);
      if (!moving) return prev;

      const next = nodes.map((n) => {
        if (n.id === fromNodeId && fromNodeId === toNodeId) {
          // reorder within same node
          const without = n.data.tasks.filter((t) => t.id !== taskId);
          const idx = Math.max(0, Math.min(targetIndex, without.length));
          without.splice(idx, 0, moving);
          return { ...n, data: { ...n.data, tasks: without.map((t, i) => ({ ...t, order: i })) } };
        }
        if (n.id === fromNodeId) {
          return { ...n, data: { ...n.data, tasks: n.data.tasks.filter((t) => t.id !== taskId).map((t, i) => ({ ...t, order: i })) } };
        }
        if (n.id === toNodeId) {
          const arr = n.data.tasks.slice();
          const idx = Math.max(0, Math.min(targetIndex, arr.length));
          arr.splice(idx, 0, { ...moving });
          return { ...n, data: { ...n.data, tasks: arr.map((t, i) => ({ ...t, order: i })) } };
        }
        return n;
      });
      return { ...prev, [activeProjectId]: next };
    });

    // Persist: move node_id if changed, then re-sequence ord of affected node(s).
    (async () => {
      try {
        if (fromNodeId !== toNodeId) {
          const { error } = await supabase.from("node_tasks").update({ node_id: toNodeId }).eq("id", taskId);
          if (error) throw error;
        }
        // Re-number ord for the affected nodes based on the new optimistic state.
        const affected = fromNodeId === toNodeId ? [toNodeId] : [fromNodeId, toNodeId];
        let latest: NodesMap = {};
        setNodesMap((cur) => { latest = cur; return cur; });
        const nodes = latest[activeProjectId] ?? [];
        for (const nid of affected) {
          const nn = nodes.find((n) => n.id === nid);
          if (!nn) continue;
          await Promise.all(nn.data.tasks.map((t, i) =>
            supabase.from("node_tasks").update({ ord: i }).eq("id", t.id)
          ));
        }
      } catch (e: any) {
        if (snapshot) setNodesMap(snapshot);
        alert("No se pudo mover la tarea: " + (e?.message ?? e));
      }
    })();
  }, [activeProjectId, supabase]);

  /* ── Load comments for a task (lazy, once per task) ─────────── */
  const handleLoadComments = useCallback((taskId: string) => {
    setCommentsByTask((cur) => {
      if (cur[taskId]) return cur; // ya cargado
      setLoadingComments((p) => (p[taskId] ? p : { ...p, [taskId]: true }));
      supabase
        .from("task_comments")
        .select("*")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true })
        .then(({ data }) => {
          const myId = meRef.current?.id;
          const mapped = (data ?? []).map((c: any) => ({
            id: c.id, taskId: c.task_id, userId: c.user_id,
            userName: c.user_name, userInitials: c.user_initials,
            userColor: c.user_color, text: c.text, createdAt: c.created_at,
            isMe: myId ? c.user_id === myId : false,
          }));
          setCommentsByTask((p) => ({ ...p, [taskId]: mapped }));
          setLoadingComments((p) => ({ ...p, [taskId]: false }));
        });
      return cur;
    });
  }, [supabase]);

  /* ── Add comment (optimistic + revert on error) ─────────────── */
  const handleAddComment = useCallback((taskId: string, text: string) => {
    if (!me || !text.trim()) return;
    const id = `cmt-${uid()}`;
    const optimistic: import("@/lib/types").TaskComment = {
      id, taskId, userId: me.id,
      userName: me.full_name || me.email,
      userInitials: getInitials(me.full_name || me.email),
      userColor: me.color, text: text.trim(),
      createdAt: new Date().toISOString(), isMe: true,
    };
    setCommentsByTask((p) => ({ ...p, [taskId]: [...(p[taskId] ?? []), optimistic] }));
    supabase.from("task_comments").insert({
      id, task_id: taskId, user_id: me.id,
      user_name: optimistic.userName, user_initials: optimistic.userInitials,
      user_color: optimistic.userColor, text: optimistic.text,
    }).then(({ error }) => {
      if (error) {
        setCommentsByTask((p) => ({ ...p, [taskId]: (p[taskId] ?? []).filter((c) => c.id !== id) }));
        alert("No se pudo enviar el comentario: " + error.message);
      }
    });
  }, [supabase, me]);

  /* ── Send text message ──────────────────────────────────────── */
  const handleSendMessage = useCallback((nodeId: string, text: string) => {
    if (!me) return;
    const msg: ChatMessage = {
      id: `msg-${uid()}`,
      userId:       me.id,
      userName:     me.full_name || me.email,
      userInitials: getInitials(me.full_name || me.email),
      userColor:    me.color,
      text, createdAt: new Date().toISOString(), isMe: true,
      readBy: [me.id],
    };
    supabase.from("node_messages").insert({
      id: msg.id, node_id: nodeId, user_id: msg.userId,
      user_name: msg.userName, user_initials: msg.userInitials,
      user_color: msg.userColor, text: msg.text,
      is_me: msg.isMe, created_at: msg.createdAt,
      read_by: [msg.userId],
    }).then(() => {});
    setNodesMap((prev) => ({
      ...prev,
      [activeProjectId]: (prev[activeProjectId] ?? []).map((n) =>
        n.id !== nodeId ? n : {
          ...n,
          data: { ...n.data, messages: [...n.data.messages, msg], hasUnread: false },
        }
      ),
    }));
  }, [activeProjectId, supabase, me]);

  /* ── Upload file + send as message ─────────────────────────── */
  const handleUploadFile = useCallback(async (nodeId: string, file: File) => {
    if (!me) return;
    const ext  = file.name.split(".").pop()?.toLowerCase() ?? "bin";
    const path = `${activeProjectId}/${nodeId}/${uid()}.${ext}`;
    const { error } = await supabase.storage
      .from("node-attachments")
      .upload(path, file, { cacheControl: "3600", upsert: false });
    if (error) { console.error("Upload error:", error.message); return; }
    const { data: urlData } = supabase.storage
      .from("node-attachments")
      .getPublicUrl(path);
    const fileUrl  = urlData.publicUrl;
    const fileType = file.type;
    const msg: ChatMessage = {
      id: `msg-${uid()}`,
      userId:       me.id,
      userName:     me.full_name || me.email,
      userInitials: getInitials(me.full_name || me.email),
      userColor:    me.color,
      text:         file.name,
      createdAt:    new Date().toISOString(),
      isMe:         true,
      fileUrl,
      fileType,
      readBy:       [me.id],
    };
    supabase.from("node_messages").insert({
      id: msg.id, node_id: nodeId, user_id: msg.userId,
      user_name: msg.userName, user_initials: msg.userInitials,
      user_color: msg.userColor, text: msg.text,
      is_me: msg.isMe, created_at: msg.createdAt,
      file_url: fileUrl, file_type: fileType,
      read_by: [msg.userId],
    }).then(() => {});
    setNodesMap((prev) => ({
      ...prev,
      [activeProjectId]: (prev[activeProjectId] ?? []).map((n) =>
        n.id !== nodeId ? n : {
          ...n,
          data: { ...n.data, messages: [...n.data.messages, msg], hasUnread: false },
        }
      ),
    }));
  }, [activeProjectId, supabase, me]);

  /* ── Mark messages as read when node is expanded ───────────── */
  const handleMarkRead = useCallback((nodeId: string) => {
    if (!me) return;
    // Update local state immediately
    setNodesMap((prev) => ({
      ...prev,
      [activeProjectId]: (prev[activeProjectId] ?? []).map((n) =>
        n.id !== nodeId ? n : {
          ...n,
          data: {
            ...n.data,
            hasUnread: false,
            messages: n.data.messages.map((m) =>
              m.userId === me.id || m.readBy.includes(me.id)
                ? m
                : { ...m, readBy: [...m.readBy, me.id] }
            ),
          },
        }
      ),
    }));
    // Persist to DB via RPC (graceful — fails silently if column doesn't exist yet)
    supabase
      .rpc("mark_node_messages_read", { p_node_id: nodeId, p_user_id: me.id })
      .then(() => {});
  }, [activeProjectId, me, supabase]);

  /* ── Add funnel module ──────────────────────────────────────── */
  const handleAddModule = useCallback(async () => {
    const id       = `node-${uid()}`;
    const existing = nodesMap[activeProjectId] ?? [];
    const lastX    = existing.length
      ? Math.max(...existing.map((n) => n.position.x)) + 230
      : 80;

    await supabase.from("funnel_nodes").insert({
      id, project_id: activeProjectId,
      title: "Nuevo Módulo", subtitle: ROLE_LABELS["ghl"],
      icon: "📦", role: "ghl",
      owner_initials: "FV", owner_color: "#7C3AED",
      position_x: lastX, position_y: 160,
    });

    const newNode: Node<FunnelNodeData> = {
      id, type: "funnelNode", zIndex: 1,
      position: { x: lastX, y: 160 },
      data: {
        title: "Nuevo Módulo", subtitle: ROLE_LABELS["ghl"],
        icon: "📦", role: "ghl",
        ownerInitials: "FV", ownerColor: "#7C3AED",
        tasks: [], messages: [], hasUnread: false,
      },
    };
    setNodesMap((prev) => ({
      ...prev,
      [activeProjectId]: [...(prev[activeProjectId] ?? []), newNode],
    }));
  }, [activeProjectId, nodesMap, supabase]);

  /* ── Add zone ───────────────────────────────────────────────── */
  const handleAddZone = useCallback(async () => {
    const id    = `zone-${uid()}`;
    const W     = 360;
    const H     = 260;
    const zones = currentZones;
    const lastX = zones.length ? Math.max(...zones.map((z) => z.position.x)) + 40 : 60;
    const lastY = zones.length ? Math.max(...zones.map((z) => z.position.y)) + 40 : 60;

    await supabase.from("funnel_zones").insert({
      id, project_id: activeProjectId,
      label: "Nueva Zona", color: "#7C3AED",
      position_x: lastX, position_y: lastY,
      width: W, height: H,
    });

    const newZone: Node<ZoneNodeData> = {
      id, type: "zoneNode",
      position: { x: lastX, y: lastY },
      zIndex: -1,
      style: { width: W, height: H },
      data: { label: "Nueva Zona", color: "#7C3AED", width: W, height: H },
    };
    setZonesMap((prev) => ({
      ...prev,
      [activeProjectId]: [...(prev[activeProjectId] ?? []), newZone],
    }));
  }, [activeProjectId, currentZones, supabase]);

  /* ── Zone resize / label / color / delete ───────────────────── */
  const handleZoneResize = useCallback((zoneId: string, w: number, h: number) => {
    setZonesMap((prev) => ({
      ...prev,
      [activeProjectId]: (prev[activeProjectId] ?? []).map((z) =>
        z.id !== zoneId ? z : { ...z, style: { ...z.style, width: w, height: h }, data: { ...z.data, width: w, height: h } }
      ),
    }));
    supabase.from("funnel_zones").update({ width: w, height: h }).eq("id", zoneId).then(() => {});
  }, [activeProjectId, supabase]);

  const handleZoneLabelChange = useCallback((zoneId: string, label: string) => {
    setZonesMap((prev) => ({
      ...prev,
      [activeProjectId]: (prev[activeProjectId] ?? []).map((z) =>
        z.id !== zoneId ? z : { ...z, data: { ...z.data, label } }
      ),
    }));
    supabase.from("funnel_zones").update({ label }).eq("id", zoneId).then(() => {});
  }, [activeProjectId, supabase]);

  const handleZoneColorChange = useCallback((zoneId: string, color: string) => {
    setZonesMap((prev) => ({
      ...prev,
      [activeProjectId]: (prev[activeProjectId] ?? []).map((z) =>
        z.id !== zoneId ? z : { ...z, data: { ...z.data, color } }
      ),
    }));
    supabase.from("funnel_zones").update({ color }).eq("id", zoneId).then(() => {});
  }, [activeProjectId, supabase]);

  const handleZoneDelete = useCallback((zoneId: string) => {
    setZonesMap((prev) => ({
      ...prev,
      [activeProjectId]: (prev[activeProjectId] ?? []).filter((z) => z.id !== zoneId),
    }));
    supabase.from("funnel_zones").delete().eq("id", zoneId).then(() => {});
  }, [activeProjectId, supabase]);

  /* ── New project (abre el wizard) ───────────────────────────── */
  const handleNewProject = useCallback(() => {
    setWizardParentId(null);
    setWizardOpen(true);
  }, []);

  const handleNewSubproject = useCallback(() => {
    if (!activeProjectId) return;
    setWizardParentId(activeProjectId);
    setWizardOpen(true);
  }, [activeProjectId]);

  const handleChangeProjectStatus = useCallback(async (status: ProjectStatus) => {
    if (!activeProjectId) return;
    setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, status } : p));
    const { error } = await supabase.from("projects").update({ status }).eq("id", activeProjectId);
    if (error) alert("No se pudo cambiar el estado: " + error.message);
  }, [activeProjectId, supabase]);

  /* ── Wizard finished — recarga el proyecto recién creado ────── */
  const handleWizardCreated = useCallback(async (projectId: string) => {
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();
    if (error || !data) return;

    const newProject: Project = {
      id:              data.id,
      name:            data.name,
      description:     data.description || "",
      client:          data.client || "",
      status:          data.status,
      progress:        0,
      blockedCount:    0,
      ownerId:         data.user_id ?? null,
      parentProjectId: data.parent_project_id ?? null,
      startDate:       data.start_date ?? null,
      endDate:         data.end_date   ?? null,
    };
    setProjects((prev) => [...prev, newProject]);
    setNodesMap((prev) => ({ ...prev, [data.id]: [] }));
    setEdgesMap((prev) => ({ ...prev, [data.id]: [] }));
    setZonesMap((prev) => ({ ...prev, [data.id]: [] }));
    // limpia cache para que cargue nodos/tasks creados por el wizard
    setNodesMap((prev) => {
      const next = { ...prev };
      delete next[data.id];
      return next;
    });
    setActiveProjectId(data.id);
  }, [supabase]);

  /* ── Duplicate project ──────────────────────────────────────── */
  const handleDuplicate = useCallback(async (opts: { name: string; parentProjectId: string | null }) => {
    const source = projects.find((p) => p.id === activeProjectId);
    if (!source) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const name = opts.name.trim() || `${source.name} (copia)`;
    const { data: newProj, error: projErr } = await supabase
      .from("projects")
      .insert({
        user_id: user.id,
        name,
        client: source.client,
        status: "draft",
        parent_project_id: opts.parentProjectId,
      })
      .select().single();
    if (projErr || !newProj) {
      alert("No se pudo duplicar: " + (projErr?.message ?? "error desconocido"));
      return;
    }

    // Lee el contenido REAL del proyecto origen desde la DB (no del estado local,
    // que puede estar desincronizado o sin cargar) para una copia fiel.
    const [{ data: srcNodes }, { data: srcEdges }, { data: srcZones }] = await Promise.all([
      supabase.from("funnel_nodes")
        .select("*, node_tasks(*)").eq("project_id", activeProjectId),
      supabase.from("funnel_edges").select("*").eq("project_id", activeProjectId),
      supabase.from("funnel_zones").select("*").eq("project_id", activeProjectId),
    ]);

    const idMap: Record<string, string> = {};
    for (const n of (srcNodes ?? [])) {
      const newNodeId = `node-${uid()}`;
      idMap[n.id] = newNodeId;
      await supabase.from("funnel_nodes").insert({
        id: newNodeId, project_id: newProj.id,
        title: n.title, subtitle: n.subtitle,
        icon: n.icon, role: n.role,
        owner_initials: n.owner_initials, owner_color: n.owner_color,
        assigned_to: n.assigned_to ?? null,
        position_x: n.position_x, position_y: n.position_y,
      });
      const tasks = (n.node_tasks ?? []).sort((a: any, b: any) => (a.ord ?? 0) - (b.ord ?? 0));
      for (const t of tasks) {
        // Copia fiel (sin completar), conservando prioridad/fecha/descripción/responsable
        await supabase.from("node_tasks").insert({
          id: `t-${uid()}`, node_id: newNodeId, project_id: newProj.id,
          text: t.text, done: false, ord: t.ord ?? 0,
          priority: t.priority ?? "normal",
          due_date: t.due_date ?? null,
          description: t.description ?? "",
          assigned_to: t.assigned_to ?? null,
        });
      }
    }
    for (const e of (srcEdges ?? [])) {
      await supabase.from("funnel_edges").insert({
        id: `e-${uid()}`, project_id: newProj.id,
        source: idMap[e.source] ?? e.source,
        target: idMap[e.target] ?? e.target,
        source_handle: e.source_handle ?? null,
        target_handle: e.target_handle ?? null,
        animated: e.animated ?? false,
        dashed: e.dashed ?? false,
        label: e.label ?? null,
      });
    }
    for (const z of (srcZones ?? [])) {
      await supabase.from("funnel_zones").insert({
        id: `zone-${uid()}`, project_id: newProj.id,
        label: z.label, color: z.color,
        position_x: z.position_x, position_y: z.position_y,
        width: z.width, height: z.height,
      });
    }

    setProjects((prev) => [...prev, {
      id: newProj.id, name: newProj.name,
      description:     newProj.description || "",
      client:          newProj.client,
      status:          newProj.status,
      progress:        0,
      blockedCount:    0,
      ownerId:         newProj.user_id ?? null,
      parentProjectId: newProj.parent_project_id ?? null,
      startDate:       newProj.start_date ?? null,
      endDate:         newProj.end_date   ?? null,
    }]);
    // Limpia cache para que el nuevo proyecto cargue fresco desde la DB
    // (evita ids locales desincronizados con los insertados).
    setNodesMap((prev) => { const n = { ...prev }; delete n[newProj.id]; return n; });
    setEdgesMap((prev) => { const e = { ...prev }; delete e[newProj.id]; return e; });
    setZonesMap((prev) => { const z = { ...prev }; delete z[newProj.id]; return z; });
    setActiveProjectId(newProj.id);
    setDuplicateOpen(false);
  }, [activeProjectId, projects, supabase]);

  /* ── Rename project ────────────────────────────────────────── */
  const handleRenameProject = useCallback(async (projectId: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setProjects((prev) => prev.map((p) => p.id === projectId ? { ...p, name: trimmed } : p));
    const { error } = await supabase.from("projects").update({ name: trimmed }).eq("id", projectId);
    if (error) alert("Error al renombrar: " + error.message);
  }, [supabase]);

  /* ── Delete project ────────────────────────────────────────── */
  const handleDeleteProject = useCallback(async (projectId: string) => {
    const project = projects.find((p) => p.id === projectId);
    if (!project) return;
    if (!confirm(`¿Eliminar el proyecto "${project.name}"? Esta acción no se puede deshacer.`)) return;

    const { error } = await supabase.from("projects").delete().eq("id", projectId);
    if (error) { alert("Error al eliminar: " + error.message); return; }

    setProjects((prev) => prev.filter((p) => p.id !== projectId));
    setNodesMap((prev) => { const n = { ...prev }; delete n[projectId]; return n; });
    setEdgesMap((prev) => { const e = { ...prev }; delete e[projectId]; return e; });
    setZonesMap((prev) => { const z = { ...prev }; delete z[projectId]; return z; });

    if (activeProjectId === projectId) {
      const remaining = projects.filter((p) => p.id !== projectId);
      setActiveProjectId(remaining[0]?.id ?? "");
    }
  }, [projects, activeProjectId, supabase]);

  /* ── Update own profile ─────────────────────────────────────── */
  const handleUpdateProfile = useCallback((updated: Profile) => {
    setMe(updated);
  }, []);

  /* ── Logout ─────────────────────────────────────────────────── */
  const handleLogout = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth/login";
  }, [supabase]);

  /* ── Inject callbacks + members into funnel nodes ───────────── */
  const currentMembers  = membersByProject[activeProjectId] ?? [];
  const currentStatuses = statusesByProject[activeProjectId] ?? [];
  const nodesWithCallbacks = useMemo<Node<FunnelNodeData>[]>(() => {
    const activeProj = projects.find((p) => p.id === activeProjectId);
    const myRole = getMyProjectRole(me?.id, activeProj, currentMembers);
    const canEdit = myRole === "owner" || myRole === "editor";

    return currentNodes.map((n) => ({
      ...n,
      zIndex: 1,
      data: {
        ...n.data,
        members: currentMembers,
        onMarkRead:    () => handleMarkRead(n.id),
        onSendMessage: (text: string) => handleSendMessage(n.id, text),
        onUploadFile:  (file: File)   => handleUploadFile(n.id, file),
        ...(canEdit ? {
          onTaskToggle:     (taskId: string) => handleTaskToggle(n.id, taskId),
          onDeleteTask:     (taskId: string) => handleDeleteTask(n.id, taskId),
          onAddTask:        (text: string, dueDate?: string | null, priority?: TaskPriority) => handleAddTask(n.id, text, dueDate ?? undefined, priority),
          onUpdateTask:     (taskId: string, upd: any) => handleUpdateTask(n.id, taskId, upd),
          onUpdateNodeData: (updates: any)   => handleUpdateNodeData(n.id, updates),
        } : {}),
      },
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentNodes, currentMembers, me?.id, projects, activeProjectId]);

  /* ── Inject callbacks into zones ────────────────────────────── */
  const zonesWithCallbacks = useMemo<Node<ZoneNodeData>[]>(
    () =>
      currentZones.map((z) => ({
        ...z,
        data: {
          ...z.data,
          onResize:      (w: number, h: number) => handleZoneResize(z.id, w, h),
          onLabelChange: (label: string)        => handleZoneLabelChange(z.id, label),
          onColorChange: (color: string)        => handleZoneColorChange(z.id, color),
          onDelete:      ()                     => handleZoneDelete(z.id),
        },
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentZones]
  );

  /* ── Merged node list (zones first = behind) ────────────────── */
  const allNodes = useMemo(
    () => [...zonesWithCallbacks, ...nodesWithCallbacks],
    [zonesWithCallbacks, nodesWithCallbacks]
  );

  /* ── Loading screen ─────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-icon">⚡</div>
        <span>Cargando FunnelManager…</span>
      </div>
    );
  }

  /* ── Empty state ────────────────────────────────────────────── */
  if (projects.length === 0) {
    return (
      <>
        <div className="app-loading">
          <div className="app-loading-icon">⚡</div>
          <p style={{ color: "var(--text2)", marginBottom: 16 }}>
            No tienes clientes aún. Crea el primero.
          </p>
          <button
            onClick={handleNewProject}
            style={{
              background: "var(--brand)", color: "#fff", border: "none",
              padding: "8px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13,
            }}
          >
            + Crear tu primer cliente
          </button>
        </div>
        <ProjectWizard
          open={wizardOpen}
          parentProjectId={wizardParentId}
          onClose={() => setWizardOpen(false)}
          onCreated={handleWizardCreated}
        />
      </>
    );
  }

  const activeProject = projects.find((p) => p.id === activeProjectId);

  return (
    <div className="app-shell">
      <Sidebar
        activeProjectId={activeProjectId}
        projects={projects}
        onSelectProject={setActiveProjectId}
        activeView={activeView}
        onSelectView={setActiveView}
        onNewProject={handleNewProject}
        onNewSubproject={handleNewSubproject}
        onDeleteProject={handleDeleteProject}
        onAddModule={handleAddModule}
        onAddZone={handleAddZone}
        onLogout={handleLogout}
        me={me}
        onOpenProfile={() => setProfileOpen(true)}
        isSuperAdmin={isSuperAdmin(me)}
        onOpenCopilot={() => setCopilotOpen((v) => !v)}
        copilotOpen={copilotOpen}
      />
      <Topbar
        projectId={activeProjectId}
        projects={projects}
        progress={globalProgress}
        members={currentMembers}
        onlineUsers={onlineUsers}
        onRename={handleRenameProject}
        onDuplicate={() => setDuplicateOpen(true)}
        onAddModule={handleAddModule}
        onOpenTeam={() => setTeamOpen(true)}
        unreadCount={unreadCount}
        onOpenNotifications={() => setNotifOpen(true)}
        onChangeStatus={handleChangeProjectStatus}
      />

      {/* Always rendered to preserve layout */}
      <FunnelCanvas
        nodes={allNodes}
        edges={currentEdges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onNodeDragStop={handleNodeDragStop}
        visible={activeView === "canvas"}
      />

      {/* ── Grupo Dashboard: barra de pestañas + vista activa ── */}
      {DASHBOARD_GROUP.has(activeView) && (
        <div className="dash-shell">
          <DashboardTabs
            activeView={activeView}
            onSelectView={setActiveView}
            projects={projects}
            activeProjectId={activeProjectId}
            onSelectProject={setActiveProjectId}
          />
          <div className="dash-shell-body">
            {activeView === "board" && (
              <BoardView
                project={activeProject}
                nodes={currentNodes}
                members={currentMembers}
                me={me}
                myRole={getMyProjectRole(me?.id, activeProject, currentMembers)}
                onAddTask={handleAddTask}
                onToggleTask={handleTaskToggle}
                onDeleteTask={handleDeleteTask}
                onSendMessage={handleSendMessage}
                onAddModule={handleAddModule}
                onUpdateTask={handleUpdateTask}
                onMoveTaskToNode={handleMoveTaskToNode}
                onSelectView={setActiveView}
                commentsByTask={commentsByTask}
                loadingComments={loadingComments}
                onLoadComments={handleLoadComments}
                onAddComment={handleAddComment}
                onRenameSection={(nodeId, title) => handleUpdateNodeData(nodeId, { title })}
                onSetSectionRole={(nodeId, role) => handleUpdateNodeData(nodeId, { role })}
                onDeleteModule={handleDeleteModule}
                activeProjectId={activeProjectId}
              />
            )}

            {activeView === "kanban" && (
              <KanbanView
                project={activeProject}
                nodes={currentNodes}
                statuses={currentStatuses}
                members={currentMembers}
                canEdit={
                  getMyProjectRole(me?.id, activeProject, currentMembers) === "owner" ||
                  getMyProjectRole(me?.id, activeProject, currentMembers) === "editor"
                }
                onMoveTask={handleMoveTask}
                onSelectView={setActiveView}
              />
            )}

            {activeView === "timeline" && (
              <TimelineView
                project={activeProject}
                nodes={currentNodes}
                onSelectView={setActiveView}
                onUpdateTask={(nodeId, taskId, updates) => handleUpdateTask(nodeId, taskId, updates)}
              />
            )}

            {activeView === "calendar" && (
              <CalendarView project={activeProject} nodes={currentNodes} onSelectView={setActiveView} />
            )}

            {activeView === "portfolio" && (
              <PortfolioView
                projects={projects}
                onOpenProject={(pid) => { setActiveProjectId(pid); setActiveView("board"); }}
                onSelectView={setActiveView}
              />
            )}

            {activeView === "workload" && (
              <WorkloadView onSelectView={setActiveView} projects={projects} />
            )}

            {activeView === "roles" && (
              <RolesView project={activeProject} nodes={currentNodes} members={currentMembers} onSelectView={setActiveView} />
            )}

            {activeView === "docs" && (
              <DocsView project={activeProject} nodes={currentNodes} onSelectView={setActiveView} />
            )}

            {activeView === "permisos" && (
              <PermissionsView
                project={activeProject}
                projectId={activeProjectId}
                myRole={getMyProjectRole(me?.id, activeProject, currentMembers)}
                onSelectView={setActiveView}
              />
            )}
          </div>
        </div>
      )}

      {activeView === "mytasks" && (
        <div className="view-scroll">
          <MyTasksView
            me={me}
            onOpenTaskProject={(pid) => { setActiveProjectId(pid); setActiveView("board"); }}
            onSelectView={setActiveView}
          />
        </div>
      )}

      {activeView === "tablero" && (
        <div className="view-scroll">
          <Dashboard
            project={activeProject}
            nodes={currentNodes}
            members={currentMembers}
            onSelectView={setActiveView}
          />
        </div>
      )}

      {activeView === "admin" && isSuperAdmin(me) && (
        <div className="view-scroll">
          <AdminView me={me} onSelectView={setActiveView} />
        </div>
      )}

      {teamOpen && (
        <TeamModal
          projectId={activeProjectId}
          onClose={() => {
            setTeamOpen(false);
            // Refresca la lista de miembros del proyecto para que el selector
            // de responsable vea a los recién agregados (invalida el cache).
            setMembersByProject((prev) => {
              const next = { ...prev };
              delete next[activeProjectId];
              return next;
            });
          }}
        />
      )}

      {profileOpen && me && (
        <ProfileModal
          me={me}
          onClose={() => setProfileOpen(false)}
          onUpdate={handleUpdateProfile}
        />
      )}

      <ProjectWizard
        open={wizardOpen}
        parentProjectId={wizardParentId}
        parentProjectName={
          wizardParentId
            ? projects.find((p) => p.id === wizardParentId)?.name
            : undefined
        }
        onClose={() => setWizardOpen(false)}
        onCreated={handleWizardCreated}
      />

      <NotificationsPanel
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        me={me}
      />

      {searchOpen && (
        <SearchModal
          projects={projects}
          onClose={() => setSearchOpen(false)}
          onOpenProject={(projectId, view) => {
            setActiveProjectId(projectId);
            setActiveView(view ?? "canvas");
            setSearchOpen(false);
          }}
        />
      )}

      <CopilotPanel
        open={copilotOpen}
        projectId={activeProjectId}
        projectName={activeProject?.name ?? ""}
        onClose={() => setCopilotOpen(false)}
        onActionsApplied={() => loadProjectData(activeProjectId)}
      />

      {duplicateOpen && activeProject && (
        <DuplicateModal
          source={activeProject}
          projects={projects}
          isAdmin={isSuperAdmin(me)}
          onClose={() => setDuplicateOpen(false)}
          onConfirm={handleDuplicate}
        />
      )}

      {/* Toasts de notificación (sonido + visual) */}
      {toasts.length > 0 && (
        <div className="toast-stack">
          {toasts.map((t) => (
            <div
              key={t.id}
              className="toast"
              onClick={() => { setNotifOpen(true); setToasts((prev) => prev.filter((x) => x.id !== t.id)); }}
            >
              <span className="toast-icon">🔔</span>
              <div className="toast-body">
                <div className="toast-title">{t.title}</div>
                {t.body && <div className="toast-text">{t.body}</div>}
              </div>
              <button
                className="toast-close"
                onClick={(e) => { e.stopPropagation(); setToasts((prev) => prev.filter((x) => x.id !== t.id)); }}
              >✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
