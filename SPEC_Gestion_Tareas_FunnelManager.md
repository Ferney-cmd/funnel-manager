# 📋 SPEC — Módulo de Gestión de Tareas (FunnelManager)
### Prompt y plan de trabajo para Claude Code

> **Cómo usar este archivo:** pégalo en Claude Code como contexto base. Está dividido en
> (1) contexto del proyecto, (2) investigación de Asana y Notion, (3) decisiones de diseño,
> (4) modelo de datos, (5) vistas a construir, (6) capacidades de IA y (7) un plan de tareas
> por fases. Empieza pidiéndole a Claude Code que ejecute **Fase 1** y avanza fase por fase.

---

## 1. Contexto del proyecto

FunnelManager es un gestor de proyectos donde el modelo de datos es:

```
Proyecto → (Sub-proyecto) → Módulos → Secciones/Tareas
```

Particularidad del producto: **un Módulo es a la vez un nodo del embudo (canvas) y una sección
de tareas.** En la vista "Embudo" los módulos se ven como tarjetas conectadas; en la vista de
lista los mismos módulos aparecen como secciones agrupando tareas.

### Estado actual (lo que YA funciona)
- **Vista Embudo / Canvas:** módulos como nodos conectados, con conectores, zonas y condicionales. (avanzado)
- **Vista Lista:** secciones (= módulos) con columnas Nombre, Responsable, Fecha límite, Prioridad, Estado.
- **Panel de detalle de tarea:** estado, responsable, fecha límite, prioridad, descripción, comentarios.
- **Roles por módulo:** ej. "GHL Builder", "Project Manager".
- **Resumen / Tablero del jefe:** % completado, "atención requerida" (módulos sin avance / sin responsable / sin tareas), avance por rol, carga del equipo, estado por módulo.
- **Copilot por módulo:** chat de IA dentro de cada tarjeta + botón "+ IA" para generar tareas.
- Vistas auxiliares: Dashboard, Roles, Docs, Permisos, Admin.

### Objetivo de este trabajo
Profundizar **la pestaña de asignación, visualización y administración de tareas** para que un
**equipo grande** pueda trabajar sobre **múltiples proyectos** con todo bajo control, y dotarla
de **superpoderes de IA**. La pestaña de Embudo ya está madura; el foco NO es el canvas, es la
gestión de tareas.

### Stack asumido (ajústalo si difiere)
- Frontend: **React / Next.js + TypeScript + Tailwind** (UI oscura ya existente).
- Backend/DB: **Supabase (Postgres + Auth + Realtime + Storage)**.
- IA: API de Anthropic (Claude) para el copilot y generación.
- Automatización opcional: **n8n** (ya conectado) para webhooks/recordatorios.

> ⚠️ Si tu stack real es distinto, indícalo a Claude Code al inicio para que adapte el SQL y los componentes.

---

## 2. Investigación — qué hace bien ASANA (y qué copiar)

Asana es el referente en **flujo de trabajo de equipos** sobre tareas. Patrones clave a replicar:

### 2.1 Modelo de tarea rico
- Una tarea tiene: **título, responsable(s), fecha de inicio + fecha límite, prioridad, estado, sección, proyecto(s), etiquetas, descripción, subtareas, dependencias, adjuntos, seguidores (followers), comentarios con @menciones.**
- **Multi-homing:** una misma tarea puede vivir en varios proyectos a la vez (no duplicada).
- **Subtareas** con sus propios responsables y fechas.
- **Dependencias:** "esta tarea está bloqueada por / bloquea a" otra.
- **Hitos (milestones):** tareas especiales que marcan un punto de control.

### 2.2 Múltiples vistas del MISMO conjunto de datos
Este es el corazón de Asana. Los mismos datos se ven como:
- **Lista** (la que ya tienes) — con agrupar, ordenar, filtrar.
- **Tablero / Kanban** — columnas por estado (o por cualquier campo), arrastrar y soltar.
- **Cronograma / Timeline (Gantt)** — barras en el tiempo, dependencias visibles.
- **Calendario** — tareas por fecha límite.
- **Dashboard** — gráficos y métricas (ya tienes el Resumen).

### 2.3 "Mis Tareas" (My Tasks)
Vista personal que **agrega las tareas asignadas a mí a través de TODOS los proyectos**, con
secciones tipo "Hoy / Próximas / Más tarde". Es lo que hace que un equipo grande no se pierda.
**→ Esto es crítico y tu app aún no lo tiene.**

### 2.4 Carga de trabajo (Workload)
Vista de **capacidad del equipo**: cuántas tareas/esfuerzo tiene cada persona en un rango de
fechas, para detectar sobrecarga. Tú ya tienes un esbozo en "Carga del equipo".

### 2.5 Bandeja de entrada / notificaciones
Inbox por usuario: cambios, @menciones, asignaciones, vencimientos. Idealmente en tiempo real.

### 2.6 Reglas y automatización (Rules)
"Cuando X pase → haz Y." Ej: al mover a "En revisión" → asignar al QA y notificar.

### 2.7 Formularios de intake
Un formulario público/interno crea tareas automáticamente en un proyecto. Útil para solicitudes.

### 2.8 Portafolios
Vista de **alto nivel de varios proyectos** a la vez con su estado de salud. Esto encaja con tu
necesidad de "distintos proyectos".

---

## 3. Investigación — qué hace bien NOTION (y qué copiar)

Notion aporta **flexibilidad** sobre la estructura de datos. Patrones clave:

### 3.1 Propiedades configurables (custom fields)
Todo es una "base de datos" donde el usuario define columnas con tipos:
`texto, número, select, multi-select, fecha, persona, checkbox, URL, archivo, fórmula, relación, rollup, estado`.
**→ Permitir campos personalizados por proyecto te da una flexibilidad enorme.**

### 3.2 Relaciones + Rollups
- **Relación:** conectar registros entre bases (ej. Tareas ↔ Proyectos, Tareas ↔ Clientes).
- **Rollup:** agregar datos de los relacionados (ej. "% completado del proyecto" = promedio del estado de sus tareas). Tu "Resumen" es básicamente rollups.

### 3.3 Vistas guardadas con filtros/orden/agrupación
Cada vista guarda su propia configuración de **filtro + orden + agrupación + propiedades visibles**.
Ej: "Mis tareas urgentes esta semana", "Tareas sin responsable", "Backlog GHL Builder".

### 3.4 Bases de datos enlazadas (linked databases)
Mostrar el mismo conjunto de tareas en varios lugares con filtros distintos.

### 3.5 Plantillas
- **Plantillas de página/tarea:** crear tareas pre-rellenadas.
- **Plantillas de proyecto/módulo:** clonar una estructura completa (tú ya tienes "Duplicar").

### 3.6 Notion AI
- Autorrellenar propiedades con IA (ej. resumir, traducir, categorizar).
- Generar contenido en la descripción.
- Resumir páginas/proyectos.
**→ Esto conecta directo con tus "superpoderes IA".**

---

## 4. Decisiones de diseño para FunnelManager

Combinando ambos, estas son las decisiones recomendadas:

1. **Una sola fuente de datos de tareas, muchas vistas.** Construir Lista, Kanban, Timeline,
   Calendario, "Mis Tareas" y Carga del equipo, todas leyendo la misma tabla `tasks`.
2. **Multi-responsable.** Pasar de un único `responsable` a varios asignados (tabla puente),
   mostrando avatares apilados.
3. **Estados personalizables por proyecto** (no fijos). Cada estado tiene nombre, color y
   categoría (`todo` / `in_progress` / `done`) para que los rollups sigan funcionando.
4. **Campos personalizados** estilo Notion, opcionales por proyecto.
5. **Subtareas y dependencias** estilo Asana.
6. **Vistas guardadas** con filtro/orden/agrupación reutilizables.
7. **Vista multi-proyecto / portafolio** para el equipo grande.
8. **IA como capa transversal**, no solo chat: crear, asignar, priorizar, resumir, detectar riesgos.
9. **Tiempo real** (Supabase Realtime) para que el equipo vea cambios al instante.
10. **Permisos por rol** reutilizando tu sistema de Roles/Permisos existente.

---

## 5. Modelo de datos propuesto (Supabase / Postgres)

> Ajusta nombres a tu esquema actual. Lo importante es la estructura. Usa RLS (Row Level Security).

```sql
-- Equipo / usuarios (probablemente ya existe vía auth.users)
profiles (id uuid pk, full_name, avatar_url, email, default_role_id)

-- Proyectos y sub-proyectos (probablemente ya existen)
projects (id pk, name, parent_project_id null, status, created_by, created_at)

-- Roles (ya existe): GHL Builder, Project Manager, etc.
roles (id pk, project_id, name, color)

-- Módulos = nodos del embudo y secciones de tareas (ya existe)
modules (
  id pk, project_id, name, role_id null, position int,
  canvas_x float, canvas_y float,        -- coords del embudo
  type text default 'module',             -- module | zone | conditional
  created_at
)

-- Estados personalizables por proyecto (NUEVO)
task_statuses (
  id pk, project_id, name, color,
  category text check (category in ('todo','in_progress','done')),
  position int
)

-- Tareas (ampliar la actual)
tasks (
  id pk,
  project_id,
  module_id null,            -- la "sección"
  parent_task_id null,       -- para subtareas
  title text not null,
  description text,
  status_id references task_statuses,
  priority text check (priority in ('low','normal','high','urgent')) default 'normal',
  start_date date null,
  due_date date null,
  is_milestone boolean default false,
  position int,              -- orden manual dentro de la sección/columna
  completed_at timestamptz null,
  created_by, created_at, updated_at
)

-- Multi-responsable (NUEVO, reemplaza responsable único)
task_assignees (task_id, user_id, primary key (task_id, user_id))

-- Seguidores / followers (NUEVO)
task_followers (task_id, user_id, primary key (task_id, user_id))

-- Dependencias (NUEVO)
task_dependencies (
  id pk, task_id, depends_on_task_id,
  type text default 'blocks'   -- blocks | blocked_by
)

-- Etiquetas (NUEVO)
tags (id pk, project_id, name, color)
task_tags (task_id, tag_id, primary key (task_id, tag_id))

-- Campos personalizados estilo Notion (NUEVO)
custom_fields (
  id pk, project_id, name,
  type text,   -- text | number | select | multi_select | date | checkbox | url | person
  options jsonb null,   -- para select/multi_select
  position int
)
custom_field_values (task_id, field_id, value jsonb, primary key (task_id, field_id))

-- Comentarios (ya existe, asegurar @menciones)
comments (id pk, task_id, author_id, body text, mentions uuid[], created_at)

-- Adjuntos (NUEVO si no existe)
attachments (id pk, task_id, file_url, file_name, mime_type, size, uploaded_by, created_at)

-- Vistas guardadas estilo Notion/Asana (NUEVO)
saved_views (
  id pk, project_id null, owner_id,
  name, type text,            -- list | board | timeline | calendar
  scope text default 'project', -- project | my_tasks | portfolio
  config jsonb,               -- { filters, sort, group_by, visible_fields }
  is_shared boolean default false
)

-- Notificaciones / inbox (NUEVO)
notifications (
  id pk, user_id, type, task_id null, project_id null,
  payload jsonb, read boolean default false, created_at
)

-- Reglas de automatización (NUEVO, opcional)
automations (
  id pk, project_id, name, is_active boolean default true,
  trigger jsonb,   -- { when: 'status_changed', to: 'in_review' }
  actions jsonb    -- [{ assign_to:..., notify:..., set_field:... }]
)

-- Log de actividad (NUEVO, alimenta el inbox y la IA)
activity_log (id pk, task_id null, project_id, actor_id, action, meta jsonb, created_at)
```

**Índices clave:** `tasks(project_id)`, `tasks(due_date)`, `tasks(status_id)`,
`task_assignees(user_id)` (vital para "Mis Tareas").

---

## 6. Vistas a construir

| Vista | Origen | Descripción |
|---|---|---|
| **Lista** | Asana/Notion | Mejorar la existente: agrupar por módulo/estado/responsable, ordenar, filtros, multi-responsable con avatares, edición inline, selección múltiple para acciones masivas. |
| **Tablero / Kanban** | Asana | Columnas por estado (o por cualquier campo). Drag & drop entre columnas actualiza el estado. WIP count por columna. |
| **Cronograma / Timeline** | Asana | Barras en el tiempo según start_date/due_date. Mostrar dependencias y hitos. Arrastrar para cambiar fechas. |
| **Calendario** | Asana/Notion | Tareas posicionadas por due_date. Arrastrar a otro día cambia la fecha. |
| **Mis Tareas** | Asana | **Multi-proyecto.** Todas las tareas asignadas al usuario, agrupadas en "Hoy / Esta semana / Próximas / Sin fecha / Atrasadas". |
| **Carga del equipo** | Asana | Por persona en un rango: nº de tareas / esfuerzo, marcando sobrecarga. Mejorar tu "Carga del equipo". |
| **Portafolio** | Asana/Notion | Tabla de varios proyectos con salud, % avance, responsables, próximos vencimientos. |
| **Resumen** | (ya existe) | Mantener, alimentar con los nuevos rollups. |

Cada vista debe respetar las **vistas guardadas** (filtros/orden/agrupación) y permitir
crear/guardar nuevas.

---

## 7. Superpoderes de IA (la capa transversal)

Aprovecha que ya tienes Copilot por módulo. Funcionalidades a implementar, de mayor a menor impacto:

1. **Crear tareas en lenguaje natural.** "Crea 5 tareas para lanzar el embudo de captación,
   asigna las técnicas a un GHL Builder y ponles vencimiento la próxima semana" → genera tareas
   estructuradas (título, responsable sugerido, fecha, prioridad) en el módulo correcto.
   *(Ya tienes el botón "+ IA"; conviértelo en esto.)*
2. **Auto-asignación inteligente.** Sugerir responsable según rol del módulo + carga actual del
   equipo + historial. Botón "Asignar con IA".
3. **Priorización y detección de riesgos.** La IA marca tareas en riesgo (sin responsable,
   vencidas, bloqueadas por dependencias) y propone re-priorizar. Alimenta "Atención requerida".
4. **Resumen de estado / generador de standup.** "Resume el proyecto 123 para la reunión" →
   párrafo con avance, bloqueos, próximos hitos. Usar `activity_log` como contexto.
5. **Chat con el proyecto (RAG).** Preguntar "¿qué falta para cerrar el módulo de onboarding?"
   y que responda leyendo tareas/comentarios. Extiende tu "Chat del módulo" a nivel proyecto.
6. **Autorrellenar campos.** Generar descripción, sugerir etiquetas, estimar duración, categorizar.
7. **Desglose de tareas grandes.** Dada una tarea, generar subtareas automáticamente.
8. **Resumen semanal automático.** Vía n8n: cada lunes, digest por usuario/proyecto.

> **Implementación:** una sola "AI tool layer" en el backend con funciones tipadas
> (`create_tasks`, `assign_task`, `summarize_project`, `breakdown_task`, `query_project`) que el
> modelo puede invocar (tool use). Centraliza prompts y permisos ahí.

---

## 8. Plan de trabajo por FASES (para Claude Code)

> Pídele a Claude Code ejecutar una fase a la vez. Cada fase deja la app funcional.

### FASE 1 — Cimientos de datos (backend)
- [ ] Migrar `tasks`: añadir `start_date`, `is_milestone`, `parent_task_id`, `position`, `status_id`.
- [ ] Crear `task_statuses` y semilla por proyecto (Pendiente / En progreso / En revisión / Hecho).
- [ ] Crear `task_assignees` y migrar el responsable único actual a esta tabla.
- [ ] Crear `task_followers`, `task_dependencies`, `tags`, `task_tags`.
- [ ] Crear `activity_log` + triggers para registrar cambios de tarea.
- [ ] Definir/ajustar **RLS** según roles y permisos existentes.
- [ ] Activar **Supabase Realtime** en `tasks`, `comments`, `notifications`.
- **Aceptación:** la vista Lista actual sigue funcionando leyendo el nuevo esquema.

### FASE 2 — Mejorar la vista Lista
- [ ] Multi-responsable con avatares apilados + selector de varias personas.
- [ ] Estados personalizables (chip de color editable) en lugar de estados fijos.
- [ ] Edición inline (clic en celda: fecha, prioridad, estado, responsable).
- [ ] Agrupar por (módulo / estado / responsable / prioridad), ordenar y filtrar.
- [ ] Selección múltiple + acciones masivas (asignar, cambiar estado, mover, borrar).
- [ ] Subtareas anidadas (expandir/colapsar).
- **Aceptación:** un usuario puede gestionar 50+ tareas sin abrir el panel de detalle.

### FASE 3 — Vista Tablero / Kanban
- [ ] Columnas por estado, drag & drop que actualiza `status_id`.
- [ ] Tarjeta con título, avatares, prioridad, fecha, nº subtareas, etiquetas.
- [ ] Conteo y límite WIP opcional por columna.
- [ ] Agrupar el tablero por otro campo (responsable, prioridad).
- **Aceptación:** mover una tarjeta cambia su estado y se refleja en tiempo real para el equipo.

### FASE 4 — Mis Tareas (multi-proyecto) + Notificaciones
- [ ] Vista "Mis Tareas" agregando todas las tareas asignadas al usuario en todos los proyectos.
- [ ] Secciones automáticas: Atrasadas / Hoy / Esta semana / Próximas / Sin fecha.
- [ ] Inbox de `notifications` (asignaciones, @menciones, vencimientos) en tiempo real.
- **Aceptación:** un miembro nuevo ve de inmediato todo lo que le toca sin entrar a cada proyecto.

### FASE 5 — Timeline + Calendario + Dependencias
- [ ] Vista Calendario por `due_date` con drag para reprogramar.
- [ ] Vista Timeline/Gantt con barras, hitos y líneas de dependencia.
- [ ] UI para crear dependencias (bloquea / bloqueado por) y avisar cuando una bloquea.
- **Aceptación:** se ven los cuellos de botella temporales del proyecto.

### FASE 6 — Vistas guardadas + Campos personalizados + Portafolio
- [ ] `saved_views`: guardar y compartir configuraciones de filtro/orden/agrupación.
- [ ] `custom_fields` por proyecto + render en todas las vistas.
- [ ] Vista Portafolio multi-proyecto (salud, % avance, próximos vencimientos).
- [ ] Mejorar "Carga del equipo" con rango de fechas y detección de sobrecarga.
- **Aceptación:** un líder ve el estado de todos los proyectos en una pantalla.

### FASE 7 — Capa de IA
- [ ] Backend: "AI tool layer" con funciones tipadas (`create_tasks`, `assign_task`,
      `summarize_project`, `breakdown_task`, `query_project`).
- [ ] Convertir "+ IA" en creación de tareas por lenguaje natural.
- [ ] Botón "Asignar con IA" basado en rol + carga.
- [ ] Generador de resumen/standup y detección de riesgos en el Resumen.
- [ ] Chat con el proyecto (RAG sobre tareas/comentarios).
- **Aceptación:** describir un objetivo en texto genera y asigna tareas correctas.

### FASE 8 — Automatización (opcional)
- [ ] `automations` con disparadores/acciones simples.
- [ ] Integración con n8n para recordatorios y digest semanal.

---

## 9. Criterios de aceptación globales
- Todas las vistas leen **la misma** tabla `tasks` (una fuente, muchas vistas).
- Cambios visibles en **tiempo real** entre miembros del equipo.
- Funciona con **varios proyectos** y **equipos grandes** sin degradar (paginar/virtualizar listas largas).
- Respeta **roles y permisos** existentes.
- La IA nunca crea/asigna sin que el usuario lo confirme (acción → previsualización → aplicar).

---

## 10. Preguntas abiertas (responde para afinar el SPEC)
1. ¿Stack real? (¿Next.js? ¿librería de UI/estado? ¿drag&drop como dnd-kit?)
2. ¿Esquema actual exacto de `tasks` y de la tabla de usuarios/equipo? (para escribir migraciones reales y no genéricas)
3. ¿"Estado" actual (Pendiente / En plazo) es fijo en código o ya configurable?
4. ¿Quieres que las subtareas y dependencias entren ya en MVP o las dejamos para después?
5. ¿La IA usa Claude vía tu backend? ¿hay límite de presupuesto/tokens a respetar?
6. ¿n8n debe ser parte del MVP o fase posterior?

---

### Instrucción inicial sugerida para Claude Code
> "Lee este SPEC completo. Vamos a trabajar el módulo de gestión de tareas de FunnelManager.
> Empieza por la **FASE 1**: revisa mi esquema actual de Supabase, propón las migraciones SQL
> concretas (no genéricas) y los cambios mínimos en el frontend para que la vista Lista siga
> funcionando. No avances a la Fase 2 hasta que yo confirme. Antes de escribir código, hazme
> las preguntas de la sección 10 que necesites."
