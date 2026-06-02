# 🗺️ ROADMAP MAESTRO — Módulo de Tareas (FunnelManager)
### Documento único y ordenado para Claude Code

> **Qué es esto:** el plan único que une los otros dos documentos en UN solo camino ordenado.
> - `ARQUITECTURA_Tareas_FunnelManager.md` → el **cómo** (fundaciones que evitan bugs).
> - `SPEC_Gestion_Tareas_FunnelManager.md` → el **qué** (features estilo Asana + Notion).
> - **Este archivo** → el **orden** correcto para construirlos sin romper nada, con tus prioridades.
>
> **Regla central:** primero las fundaciones de arquitectura, luego el tema, y solo entonces las
> vistas de features en tu orden: **Mis Tareas → Kanban → Timeline**. Construir una vista nueva
> sobre fundaciones rotas = heredar los bugs de desincronización en esa vista.
>
> **Cómo usarlo:** pégalo en Claude Code. Pídele ejecutar **una fase a la vez** y no avanzar
> hasta que tú confirmes. Que NUNCA viole los Principios no negociables (sección 2).

---

## 1. Mapa del roadmap de un vistazo

| # | Fase | Tipo | Por qué va aquí |
|---|---|---|---|
| 0 | **Diagnóstico** | Análisis | Entender el código antes de tocarlo |
| 1 | **Cimientos de datos** | Fundación | `project_id`, estados, fechas, invitaciones, RLS |
| 2 | **Fuente única de verdad** | Fundación | Resuelve "las pestañas no se enlazan" |
| 3 | **Realtime robusto** | Fundación | Resuelve "cómo ven los demás los cambios" |
| 4 | **Sesión y persistencia** | Fundación | Resuelve "si cierro/desloguea cómo queda" |
| 5 | **Usuarios e invitaciones** | Fundación | Resuelve "cómo se crean/asignan usuarios" |
| 6 | **Sistema de temas (claro/oscuro)** | Fundación UI | Debe ir ANTES de las vistas para no rehacerlas |
| 7 | **Vista "Mis Tareas"** | Feature ⭐ Prioridad 1 | Lo que pediste primero |
| 8 | **Vista Kanban** | Feature ⭐ Prioridad 2 | Segunda |
| 9 | **Vista Timeline/Gantt** | Feature ⭐ Prioridad 3 | Última de las tres |
| 10 | **Resto de features** | Feature | Calendario, Carga, Portafolio, campos custom, vistas guardadas |
| 11 | **Capa de IA** | Feature | Superpoderes encima de todo lo anterior |

> Las fases 0–6 son **infraestructura**: sin ellas, las fases 7–11 te darán problemas. Las vistas
> de tu prioridad (Mis Tareas, Kanban, Timeline) empiezan en la fase 7, exactamente en tu orden.

---

## 2. PRINCIPIOS NO NEGOCIABLES (la regla de oro)

Claude Code debe respetarlos en TODAS las fases (detalle completo en `ARQUITECTURA_...md` §1):

1. **Una sola fuente de verdad.** Los datos viven en Postgres y una sola vez en memoria (store
   central en `AppShell`). Ninguna vista hace su propio fetch; reciben datos por props/contexto.
2. **Las métricas se derivan, no se guardan.** "% completado", conteos, alertas → `useMemo`.
3. **Una sola ruta de mutación.** Todo cambio pasa por un handler en `AppShell`: optimista →
   persiste en Supabase → revierte si falla.
4. **Reconciliar por `id`** (upsert/replace/remove), nunca `push` a ciegas.
5. **La seguridad la decide RLS** (servidor). El `canEdit` del front es solo cosmético.
6. **Toda vista usa los tokens del tema** (variables CSS), nunca colores fijos (ver Fase 6).

---

## FASE 0 — Diagnóstico (sin escribir features)
**Objetivo:** que Claude Code entienda el estado real antes de cambiar nada.
- [ ] Abrir `AppShell.tsx` y las vistas (`FunnelCanvas`, `FunnelNode`, `BoardView`,
      `TaskDetailPanel`, Resumen). Determinar si hay **store único** o **fetches dispersos**.
- [ ] Abrir `supabase/schema_v2_complete.sql`: qué tablas hijas tienen `project_id`, qué columnas
      tiene `node_tasks` (¿`assigned_to`?, ¿`done`?, ¿`due_date`?, ¿`start_date`?), y qué políticas
      RLS de **escritura** existen (no solo SELECT).
- [ ] Revisar `globals.css`: listar dónde hay colores fijos (hex/rgb) que habrá que mover a
      variables para el tema.
- [ ] Revisar las suscripciones realtime: ¿filtran por `project_id`? ¿reconcilian por id?
- **Entrega:** un informe + plan. **No tocar código.** No avanzar sin confirmación.

---

## FASE 1 — Cimientos de datos (backend)
**Objetivo:** dejar el esquema listo para todo lo demás (incluye lo que necesitan Kanban y Timeline).
- [ ] **Denormalizar `project_id`** en `node_tasks`, `task_comments`, `node_messages` (+ backfill
      + índices). *Crítico para realtime filtrado y RLS.* (Detalle SQL en `ARQUITECTURA_...md` §4.4.)
- [ ] **`task_statuses`** por proyecto (nombre, color, categoría `todo`/`in_progress`/`done`,
      posición). *Lo necesita el Kanban (columnas) y el Resumen.*
- [ ] Ampliar `node_tasks`: `start_date date`, `position int`, `is_milestone bool`,
      `parent_task_id` (subtareas), `status_id` (→ task_statuses). *`start_date` lo necesita el Timeline.*
- [ ] **Multi-responsable (recomendado):** tabla `task_assignees(task_id, user_id)` y migrar
      `assigned_to`. Si prefieres MVP rápido, conserva `assigned_to` único y deja multi para después.
- [ ] **`invitations`** + trigger `link_pending_invitations` (detalle en `ARQUITECTURA_...md` §2.3).
- [ ] Helpers RLS `can_access_project(pid)` y `my_project_role(pid)`; aplicarlos en políticas
      **SELECT/INSERT/UPDATE/DELETE** de todas las tablas del dominio (detalle en `ARQUITECTURA_...md` §2.4).
- [ ] Añadir tablas a `supabase_realtime`.
- **Aceptación:** la vista Lista/Dashboard actual sigue funcionando leyendo el nuevo esquema.

---

## FASE 2 — Fuente única de verdad
**Objetivo:** resolver de raíz "Embudo ve una cosa y Resumen otra".
- [ ] Centralizar TODO el estado del proyecto activo en `AppShell` (un store): `nodes`, `tasks`,
      `edges`, `zones`, `members`, `comments`, `messages`.
- [ ] Quitar fetches internos de las vistas; pasar datos por props o crear `ProjectDataProvider`
      (Context). Embudo, Dashboard y Resumen leen **el mismo** array de `tasks`.
- [ ] Convertir el Resumen a **estado derivado** (`useMemo`): %, "sin avance", "sin responsable",
      "sin tareas", "avance por rol" (detalle en `ARQUITECTURA_...md` §4.2).
- [ ] Crear handlers únicos de mutación: `addTask`, `updateTask`, `toggleTask`, `deleteTask`,
      `assignTask`, `moveTask` — todos con patrón optimista + revertir.
- **Aceptación:** marcar una tarea como hecha en el Dashboard cambia al instante el conteo del nodo
  en el Embudo **y** el % del Resumen, sin recargar.

---

## FASE 3 — Realtime robusto
**Objetivo:** que los cambios de un usuario lleguen a los demás sin duplicados ni desfases.
- [ ] Un canal por proyecto, filtrado por `project_id`, con cleanup (`removeChannel`) al cambiar
      de proyecto/desmontar.
- [ ] Funciones `reconcile*` **idempotentes por id** para cada tabla (mata el "eco" de tu propio cambio).
- [ ] **Resync al reconectar:** en `subscribe(status === 'SUBSCRIBED')` → refetch del proyecto.
      (Detalle y código en `ARQUITECTURA_...md` §6.)
- **Aceptación:** dos usuarios en el mismo proyecto; uno asigna/edita y el otro lo ve en < 1 s.
  Tras cortar y reconectar la red, ambos quedan sincronizados.

---

## FASE 4 — Sesión y persistencia
**Objetivo:** que cerrar/recargar/desloguear no pierda nada.
- [ ] Migrar a **`@supabase/ssr`** (sesión en cookies) + `middleware.ts` para proteger rutas.
- [ ] Implementar la **secuencia de arranque** explícita (sesión → perfil → proyectos → proyecto
      activo → datos → realtime). Detalle en `ARQUITECTURA_...md` §5.3.
- [ ] Guardar en `localStorage` la UI efímera: `lastActiveProjectId`, `lastActiveTab`, viewport
      del canvas. (Los datos del dominio NO van a localStorage, van a Postgres.)
- **Aceptación:** hago cambios, cierro el navegador, reabro → sigo logueado, en el mismo proyecto
  y pestaña, y todo está guardado.

---

## FASE 5 — Usuarios e invitaciones (UI)
**Objetivo:** flujo claro de "crear y asignar usuarios".
- [ ] `TeamModal`: invitar por email (crea `invitation` o `project_member`), cambiar rol, quitar.
- [ ] Pantalla **"Esperando acceso"** para `user` sin membresías.
- [ ] Selector de responsable que solo lista miembros del proyecto, gateado por `canEdit`.
- [ ] (Opcional) Route Handler server-side con service role para `inviteUserByEmail`.
- **Aceptación:** invito a alguien por email; al registrarse, el proyecto le aparece solo, sin
  pasos manuales; un viewer no puede asignar ni editar (ni forzando la petición).

---

## FASE 6 — Sistema de temas (claro / oscuro) ☀️🌙
**Objetivo:** poder seleccionar una **vista clara** de la app (hoy todo es oscuro). Va aquí, antes
de las vistas nuevas, para construirlas ya "theme-aware" y no rehacerlas después.

- [ ] **Tokens de color como variables CSS.** En `globals.css` define una paleta semántica:
      ```css
      :root, [data-theme="dark"] {
        --bg: #0e0b16; --surface: #1a1626; --surface-2: #221d33;
        --text: #f4f2fb; --text-muted: #a79fc4; --border: #2e2842;
        --accent: #7c5cff; --accent-contrast: #ffffff;
        --danger: #ff5c7c; --warning: #ffb020; --success: #36d399;
      }
      [data-theme="light"] {
        --bg: #f7f7fb; --surface: #ffffff; --surface-2: #f0eef8;
        --text: #1a1626; --text-muted: #5b5470; --border: #e3e0ee;
        --accent: #7c5cff; --accent-contrast: #ffffff;
        --danger: #e03e63; --warning: #c77700; --success: #1f9d6b;
      }
      ```
- [ ] **Refactor:** reemplazar los colores fijos (hex/rgb) de `globals.css` y de las clases
      `al-*`, `tdp-*`, `bt-*`, `perm-*` por `var(--...)`. Es trabajo de búsqueda y reemplazo guiado.
- [ ] **Toggle de tema** en `Topbar` (y/o `Sidebar`): tres opciones recomendadas —
      **Claro / Oscuro / Sistema**. Persistir la elección en `localStorage`.
- [ ] **Sin parpadeo (FOUC):** usa la librería **`next-themes`** (ideal para Next.js App Router),
      que aplica `data-theme` en `<html>` antes de hidratar. Default sugerido: `system`
      (respeta `prefers-color-scheme`).
- [ ] **Regla a partir de aquí:** toda vista nueva (Mis Tareas, Kanban, Timeline, etc.) usa
      **solo** los tokens del tema. Prohibido color fijo. Así ambos temas se ven bien sin retoques.
- **Aceptación:** cambio entre Claro/Oscuro/Sistema desde la UI; toda la app responde al instante,
  la elección persiste al recargar, y no hay flash de tema incorrecto al cargar.

---

## FASE 7 — Vista "Mis Tareas" (multi-proyecto) ⭐ PRIORIDAD 1
**Objetivo:** que cada miembro vea, en un solo lugar, todo lo que le toca a través de TODOS los
proyectos. Es lo que hace que un equipo grande no se pierda.

- [ ] Entrada de **nivel superior** en el `Sidebar` (no por proyecto): "Mis Tareas".
- [ ] Consulta: todas las `node_tasks` con `assigned_to = yo` (o vía `task_assignees`) **en todos
      los proyectos a los que tengo acceso** (RLS ya los filtra). Esta vista tiene su **propio slice
      de datos** en el store (es cross-proyecto, no del proyecto activo).
- [ ] **Agrupación automática por fecha:** Atrasadas / Hoy / Esta semana / Próximas / Sin fecha.
- [ ] Cada fila muestra: título, **proyecto** y **módulo** de origen, responsable(s), fecha límite,
      prioridad, estado. Checkbox para marcar hecho inline.
- [ ] Clic en una tarea → abre su detalle (cargando el contexto del proyecto correspondiente).
- [ ] **Realtime:** suscripción filtrada por `assigned_to = yo` (o por mis proyectos) con la misma
      reconciliación por id de la Fase 3. Si alguien me asigna algo, aparece sin recargar.
- [ ] Usa los tokens del tema (Fase 6).
- **Aceptación:** me asignan una tarea en el proyecto A; aparece de inmediato en "Mis Tareas" en
  la sección de fecha correcta; al marcarla hecha aquí, también se actualiza en el proyecto A.

---

## FASE 8 — Vista Kanban ⭐ PRIORIDAD 2
**Objetivo:** tablero de columnas para gestionar flujo de trabajo arrastrando tareas.
- [ ] Columnas = `task_statuses` del proyecto (Fase 1). Tarjetas = `tasks`, leídas del **mismo
      store** (no fetch nuevo).
- [ ] **Drag & drop** con **`dnd-kit`** (accesible y estable en React). Al soltar: `moveTask`
      actualiza `status_id` y `position` (optimista → persiste → realtime reconcilia por id).
- [ ] Tarjeta muestra: título, avatares de responsables, chip de prioridad, fecha, nº de subtareas,
      etiquetas. Clic → panel de detalle.
- [ ] **Selector de "agrupar por":** estado (default), responsable, prioridad o módulo.
- [ ] Conteo por columna (y límite WIP opcional).
- [ ] Usa tokens del tema (Fase 6).
- **Aceptación:** arrastrar una tarjeta de "Pendiente" a "En progreso" cambia su estado, persiste,
  y otro usuario ve el movimiento en vivo; el % del Resumen se recalcula solo.

---

## FASE 9 — Vista Timeline / Gantt ⭐ PRIORIDAD 3
**Objetivo:** ver las tareas en el tiempo y sus dependencias.
- [ ] Barras según `start_date` → `due_date` (de la Fase 1). Hitos (`is_milestone`) como rombos.
- [ ] **Dependencias** (tabla `task_dependencies`): líneas entre tareas; avisar cuando una bloquea.
- [ ] Arrastrar/redimensionar una barra cambia las fechas → `updateTask` (optimista + realtime).
- [ ] Escalas de zoom: día / semana / mes. Scroll horizontal.
- [ ] Implementación: puede ser custom (posición absoluta sobre una grilla de fechas, leyendo el
      store) o con una librería de Gantt; lo importante es que **lea el store único** y mute con los
      handlers de la Fase 2. Usa tokens del tema.
- **Aceptación:** mover una barra reprograma la tarea para todos en vivo; las dependencias se ven
  y reflejan los cuellos de botella.

---

## FASE 10 — Resto de features (estilo Asana + Notion)
**Objetivo:** completar la paridad con Asana/Notion (detalle en `SPEC_...md`).
- [ ] **Calendario** por `due_date`, con drag para reprogramar.
- [ ] **Carga del equipo (Workload):** tareas/esfuerzo por persona en un rango, con alerta de
      sobrecarga (mejora tu "Carga del equipo" actual).
- [ ] **Portafolio:** tabla multi-proyecto con salud, % avance y próximos vencimientos.
- [ ] **Campos personalizados** (estilo Notion) por proyecto + render en todas las vistas.
- [ ] **Vistas guardadas:** guardar y compartir configuraciones de filtro/orden/agrupación
      (`saved_views`), reutilizables en Lista/Kanban/Calendario/Timeline.
- [ ] **Subtareas y dependencias** en la UI de Lista y detalle (si no entraron antes).
- **Aceptación:** un líder ve el estado de todos los proyectos en una pantalla; cada quien guarda
  sus vistas favoritas (ej. "Mis urgentes esta semana").

---

## FASE 11 — Capa de IA (superpoderes)
**Objetivo:** convertir el Copilot en una capa transversal (detalle en `SPEC_...md` §7).
- [ ] Backend: "AI tool layer" con funciones tipadas (`create_tasks`, `assign_task`,
      `summarize_project`, `breakdown_task`, `query_project`) que el modelo invoca (tool use).
- [ ] Convertir "+ IA" en **creación de tareas por lenguaje natural**.
- [ ] **Asignar con IA** según rol del módulo + carga del equipo.
- [ ] **Resumen/standup** automático y detección de riesgos, alimentando el Resumen.
- [ ] **Chat con el proyecto (RAG)** sobre tareas/comentarios.
- **Regla de seguridad:** la IA nunca crea/asigna sin confirmación (acción → previsualización →
  aplicar).
- **Aceptación:** describir un objetivo en texto genera y asigna tareas correctas tras mi confirmación.

---

## 3. Criterios de aceptación globales (para todo el roadmap)
- Todas las vistas leen **la misma** fuente de datos (un store, muchas proyecciones).
- Cambios visibles en **tiempo real** entre miembros, con resync tras reconexión.
- Funciona con **varios proyectos** y **equipos grandes** (paginar/virtualizar listas largas).
- Respeta **roles y permisos** vía RLS (no solo UI).
- **Tema claro/oscuro** consistente en toda la app, sin parpadeo, persistente.
- Nada crítico vive solo en memoria: al recargar, el estado se reconstruye idéntico desde Postgres.

---

## 4. INSTRUCCIÓN INICIAL PARA CLAUDE CODE (cópiala como primer mensaje)

> "Eres mi ingeniero senior en FunnelManager (Next.js 14 App Router + Supabase + React Flow).
> Tienes tres documentos: este **ROADMAP MAESTRO** (el orden a seguir), `ARQUITECTURA_...md`
> (el cómo, con SQL y patrones) y `SPEC_...md` (el qué, features Asana/Notion). El ROADMAP manda
> el orden; usa los otros dos como referencia técnica.
>
> Respeta SIEMPRE los **Principios no negociables** (§2): una sola fuente de verdad, métricas
> derivadas, una sola ruta de mutación, reconciliación por id, seguridad en RLS y uso de tokens
> de tema.
>
> Empieza por la **FASE 0 (diagnóstico)** y entrégame un informe + plan antes de tocar código.
> No avances a la siguiente fase hasta que yo confirme. Cuando programes, hazlo en cambios
> pequeños, dime qué archivos tocas y por qué. Recuerda el orden de las fases: primero las
> fundaciones (1–6, incluido el tema), y luego las vistas en este orden: **Mis Tareas → Kanban →
> Timeline**, y al final el resto y la IA."

---

## 5. Para afinar el SQL exacto (responde y reescribo las migraciones con tus nombres reales)
1. ¿`node_tasks` ya tiene `assigned_to`, `done`, `due_date`? ¿y `start_date`?
2. ¿`funnel_nodes` tiene `responsible_id`/`role`?
3. ¿Ya usas `@supabase/ssr` o el cliente browser clásico?
4. ¿El Resumen calcula en vivo o lee conteos guardados?
5. ¿Las suscripciones realtime filtran por `project_id` hoy?
6. ¿Tienes políticas RLS de UPDATE/INSERT/DELETE por rol, o solo de SELECT?
7. ¿Quieres multi-responsable desde ya (tabla `task_assignees`) o `assigned_to` único en el MVP?
