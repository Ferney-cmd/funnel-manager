import type { Project, FunnelNodeData } from "./types";
import type { Node, Edge } from "reactflow";

export const DEMO_PROJECTS: Project[] = [
  { id: "closers",  name: "Closers Digitales",  description: "", client: "Luis Romero",   status: "active", progress: 42, blockedCount: 1 },
  { id: "viralidad",name: "Reto Viralidad",     description: "", client: "Victor Heras",  status: "active", progress: 67, blockedCount: 0 },
  { id: "skool-q2", name: "Skool Q2",           description: "", client: "—",             status: "draft",  progress: 0,  blockedCount: 0 },
];

export const DEMO_NODES: Node<FunnelNodeData>[] = [
  {
    id: "trafico",
    type: "funnelNode",
    position: { x: 60, y: 160 },
    data: {
      title: "Tráfico",
      subtitle: "Meta Ads · Google Ads",
      icon: "📣",
      role: "trafficker",
      ownerInitials: "TA",
      ownerColor: "#3B82F6",
      hasUnread: false,
      tasks: [
        { id: "t1", text: "Configurar campaña Meta Ads",  done: true,  order: 0 },
        { id: "t2", text: "Instalar píxel en landing",    done: true,  order: 1 },
        { id: "t3", text: "Definir públicos objetivo",    done: false, order: 2 },
        { id: "t4", text: "Crear UTMs por fuente",        done: false, order: 3 },
      ],
      messages: [
        { id: "m1", userId: "ta", userName: "Trafficker", userInitials: "TA", userColor: "#3B82F6", text: "El píxel no está disparando en mobile.", createdAt: "2025-05-01T09:12:00Z", isMe: false, readBy: [] },
        { id: "m2", userId: "fv", userName: "Ferney",     userInitials: "FV", userColor: "#7C3AED", text: "Revisando el script UTM ahora mismo.", createdAt: "2025-05-01T09:35:00Z", isMe: true,  readBy: ["fv"] },
      ],
    },
  },
  {
    id: "landing",
    type: "funnelNode",
    position: { x: 280, y: 160 },
    data: {
      title: "Landing Page",
      subtitle: "GHL Builder",
      icon: "🏠",
      role: "ghl",
      ownerInitials: "FV",
      ownerColor: "#7C3AED",
      hasUnread: true,
      tasks: [
        { id: "t5", text: "Diseñar estructura de la landing",  done: true,  order: 0 },
        { id: "t6", text: "Escribir headline y copy principal", done: true,  order: 1 },
        { id: "t7", text: "Configurar formulario de registro", done: false, order: 2 },
        { id: "t8", text: "Test en móvil y tablet",            done: false, order: 3 },
        { id: "t9", text: "Activar dominio personalizado",     done: false, order: 4 },
      ],
      messages: [
        { id: "m3", userId: "es", userName: "Estratega", userInitials: "ES", userColor: "#10B981", text: "El headline necesita más urgencia.", createdAt: "2025-05-01T10:00:00Z", isMe: false, readBy: [] },
      ],
    },
  },
  {
    id: "survey",
    type: "funnelNode",
    position: { x: 500, y: 160 },
    data: {
      title: "Survey",
      subtitle: "GHL Builder",
      icon: "📋",
      role: "ghl",
      ownerInitials: "FV",
      ownerColor: "#7C3AED",
      hasUnread: false,
      tasks: [
        { id: "t10", text: "Crear formulario de calificación", done: true,  order: 0 },
        { id: "t11", text: "Configurar lógica condicional",    done: false, order: 1 },
        { id: "t12", text: "Conectar con pipeline de GHL",     done: false, order: 2 },
      ],
      messages: [],
    },
  },
  {
    id: "webinar",
    type: "funnelNode",
    position: { x: 720, y: 160 },
    data: {
      title: "Webinar",
      subtitle: "Estratega / Copy",
      icon: "🎥",
      role: "estratega",
      ownerInitials: "LR",
      ownerColor: "#10B981",
      hasUnread: false,
      tasks: [
        { id: "t13", text: "Definir estructura del webinar",   done: true,  order: 0 },
        { id: "t14", text: "Guion del webinar (borrador)",     done: false, order: 1 },
        { id: "t15", text: "Aprobación de copy por el experto",done: false, order: 2 },
      ],
      messages: [],
    },
  },
  {
    id: "pipeline",
    type: "funnelNode",
    position: { x: 940, y: 160 },
    data: {
      title: "Pipeline Ventas",
      subtitle: "Líder de Ventas",
      icon: "💰",
      role: "ventas",
      ownerInitials: "GH",
      ownerColor: "#E24B4A",
      hasUnread: false,
      tasks: [
        { id: "t16", text: "Configurar pipeline en GHL",       done: false, order: 0 },
        { id: "t17", text: "Script de cierre para closers",    done: false, order: 1 },
        { id: "t18", text: "Seguimiento D+1",                  done: false, order: 2 },
      ],
      messages: [],
    },
  },
  {
    id: "onboarding",
    type: "funnelNode",
    position: { x: 1160, y: 160 },
    data: {
      title: "Onboarding",
      subtitle: "Integraciones",
      icon: "🚀",
      role: "integraciones",
      ownerInitials: "IN",
      ownerColor: "#6366F1",
      hasUnread: false,
      tasks: [
        { id: "t19", text: "Automatización bienvenida Make.com", done: false, order: 0 },
        { id: "t20", text: "Webhook confirmación de pago",       done: false, order: 1 },
        { id: "t21", text: "Acceso a Skool / comunidad",         done: false, order: 2 },
      ],
      messages: [],
    },
  },
];

export const DEMO_EDGES: Edge[] = [
  { id: "e1", source: "trafico",  target: "landing",    type: "funnelEdge", style: { strokeDasharray: undefined } },
  { id: "e2", source: "landing",  target: "survey",     type: "funnelEdge", data: { dashed: true } },
  { id: "e3", source: "survey",   target: "webinar",    type: "funnelEdge", data: { dashed: true, label: "si" } },
  { id: "e4", source: "webinar",  target: "pipeline",   type: "funnelEdge" },
  { id: "e5", source: "pipeline", target: "onboarding", type: "funnelEdge" },
];
