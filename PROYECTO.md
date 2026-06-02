# FunnelManager — Guía del proyecto

> Documento de contexto para que otra IA (o desarrollador) entienda qué es la app, cómo está construida y los detalles clave.

---

## 1. ¿Qué es?

**FunnelManager** es una app web colaborativa para diseñar y gestionar **embudos de marketing** (funnels) como un lienzo visual, con tareas, roles de equipo y chat por módulo. Pensada para agencias que arman embudos para clientes.

Tiene 3 formas de ver el mismo proyecto:
- **Embudo (canvas)**: lienzo tipo diagrama con nodos (módulos) conectados con flechas — el corazón de la app.
- **Dashboard (board)**: lista de tareas estilo Asana, con secciones colapsables y panel de detalle.
- **Vistas auxiliares**: Roles, Docs (archivos), Resumen (métricas), Permisos, Admin.

---

## 2. Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | **Next.js 14** (App Router), React 18, TypeScript |
| Lienzo visual | **React Flow** (`reactflow`) |
| Estilos | CSS plano en `globals.css` (clases con prefijos: `al-*`, `tdp-*`, `bt-*`, `perm-*`, etc.) + Tailwind disponible |
| Backend | **Supabase** (PostgreSQL + Auth + Realtime + Storage + RLS) |
| Despliegue | **Docker** (`output: "standalone"`) en **EasyPanel** (self-hosted) |

---

## 3. Modelo de datos (tablas principales en Supabase)

- **`profiles`** — usuarios. Campo clave `platform_role`: `super_admin` | `admin` | `user`. El primer usuario registrado se vuelve `super_admin` automáticamente (trigger `handle_new_user`).
- **`projects`** — proyectos/embudos. `user_id` = dueño. Soporta subproyectos (`parent_project_id`).
- **`project_members`** — miembros invitados a un proyecto, con `role`: `editor` | `viewer`.
- **`funnel_nodes`** — los módulos del embudo (posición x/y, icono, rol, responsable).
- **`node_tasks`** — tareas dentro de cada módulo (texto, done, fecha, prioridad, `assigned_to`).
- **`task_comments`** — comentarios por tarea (distinto de los mensajes por nodo).
- **`node_messages`** — chat por módulo.
- **`funnel_edges`** — conexiones (flechas) entre nodos.
- **`funnel_zones`** — rectángulos de agrupación en el lienzo.
- **`project_docs`** — documentos/archivos.

El schema completo está en **`supabase/schema_v2_complete.sql`** (incluye tablas, triggers, funciones y políticas RLS).

---

## 4. Sistema de roles (IMPORTANTE — son dos niveles)

### Nivel plataforma (`profiles.platform_role`)
Controla quién puede **crear proyectos raíz**:
- `super_admin` / `admin` → pueden crear proyectos.
- `user` → NO puede crear proyectos; ve pantalla "Esperando acceso" hasta ser invitado.
- Aplicado por la política RLS `projects_insert` que exige `is_platform_admin()`.

### Nivel proyecto (rol del usuario dentro de un proyecto)
Tipo `ProjectRole = "owner" | "editor" | "viewer"`:
- **owner** (dueño = `projects.user_id`) → todo, incluido eliminar el proyecto.
- **editor** ("Project Manager") → todo excepto eliminar el proyecto / gestionar equipo.
- **viewer** ("Colaborador") → solo lectura + comentarios. No edita tareas ni agrega gente.

Se calcula con `getMyProjectRole(meId, project, members)` en `AppShell.tsx`. La edición se "gatea" inyectando o no los callbacks (toggle/add/delete tarea) según `canEdit`.

---

## 5. Archivos clave

```
src/components/layout/AppShell.tsx     ← Orquestador: estado global, carga datos, realtime, handlers, gating de roles
src/components/layout/Sidebar.tsx      ← Navegación (proyectos + vistas)
src/components/layout/Topbar.tsx       ← Barra superior (equipo, progreso)
src/components/canvas/FunnelCanvas.tsx ← Lienzo React Flow (se mantiene montado, se oculta con CSS al cambiar de pestaña)
src/components/canvas/FunnelNode.tsx   ← Nodo/módulo del embudo (tareas, chat, editar título/rol)
src/components/views/BoardView.tsx     ← Dashboard estilo Asana (lista + panel split)
src/components/views/TaskDetailPanel.tsx ← Panel derecho de detalle de tarea (+ comentarios)
src/components/views/PermissionsView.tsx ← Tablero de permisos (matriz por miembro; el owner cambia roles)
src/components/project/ProjectWizard.tsx ← Asistente de creación de proyecto (4 pasos: datos, módulos, equipo+roles, tareas)
src/components/team/TeamModal.tsx      ← Invitar/gestionar miembros
src/lib/types.ts                       ← Tipos (Project, NodeTask, ProjectRole, TaskComment, etc.)
src/lib/constants.ts                   ← Labels/colores de roles, prioridades, alertas
src/lib/supabase/client.ts             ← Cliente Supabase (browser)
supabase/schema_v2_complete.sql        ← Schema completo de la BD
Dockerfile                             ← Build multi-stage para producción
```

---

## 6. Patrones y detalles a tener en cuenta

- **Realtime**: `AppShell` se suscribe a cambios de `node_messages`, `node_tasks`, `funnel_nodes`, `funnel_edges` por proyecto. Los cambios de otros usuarios aparecen en vivo. Hay refs (`activeProjectIdRef`, `meRef`) para evitar closures obsoletos.
- **El canvas no se desmonta** al cambiar de pestaña (se oculta con `display:none` vía prop `visible`), para que React Flow no resetee el viewport.
- **Variables de entorno** (Next.js, se hornean en build):
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - En Docker se pasan como `ARG` en el Dockerfile (build-time, no solo runtime).
- **Build**: `next.config.mjs` tiene `output: "standalone"` y `eslint.ignoreDuringBuilds: true`.
- **`export const dynamic = "force-dynamic"`** en `app/page.tsx` y `app/auth/login/page.tsx` para evitar prerender en build (Supabase no está disponible en build-time).

---

## 7. Despliegue (estado actual)

Desplegado **self-hosted en EasyPanel**:
- **Supabase** corriendo como servicio compose, expuesto vía dominio EasyPanel con HTTPS.
- **App** (`funnelmanager`) como servicio App, build desde Dockerfile, conectado al repo GitHub `Ferney-cmd/funnel-manager` (rama `main`).
- El schema se migra ejecutando `supabase/schema_v2_complete.sql` en la BD.

**Notas de self-hosting de Supabase** (problemas comunes ya resueltos):
- Cambiar los passwords de los roles internos (`postgres`, `supabase_admin`, `authenticator`, `supabase_auth_admin`, `supabase_storage_admin`, etc.) para que coincidan con `POSTGRES_PASSWORD`.
- El trigger `handle_new_user()` necesita `SET search_path = public, auth` o falla con "Database error saving new user" al registrar usuarios.
- Variables opcionales (`LOGFLARE_*`, `POOLER_*`) deben tener valor o el contenedor `vector` no arranca.

---

## 8. Flujo de uso típico

1. Un admin crea un proyecto con el **Wizard** (define módulos, invita equipo con roles, agrega tareas iniciales).
2. El equipo trabaja en el **lienzo**: arrastra módulos, los conecta, asigna responsables, chatea por módulo.
3. El **Dashboard** da la vista de tareas tipo lista para hacer seguimiento.
4. El dueño gestiona quién puede qué desde **Permisos** y **Equipo**.
