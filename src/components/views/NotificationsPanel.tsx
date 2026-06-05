"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Profile } from "@/lib/profiles";

interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  created_at: string;
}

interface NotificationsPanelProps {
  open: boolean;
  onClose: () => void;
  me: Profile | null;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "Hace un momento";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `Hace ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Hace ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `Hace ${days}d`;
}

function typeEmoji(type: string): string {
  const map: Record<string, string> = {
    mention: "💬",
    assignment: "👤",
    due: "📅",
    comment: "💬",
    status: "📋",
  };
  return map[type] ?? "🔔";
}

export function NotificationsPanel({ open, onClose, me }: NotificationsPanelProps) {
  const supabase = createClient();
  const [notifs,   setNotifs]   = useState<Notification[]>([]);
  const [loading,  setLoading]  = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  /* Load + subscribe when panel opens or me changes */
  useEffect(() => {
    if (!open || !me) return;

    let cancelled = false;
    setLoading(true);

    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", me.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (cancelled) return;
        setNotifs((data ?? []) as Notification[]);
        setLoading(false);
      });

    // Realtime subscription
    const ch = supabase
      .channel(`notif:${me.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${me.id}` },
        (payload) => {
          if (cancelled) return;
          if (payload.eventType === "INSERT") {
            setNotifs((prev) => [payload.new as Notification, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setNotifs((prev) =>
              prev.map((n) => (n.id === (payload.new as Notification).id ? (payload.new as Notification) : n))
            );
          } else if (payload.eventType === "DELETE") {
            setNotifs((prev) => prev.filter((n) => n.id !== (payload.old as { id: string }).id));
          }
        }
      )
      .subscribe();
    channelRef.current = ch;

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
      channelRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, me?.id]);

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    setNotifs((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const markAllRead = async () => {
    if (!me) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", me.id).eq("read", false);
    setNotifs((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  if (!open) return null;

  const unreadCount = notifs.filter((n) => !n.read).length;

  return (
    <div className="notif-panel">
      <div className="notif-header">
        <span style={{ fontWeight: 600, fontSize: 14 }}>Notificaciones {unreadCount > 0 && `(${unreadCount})`}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {unreadCount > 0 && (
            <button
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--brand)" }}
              onClick={markAllRead}
            >
              Marcar todo como leído
            </button>
          )}
          <button
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, color: "var(--text2)" }}
            onClick={onClose}
            title="Cerrar"
          >
            ✕
          </button>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: "auto" }}>
        {loading ? (
          <div style={{ padding: "24px 16px", textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
            Cargando…
          </div>
        ) : notifs.length === 0 ? (
          <div style={{ padding: "40px 16px", textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
            No tienes notificaciones.
          </div>
        ) : (
          notifs.map((n) => (
            <div
              key={n.id}
              className={`notif-item${n.read ? "" : " unread"}`}
              onClick={() => { if (!n.read) markRead(n.id); }}
              style={{ cursor: n.read ? "default" : "pointer" }}
            >
              <div style={{ fontSize: 18, flexShrink: 0 }}>{typeEmoji(n.type)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: n.read ? 400 : 600, fontSize: 13, color: "var(--text)" }}>
                  {n.title}
                </div>
                {n.body && (
                  <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {n.body}
                  </div>
                )}
                <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 3 }}>
                  {relativeTime(n.created_at)}
                </div>
              </div>
              {!n.read && <div className="notif-dot" />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
