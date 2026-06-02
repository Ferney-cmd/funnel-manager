# 🏗️ Playbook de Arquitectura — Módulo de Tareas (FunnelManager)
### Instrucción de nivel profesional para Claude Code

> **Para qué sirve este archivo:** resuelve los 4 problemas raíz que han costado más tiempo
> (identidad/usuarios, pestañas que no se enlazan, persistencia al cerrar/desloguear, y cómo
> ven los demás los cambios en vivo). NO es una lista de features: es un contrato de arquitectura
> sobre tu stack real (Next.js 14 App Router + Supabase + React Flow). Si Claude Code respeta
> estas reglas, los bugs de "una pestaña ve algo y otra ve diferente" dejan de aparecer.
>
> **Cómo usarlo:** pégalo en Claude Code. Pídele que ejecute una **Fase** a la vez (sección 11),
> y que NUNCA viole los **Principios no negociables** (sección 1).

---

## 0. Contexto técnico real (de PROYECTO.md)

- **Front:** Next.js 14 (App Router), React 18, TS. Lienzo con `reactflow`.
- **Back:** Supabase (Postgres + Auth + Realtime + Storage + RLS), self-hosted en EasyPanel.
- **Orquestador:** `src/components/layout/AppShell.tsx` ya carga datos, hace realtime y "gatea" roles.
- **Tablas:** `profiles`, `projects`, `project_members`, `funnel_nodes`, `node_tasks`,
  `task_comments`, `node_messages`, `funnel_edges`, `funnel_zones`, `project_docs`.
- **Roles:** plataforma (`profiles.platform_role`: super_admin/admin/user) + proyecto (owner/editor/viewer).

El modelo mental clave: **`funnel_node` = módulo = sección.** Una `node_task` pertenece a un nodo,
y ese nodo pertenece a un proyecto. Las tareas se ven en el **Embudo** (dentro de la tarjeta del
nodo), en el **Dashboard** (agrupadas por nodo) y en el **Resumen** (métricas). **Son los mismos
datos vistos de tres formas.** Ahí está el origen de tus desincronizaciones.

---

## 1. PRINCIPIOS NO NEGOCIABLES (la regla de oro)

Estos principios son la causa y la cura de la mayoría de tus bugs. Claude Code debe respetarlos siempre:

1. **Una sola fuente de verdad por dato.**
   - Los datos del dominio (proyectos, nodos, tareas, miembros) viven **solo** en Postgres (Supabase).
   - En memoria viven **una sola vez**, en el store central de `AppShell`. Ninguna vista hace su
     propio `fetch` de tareas/nodos. Las vistas **reciben** los datos por props/contexto.
2. **Las métricas y conteos NUNCA se guardan: se derivan.**
   - "% completado", "0/2 tareas", "módulos sin responsable", "avance por rol" se **calculan**
     (con `useMemo`) a partir del array canónico de tareas/nodos. Si los guardas en columnas se
     desincronizan. (Excepción: solo cachear si hay un problema de rendimiento medido.)
3. **Una sola ruta de mutación.**
   - Todo cambio pasa por un handler en `AppShell` que hace: (a) update optimista del store,
     (b) escribe en Supabase, (c) revierte si falla. Realtime se encarga de propagar a los demás.
   - Las vistas no escriben directo a Supabase; invocan callbacks del `AppShell`.
4. **Reconciliar por `id`, nunca acumular a ciegas.**
   - Al recibir un cambio (realtime u optimista), se hace **upsert/replace/remove por `id`**.
     Nunca `array.push` sin verificar, o aparecen duplicados (tu cambio + el eco de realtime).
5. **El servidor manda en seguridad (RLS); el cliente solo gatea la UI.**
   - Las políticas RLS deciden qué puede leer/escribir cada usuario. El `canEdit` del front es
     solo cosmética (ocultar botones). Si el front falla, RLS te protege igual.

> Si una vista necesita un dato que no tiene, la solución correcta es **subirlo al store central
> y pasarlo por props**, NO hacer un fetch nuevo dentro de la vista.

---

## 2. IDENTIDAD Y USUARIOS — "¿qué herramienta, cómo se registran, dónde se alojan?"

**Herramienta: Supabase Auth. No necesitas otra.** Ya la tienes en el stack. Aquí el modelo completo:

### 2.1 Dónde se alojan los usuarios (dos tablas, un solo usuario)
- **`auth.users`** (la gestiona Supabase): guarda email, contraseña hasheada, sesión. **No la tocas.**
- **`public.profiles`** (tuya): espejo con datos de tu app (`full_name`, `avatar_url`,
  `platform_role`). Se crea sola por el trigger **`handle_new_user`** cuando alguien se registra.
- Relación: `profiles.id = auth.users.id` (mismo UUID).

### 2.2 Cómo se registran (flujo recomendado para una agencia)
Modelo **"signup abierto + acceso por invitación"** (encaja con tu pantalla "Esperando acceso"):

1. Cualquiera puede crear cuenta en `/auth/signup` → `supabase.auth.signUp({ email, password })`.
   Esto crea fila en `auth.users` → trigger crea `profiles` con `platform_role = 'user'`.
   (El **primer** usuario del sistema se vuelve `super_admin`, ya lo tienes.)
2. Un `user` recién creado **no ve ningún proyecto** hasta ser invitado. Ve "Esperando acceso".
3. Un `owner`/`editor` de un proyecto lo **invita por email** desde `TeamModal`.

> **Alternativa más cerrada (opcional):** invitación iniciada por admin con
> `supabase.auth.admin.inviteUserByEmail()` desde una **Route Handler server-side** usando la
> *service role key* (NUNCA en el cliente). Manda correo de invitación con link para fijar
> contraseña. Úsala si NO quieres que cualquiera cree cuenta.

### 2.3 El eslabón que falta: tabla `invitations` + auto-enlace al registrarse
Tu problema "cómo se asigna a alguien" empieza aquí. Añade esto:

```sql
-- Invitaciones a proyectos (NUEVO)
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  email text not null,
  role text not null default 'editor' check (role in ('editor','viewer')),
  invited_by uuid not null references public.profiles(id),
  status text not null default 'pending' check (status in ('pending','accepted','revoked')),
  created_at timestamptz default now(),
  expires_at timestamptz default now() + interval '14 days'
);
create index on public.invitations (lower(email)) where status = 'pending';

-- Cuando un usuario se registra, enlazar sus invitaciones pendientes a project_members.
-- Extiende tu handle_new_user existente (recuerda SET search_path = public, auth).
create or replace function public.link_pending_invitations()
returns trigger language plpgsql security definer set search_path = public, auth as $$
begin
  insert into public.project_members (project_id, user_id, role)
  select i.project_id, new.id, i.role
  from public.invitations i
  where lower(i.email) = lower(new.email) and i.status = 'pending'
  on conflict (project_id, user_id) do nothing;

  update public.invitations
  set status = 'accepted'
  where lower(email) = lower(new.email) and status = 'pending';
  return new;
end $$;

create trigger on_profile_created_link_invites
  after insert on public.profiles
  for each row execute function public.link_pending_invitations();
```

**Flujo completo de "asignar a alguien":**
- Si el invitado **ya tiene cuenta** → al invitar, insertas directo en `project_members`
  (o también una `invitation` aceptada, para historial).
- Si **no tiene cuenta** → insertas `invitation` pending; cuando se registre con ese email,
  el trigger lo mete solo a `project_members`. Sin pasos manuales.

### 2.4 Qué puede VER cada usuario (lo decide RLS, no el front)
Regla: un usuario ve un proyecto si es **owner** (`projects.user_id = auth.uid()`) o está en
`project_members`. Y solo ve los nodos/tareas/comentarios **de esos proyectos**. Ejemplo de RLS:

```sql
-- ¿Tengo acceso a este proyecto? (función helper)
create or replace function public.can_access_project(pid uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.projects p where p.id = pid and p.user_id = auth.uid()
  ) or exists (
    select 1 from public.project_members m where m.project_id = pid and m.user_id = auth.uid()
  );
$$;

-- SELECT de tareas: solo de proyectos a los que tengo acceso
create policy node_tasks_select on public.node_tasks
  for select using ( public.can_access_project(project_id) );  -- ver 4.4 sobre project_id

-- UPDATE de tareas: solo owner/editor (no viewer)
create policy node_tasks_update on public.node_tasks
  for update using (
    public.can_access_project(project_id) and public.my_project_role(project_id) in ('owner','editor')
  );
```

> Crea funciones helper `my_project_role(pid)` y `can_access_project(pid)` y reúsalas en TODAS
> las políticas. Así la lógica de permisos vive en un solo sitio.

---

## 3. PERMISOS — dos niveles, aplicados en dos capas

| Nivel | Dónde se guarda | Qué controla | Cómo se aplica |
|---|---|---|---|
| **Plataforma** | `profiles.platform_role` | Quién crea proyectos raíz | RLS `projects_insert` exige `is_platform_admin()` |
| **Proyecto** | owner = `projects.user_id` / `project_members.role` | Qué hace cada quien dentro del proyecto | RLS (server) + `canEdit` (UI) |

- **Server (RLS):** la verdad. Decide lectura/escritura. Imposible de saltar desde el front.
- **Cliente (`getMyProjectRole`):** solo decide qué botones mostrar y si inyectar los callbacks
  de mutación. Si `canEdit === false`, no pasas los handlers (toggle/add/delete) a las vistas.

**Importante:** nunca confíes solo en el `canEdit` del front. Cada tabla debe tener su política
de UPDATE/INSERT/DELETE que valide el rol. Hoy probablemente tienes el gating de UI pero te
faltan políticas de escritura por rol → revísalo.

---

## 4. FUENTE ÚNICA DE VERDAD — resolver "las pestañas no se enlazan"

Este es tu bug central: **Embudo ve unas tareas, Dashboard ve otras, Resumen otra cosa.** Pasa
porque cada vista trae sus propios datos. Solución arquitectónica:

### 4.1 Un solo store en AppShell, muchas proyecciones
`AppShell` mantiene el estado canónico del proyecto activo:

```ts
// Estado canónico (una sola copia en memoria)
const [nodes, setNodes]       = useState<FunnelNode[]>([]);
const [tasks, setTasks]       = useState<NodeTask[]>([]);   // TODAS las tareas del proyecto
const [edges, setEdges]       = useState<FunnelEdge[]>([]);
const [zones, setZones]       = useState<FunnelZone[]>([]);
const [members, setMembers]   = useState<ProjectMember[]>([]);
const [comments, setComments] = useState<TaskComment[]>([]);
const [messages, setMessages] = useState<NodeMessage[]>([]);
```

- **`FunnelCanvas`** recibe `nodes`, `edges`, `zones`, y por cada nodo filtra `tasks` por `node_id`.
- **`BoardView`** recibe los **mismos** `nodes` (como secciones) y los **mismos** `tasks`,
  agrupados por `node_id`.
- **Resumen** recibe los mismos `tasks`/`nodes`/`members` y **calcula** todo.

Ninguna de las tres hace fetch. Las tres leen el mismo array. Si cambias una tarea, las tres
reflejan el cambio porque apuntan al mismo estado.

### 4.2 Estado derivado (Resumen NO guarda métricas)
```ts
// En AppShell o en un hook useProjectMetrics(nodes, tasks, members)
const metrics = useMemo(() => {
  const total = tasks.length;
  const done  = tasks.filter(t => t.done).length;
  const byNode = nodes.map(n => {
    const nt = tasks.filter(t => t.node_id === n.id);
    return {
      node: n,
      total: nt.length,
      done: nt.filter(t => t.done).length,
      hasResponsible: !!n.responsible_id, // o si alguna tarea tiene assigned_to
    };
  });
  return {
    pct: total ? Math.round((done / total) * 100) : 0,
    modulesSinAvance: byNode.filter(b => b.total > 0 && b.done === 0).length,
    modulesSinResponsable: byNode.filter(b => !b.hasResponsible).length,
    modulesSinTareas: byNode.filter(b => b.total === 0).length,
    byNode,
  };
}, [nodes, tasks, members]);
```
Así "0/2 tareas · 0%", "1 módulo sin avance", "3 sin responsable" del Resumen **siempre** cuadran
con lo que muestran el Embudo y el Dashboard, porque salen del mismo array.

### 4.3 (Opcional pero recomendado) un Context o store ligero
Si pasar props por muchos niveles se vuelve molesto, usa **React Context** (`ProjectDataProvider`)
o **Zustand**. La regla no cambia: **un store, todas las vistas lo consumen.** No es obligatorio,
pero ayuda a no romper el principio #1 al crecer.

### 4.4 Denormaliza `project_id` en las tablas hijas (clave para realtime y RLS)
Hoy `node_tasks` cuelga de `funnel_nodes`, así que no tiene `project_id` directo. Eso complica
filtrar realtime y escribir RLS. **Añade `project_id` a las tablas hijas:**

```sql
alter table public.node_tasks    add column project_id uuid references public.projects(id);
alter table public.task_comments add column project_id uuid references public.projects(id);
alter table public.node_messages add column project_id uuid references public.projects(id);
-- (funnel_edges y funnel_zones probablemente ya lo tienen)

-- Backfill desde el nodo
update public.node_tasks t set project_id = n.project_id
  from public.funnel_nodes n where t.node_id = n.id;
-- (repite para comments/messages)

-- Mantenerlo al insertar: trigger que copia project_id del nodo, o pásalo desde el front.
create index on public.node_tasks (project_id);
```
Beneficio doble: RLS más simple/rápida y realtime filtrable por `project_id`.

---

## 5. PERSISTENCIA Y SESIÓN — "si cierro o me deslogueo, ¿cómo queda?"

Clasifica TODO en tres cajones. Esto elimina la confusión de "se perdió mi cambio":

| Cajón | Qué va aquí | Dónde se guarda | Al reabrir |
|---|---|---|---|
| **Datos del dominio** | proyectos, nodos, tareas, comentarios, miembros | **Postgres (Supabase)** | Se vuelven a leer con un fetch |
| **Sesión** | quién soy, token | **Supabase Auth** (cookies) | Se restaura sola |
| **UI efímera** | pestaña activa, tarea seleccionada, viewport del canvas, panel abierto | `localStorage` o URL | Opcional, mejora UX |

### 5.1 Regla: nada importante vive solo en memoria de React
Si un cambio solo está en `useState` y no se escribió a Supabase, al recargar **se pierde**. Por
eso cada mutación debe persistir a Postgres (sección 6.2). Tras un reload, `AppShell` hace fetch
y reconstruye el estado idéntico.

### 5.2 Sesión persistente con `@supabase/ssr` (App Router)
Usa **`@supabase/ssr`** para que la sesión viva en **cookies** (no solo localStorage). Así:
- El usuario sigue logueado al reabrir.
- El servidor (Server Components / middleware) también conoce la sesión.

```ts
// middleware.ts — refresca sesión y protege rutas
import { createServerClient } from '@supabase/ssr';
export async function middleware(req) {
  const res = NextResponse.next();
  const supabase = createServerClient(URL, ANON, { cookies: cookieAdapter(req, res) });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user && req.nextUrl.pathname !== '/auth/login') {
    return NextResponse.redirect(new URL('/auth/login', req.url));
  }
  return res;
}
```

### 5.3 Secuencia de arranque (boot) — definirla explícitamente
Cuando se abre la app, `AppShell` ejecuta SIEMPRE este orden:

1. `supabase.auth.getUser()` → ¿hay sesión?
   - No → redirige a `/auth/login`.
2. Cargar `profiles` del usuario.
   - `platform_role = 'user'` **y** sin membresías → pantalla **"Esperando acceso"**.
3. Cargar lista de proyectos accesibles (RLS ya filtra los míos).
4. Elegir proyecto activo (último usado guardado en `localStorage`, o el primero).
5. **Cargar en una sola tanda** los datos del proyecto activo: nodos, tareas, edges, zonas,
   miembros, comentarios, mensajes → poblar el store.
6. Suscribir realtime del proyecto activo (sección 6).

> Guarda `lastActiveProjectId`, `lastActiveTab` y el viewport del canvas en `localStorage` para
> que el usuario regrese donde estaba. Eso es UI efímera, no datos críticos.

### 5.4 Estados de carga visibles
Cada fetch tiene estados `loading / error / empty / ready`. Nunca renderices con datos a medias
(es otra fuente de "una pestaña muestra una cosa y otra otra"). Muestra skeleton hasta `ready`.

---

## 6. REALTIME Y SINCRONIZACIÓN — "si hago un cambio, ¿cómo lo ven los demás?"

Ya tienes suscripciones, pero el patrón frágil (closures viejos, push a ciegas) causa duplicados
y desfases. Este es el patrón robusto:

### 6.1 Una suscripción por proyecto, filtrada por `project_id`
```ts
useEffect(() => {
  if (!activeProjectId) return;
  const ch = supabase
    .channel(`project:${activeProjectId}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'node_tasks', filter: `project_id=eq.${activeProjectId}` },
      (payload) => reconcileTasks(payload))
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'funnel_nodes', filter: `project_id=eq.${activeProjectId}` },
      (payload) => reconcileNodes(payload))
    // ... edges, zones, comments, messages
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') resyncProject(activeProjectId); // 6.4
    });
  return () => { supabase.removeChannel(ch); };   // limpiar al cambiar de proyecto/desmontar
}, [activeProjectId]);
```
(Esto requiere el `project_id` denormalizado de la sección 4.4.)

### 6.2 Mutación optimista + escritura + reconciliación (idempotente por id)
```ts
async function updateTask(id: string, patch: Partial<NodeTask>) {
  const prev = tasks;
  setTasks(ts => ts.map(t => t.id === id ? { ...t, ...patch } : t));     // 1. optimista
  const { error } = await supabase.from('node_tasks').update(patch).eq('id', id); // 2. persistir
  if (error) { setTasks(prev); toast.error('No se pudo guardar'); }       // 3. revertir si falla
  // El evento realtime de TU propio cambio llegará; reconcileTasks por id lo hace inofensivo.
}

function reconcileTasks(payload) {
  setTasks(curr => {
    const row = payload.new ?? payload.old;
    if (payload.eventType === 'DELETE') return curr.filter(t => t.id !== row.id);
    const i = curr.findIndex(t => t.id === row.id);
    if (i === -1) return [...curr, payload.new];          // INSERT
    const copy = [...curr]; copy[i] = { ...copy[i], ...payload.new }; return copy; // UPDATE
  });
}
```
**Por qué funciona:** reconciliar por `id` (upsert/replace/remove) es **idempotente**. No importa
si el evento es tuyo (eco) o de otro: el resultado es el mismo. Adiós duplicados y parpadeos.

### 6.3 Evitar closures obsoletos (tú ya usas refs — formalízalo)
Mantén `activeProjectIdRef`, `meRef`, etc. y léelos dentro de los callbacks de realtime. O
asegúrate de que el `useEffect` de suscripción dependa de `activeProjectId` y se re-cree limpio.

### 6.4 Resync al reconectar (lo que casi nadie hace y causa "no se actualizó")
Supabase Realtime **puede perder eventos** durante una desconexión de red. Solución: en el callback
`subscribe(status === 'SUBSCRIBED')`, vuelve a hacer **fetch** del proyecto y reconcilia. Así, tras
perder WiFi o suspender el equipo, el estado se pone al día sin recargar la página.

### 6.5 Habilitar Realtime en las tablas (self-hosted)
En Supabase debes añadir las tablas a la publicación de realtime:
```sql
alter publication supabase_realtime add table public.node_tasks, public.funnel_nodes,
  public.funnel_edges, public.funnel_zones, public.task_comments, public.node_messages;
```
Y asegúrate de que las políticas RLS de **SELECT** permitan a cada usuario ver esas filas (realtime
respeta RLS).

---

## 7. EL MÓDULO DE TAREAS, DE PUNTA A PUNTA (asignar a alguien)

Juntando todo lo anterior, el flujo "asigno una tarea a Juan" queda así, sin bugs:

1. **Quién aparece en el selector de responsable:** solo gente con acceso al proyecto →
   `owner` + filas de `project_members`. (No mezclar usuarios de otros proyectos.)
2. **UI:** dropdown en `BoardView`/`TaskDetailPanel`/tarjeta del nodo. Si `canEdit === false`
   (viewer), el dropdown se muestra deshabilitado.
3. **Al asignar:** `updateTask(taskId, { assigned_to: juanId })` → optimista → persiste →
   realtime propaga → reconcilia por id en todos los clientes.
4. **RLS:** la política de UPDATE exige rol owner/editor; un viewer no puede aunque hackee el front.
5. **Lo ve el asignado:** en su vista "Mis Tareas" (cross-proyecto, filtrando
   `tasks.assigned_to = me`) y, opcional, una `notification`.
6. **Persistencia:** como vive en `node_tasks.assigned_to`, al reabrir sigue asignada.

> **Multi-responsable (futuro):** si quieres varias personas por tarea, reemplaza `assigned_to`
> por una tabla `task_assignees(task_id, user_id)`. Mismo patrón de mutación y reconciliación.

---

## 8. ANTI-PATRONES QUE PROBABLEMENTE CAUSARON TUS BUGS (evítalos)

- ❌ Cada vista hace su propio `fetch` de tareas → divergen. ✅ Una sola carga en `AppShell`.
- ❌ Guardar conteos/% en columnas → se desincronizan. ✅ Derivar con `useMemo`.
- ❌ `setTasks([...tasks, payload.new])` en realtime → duplicados. ✅ Reconciliar por `id`.
- ❌ Escribir a Supabase desde dentro de las vistas → lógica dispersa. ✅ Handlers en `AppShell`.
- ❌ Estado importante solo en `useState` → se pierde al recargar. ✅ Todo dato del dominio a Postgres.
- ❌ Confiar solo en `canEdit` del front → inseguro. ✅ RLS de escritura por rol en cada tabla.
- ❌ No limpiar canales realtime al cambiar de proyecto → fugas y eventos cruzados. ✅ `removeChannel`.
- ❌ No resincronizar al reconectar → "no se actualizó". ✅ Refetch en `SUBSCRIBED`.

---

## 9. CRITERIOS DE ACEPTACIÓN (prueba que cada problema quedó resuelto)

- **Identidad:** un usuario nuevo se registra, ve "Esperando acceso"; al ser invitado por email,
  el proyecto le aparece automáticamente al recargar, sin pasos manuales.
- **Enlace entre pestañas:** marcar una tarea como hecha en el Dashboard cambia al instante el
  conteo del nodo en el Embudo **y** el "% completado" del Resumen, sin recargar.
- **Persistencia:** hacer cambios, cerrar el navegador, reabrir → sigo logueado, en el mismo
  proyecto y pestaña, y todos los cambios están ahí.
- **Realtime:** dos usuarios en el mismo proyecto; uno asigna/edita una tarea y el otro lo ve en
  < 1 s sin recargar. Tras cortar y reconectar la red, ambos vuelven a estar sincronizados.
- **Permisos:** un viewer no puede editar ni asignar (ni desde el front ni forzando la petición).

---

## 10. PLAN DE TRABAJO POR FASES (para Claude Code, una a la vez)

### FASE 0 — Diagnóstico (sin escribir features aún)
- [ ] Revisar `AppShell.tsx`: confirmar si hay un único store o fetches dispersos por vista.
- [ ] Revisar `supabase/schema_v2_complete.sql`: ver qué tablas hijas tienen `project_id` y qué
      políticas RLS de **escritura** existen.
- [ ] Listar qué datos lee cada vista y de dónde. **Entregar un informe**, no código.

### FASE 1 — Cimientos de datos
- [ ] Añadir `project_id` a `node_tasks`, `task_comments`, `node_messages` (+ backfill + índices).
- [ ] Crear tabla `invitations` + función/trigger `link_pending_invitations`.
- [ ] Crear helpers RLS `can_access_project` y `my_project_role` y aplicarlos en políticas
      SELECT/INSERT/UPDATE/DELETE de todas las tablas del dominio.
- [ ] Añadir tablas a `supabase_realtime`.

### FASE 2 — Fuente única de verdad
- [ ] Centralizar TODO el estado del proyecto en `AppShell` (un store).
- [ ] Quitar fetches internos de las vistas; pasar datos por props o `ProjectDataProvider` (Context).
- [ ] Convertir el Resumen a **estado derivado** (`useMemo`), sin conteos guardados.
- [ ] Crear handlers únicos de mutación (`addTask`, `updateTask`, `toggleTask`, `deleteTask`,
      `assignTask`) con patrón optimista + revertir.

### FASE 3 — Realtime robusto
- [ ] Reescribir suscripciones: un canal por proyecto, filtrado por `project_id`, con cleanup.
- [ ] Implementar `reconcile*` idempotente por id para cada tabla.
- [ ] Implementar **resync al reconectar** (`SUBSCRIBED` → refetch).

### FASE 4 — Sesión y persistencia
- [ ] Migrar a `@supabase/ssr` (cookies) + `middleware.ts` para proteger rutas.
- [ ] Implementar la **secuencia de arranque** (sección 5.3) explícita.
- [ ] Guardar `lastActiveProjectId`, `lastActiveTab`, viewport en `localStorage`.

### FASE 5 — Flujo de usuarios e invitaciones (UI)
- [ ] `TeamModal`: invitar por email (crea `invitation` o `project_member`), cambiar rol, quitar.
- [ ] Pantalla "Esperando acceso" para `user` sin membresías.
- [ ] (Opcional) Route Handler server-side con service role para `inviteUserByEmail`.

### FASE 6 — Selector de responsable + Mis Tareas
- [ ] Selector de responsable con miembros del proyecto, gateado por `canEdit`.
- [ ] Vista "Mis Tareas" cross-proyecto (`tasks.assigned_to = me`).
- [ ] (Opcional) tabla `notifications` para avisar al asignado.

---

## 11. INSTRUCCIÓN INICIAL PARA CLAUDE CODE (cópiala como primer mensaje)

> "Eres mi ingeniero senior en FunnelManager (Next.js 14 App Router + Supabase + React Flow).
> Lee este playbook completo. Vas a respetar SIEMPRE los **Principios no negociables (sección 1)**:
> una sola fuente de verdad, métricas derivadas, una sola ruta de mutación, reconciliación por id,
> y seguridad en RLS.
>
> Empieza por la **FASE 0 (diagnóstico)**: abre `AppShell.tsx`, las vistas (`FunnelCanvas`,
> `BoardView`, `TaskDetailPanel`, el Resumen) y `schema_v2_complete.sql`. Dime exactamente:
> (1) si hoy hay un store único o fetches dispersos, (2) qué tablas hijas tienen `project_id`,
> (3) qué políticas RLS de escritura existen, y (4) dónde se reconcilian (o no) los eventos
> realtime. **Entrégame ese informe y un plan antes de tocar código.** No avances a la Fase 1
> hasta que yo confirme. Cuando programes, hazlo en cambios pequeños y dime qué archivos tocas."

---

## 12. Lo que me ayudaría para afinar aún más (responde y reescribo lo que falte)
1. ¿`node_tasks` tiene ya `assigned_to`? ¿y `funnel_nodes` tiene un `responsible_id`/`role`?
2. ¿Ya usas `@supabase/ssr` o el cliente browser clásico para la sesión?
3. ¿El Resumen hoy calcula en vivo o lee conteos guardados?
4. ¿Las suscripciones realtime actuales filtran por `project_id` o traen todo y filtran en el front?
5. ¿Tienes políticas RLS de **UPDATE/INSERT/DELETE** por rol, o solo de SELECT?

Con esas 5 respuestas puedo convertir las secciones 4.4, 6 y el SQL de RLS en migraciones exactas
con tus nombres de columnas reales.
