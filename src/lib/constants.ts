export const ROLE_COLORS: Record<string, string> = {
  trafficker:    "#3B82F6",
  estratega:     "#10B981",
  ghl:           "#7C3AED",
  integraciones: "#6366F1",
  ventas:        "#E24B4A",
  pm:            "#F59E0B",
  experto:       "#8B5CF6",
};

export const ROLE_LABELS: Record<string, string> = {
  trafficker:    "Trafficker Digital",
  estratega:     "Estratega / Copy",
  ghl:           "GHL Builder",
  integraciones: "Integraciones",
  ventas:        "Líder de Ventas",
  pm:            "Project Manager",
  experto:       "Experto / CEO",
};

export const PROJECT_STATUSES = {
  draft:     { label: "Borrador",  color: "#F59E0B" },
  active:    { label: "En curso",  color: "#10B981" },
  completed: { label: "Completo",  color: "#6366F1" },
} as const;

export type ProjectStatus = keyof typeof PROJECT_STATUSES;
export type RoleKey = keyof typeof ROLE_COLORS;

/* ── Colores de alerta para tareas con fechas ─────────── */
export const ALERT_COLORS = {
  done:         { bg: "#10B98115", fg: "#10B981", label: "Completada"   },
  no_date:      { bg: "transparent", fg: "var(--text2)", label: "Sin fecha" },
  on_track:     { bg: "#3B82F615", fg: "#3B82F6", label: "En plazo"     },
  due_soon:     { bg: "#F59E0B15", fg: "#F59E0B", label: "Pronto vence" },
  due_tomorrow: { bg: "#F9731615", fg: "#F97316", label: "Vence mañana" },
  due_today:    { bg: "#E24B4A15", fg: "#E24B4A", label: "Vence HOY"    },
  overdue:      { bg: "#DC262615", fg: "#DC2626", label: "Vencida"      },
} as const;

export const PRIORITY_COLORS = {
  low:    { bg: "#9CA3AF15", fg: "#6B7280", label: "Baja"     },
  normal: { bg: "#6366F115", fg: "#6366F1", label: "Normal"   },
  high:   { bg: "#F59E0B15", fg: "#F59E0B", label: "Alta"     },
  urgent: { bg: "#DC262615", fg: "#DC2626", label: "Urgente"  },
} as const;

export const PLATFORM_ROLE_LABELS = {
  super_admin: "Super Admin",
  admin:       "Administrador",
  user:        "Usuario",
} as const;

/* ── Task suggestions per role (auto-completar tareas comunes) ─ */
export const TASK_SUGGESTIONS: Record<string, string[]> = {
  trafficker: [
    "Configurar campaña Meta Ads",
    "Configurar campaña Google Ads",
    "Armar públicos lookalike",
    "Instalar pixel + eventos",
    "Crear creatividades para anuncios",
    "Definir presupuesto diario",
    "Configurar UTMs",
    "Análisis de KPIs (CTR, CPL, CPM)",
    "A/B testing de anuncios",
    "Optimizar segmentación",
  ],
  estratega: [
    "Definir avatar / buyer persona",
    "Escribir copy de anuncios",
    "Diseñar embudo (mapa)",
    "Redactar email follow-up",
    "Guion de webinar / VSL",
    "Hooks y ganchos",
    "Estrategia de oferta",
    "Copy para landing page",
    "Asuntos de email",
    "Mensajes de WhatsApp",
  ],
  ghl: [
    "Configurar pipeline GHL",
    "Diseñar landing page",
    "Configurar formulario de registro",
    "Configurar dominio personalizado",
    "Configurar email transaccional",
    "Setup de calendario",
    "Configurar workflow de automatización",
    "Crear secuencia de emails",
    "Configurar SMS automáticos",
    "Setup de membresía",
  ],
  integraciones: [
    "Conectar Zapier / Make",
    "Configurar webhook",
    "Conectar pasarela de pago (Stripe / MP)",
    "Sincronizar CRM",
    "Configurar SMS / WhatsApp API",
    "Conectar Meta Conversions API",
    "Integrar Google Analytics",
    "Conectar Calendly / Booking",
    "API de facturación",
  ],
  ventas: [
    "Llamar a leads calificados",
    "Configurar pipeline de ventas",
    "Script de cierre",
    "Seguimiento post-venta",
    "Reporte de conversiones",
    "Capacitar al equipo de closers",
    "Definir objeciones frecuentes",
    "Setup de CRM de ventas",
  ],
  pm: [
    "Reunión de kickoff",
    "Asignar tareas al equipo",
    "Revisión semanal de avances",
    "Documentar entregables",
    "Reporte al cliente",
    "Coordinar fechas de lanzamiento",
    "Validar dependencias entre roles",
    "Gestión de bloqueos",
  ],
  experto: [
    "Grabar webinar / VSL",
    "Definir oferta y precio",
    "Validar copy y mensajes",
    "Aprobar landing final",
    "Revisar embudo completo",
    "Grabar testimonios",
    "Estrategia de bonos",
    "Definir garantía",
  ],
};
