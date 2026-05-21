import type { RoleKey, ProjectStatus } from "./constants";

export type TaskAlertStatus =
  | "done"
  | "no_date"
  | "overdue"
  | "due_today"
  | "due_tomorrow"
  | "due_soon"
  | "on_track";

export type TaskPriority = "low" | "normal" | "high" | "urgent";

export interface Project {
  id: string;
  name: string;
  description: string;
  client: string;
  status: ProjectStatus;
  progress: number;
  blockedCount: number;
  ownerId?: string;
  parentProjectId?: string | null;
  startDate?: string | null;
  endDate?:   string | null;
}

export type ProjectRole = "owner" | "editor" | "viewer";

export interface TaskComment {
  id:           string;
  taskId:       string;
  userId:       string;
  userName:     string;
  userInitials: string;
  userColor:    string;
  text:         string;
  createdAt:    string;
  isMe?:        boolean;
}

export interface NodeTask {
  id: string;
  text: string;
  description?: string;
  done: boolean;
  order: number;
  dueDate?:    string | null;
  priority?:   TaskPriority;
  alertStatus?: TaskAlertStatus;
  assignedTo?: string | null;
}

export interface ChatMessage {
  id: string;
  userId: string;
  userName: string;
  userInitials: string;
  userColor: string;
  text: string;
  createdAt: string;
  isMe: boolean;
  fileUrl?:  string;
  fileType?: string;
  readBy:    string[];
}

export interface ProjectMember {
  id:        string;
  full_name: string;
  email:     string;
  color:     string;
  role:      "owner" | "editor" | "viewer";
}

export interface ProjectDoc {
  id:         string;
  projectId:  string;
  nodeId?:    string | null;
  title:      string;
  content:    string;
  fileUrl?:   string | null;
  uploadedBy?:string | null;
  createdAt:  string;
  updatedAt:  string;
}

export interface FunnelNodeData {
  title: string;
  subtitle: string;
  icon: string;
  role: RoleKey;
  ownerInitials: string;
  ownerColor: string;
  assignedTo?: string | null;
  tasks: NodeTask[];
  messages: ChatMessage[];
  hasUnread: boolean;
  onTaskToggle?:     (taskId: string) => void;
  onDeleteTask?:     (taskId: string) => void;
  onMarkRead?:       () => void;
  onSendMessage?:    (text: string) => void;
  onAddTask?:        (text: string, dueDate?: string | null, priority?: TaskPriority) => void;
  onUpdateTask?:     (taskId: string, updates: { text?: string; dueDate?: string | null; priority?: TaskPriority; description?: string }) => void;
  onUpdateNodeData?: (updates: {
    title?:          string;
    subtitle?:       string;
    icon?:           string;
    role?:           string;
    assignedTo?:     string | null;
    ownerInitials?:  string;
    ownerColor?:     string;
  }) => void;
  onUploadFile?:     (file: File) => Promise<void>;
  members?:          ProjectMember[];
}

export interface Zone {
  id: string;
  label: string;
  color: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ZoneNodeData {
  label:          string;
  color:          string;
  width:          number;
  height:         number;
  onResize?:      (w: number, h: number) => void;
  onLabelChange?: (label: string) => void;
  onColorChange?: (color: string) => void;
  onDelete?:      () => void;
}

/* ── Helpers de alertas ────────────────────────────────── */
export function computeTaskAlertStatus(task: NodeTask): TaskAlertStatus {
  if (task.done) return "done";
  if (!task.dueDate) return "no_date";

  const due = new Date(task.dueDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0)  return "overdue";
  if (diffDays === 0) return "due_today";
  if (diffDays === 1) return "due_tomorrow";
  if (diffDays <= 3)  return "due_soon";
  return "on_track";
}
