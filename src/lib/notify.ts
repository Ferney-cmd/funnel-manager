"use client";

/* Sonido corto de aviso (Web Audio API, sin archivo de audio). */
export function playChime() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g);
    g.connect(ctx.destination);
    o.type = "sine";
    o.frequency.setValueAtTime(880, ctx.currentTime);
    o.frequency.setValueAtTime(1320, ctx.currentTime + 0.12);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
    o.start();
    o.stop(ctx.currentTime + 0.45);
    setTimeout(() => { ctx.close().catch(() => {}); }, 700);
  } catch { /* audio no disponible */ }
}

/* Pide permiso de notificaciones del sistema (una sola vez). */
export function ensureNotificationPermission() {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }
  } catch { /* ignore */ }
}

/* Notificación del sistema operativo (solo si hay permiso). */
export function showBrowserNotification(title: string, body: string) {
  try {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const n = new Notification(title, {
      body,
      icon: "/favicon.ico",
      tag: "funnelmanager",
    });
    n.onclick = () => { window.focus(); n.close(); };
    setTimeout(() => n.close(), 9000);
  } catch { /* ignore */ }
}
