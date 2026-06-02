-- ============================================================
-- FASE 1 — Cimientos de datos (backend) · FunnelManager
-- ============================================================
-- Objetivo: dejar el esquema listo para Mis Tareas / Kanban / Timeline,
-- multi-responsable, invitaciones y RLS por rol — SIN romper la app actual.
--
-- Es 100% idempotente (IF NOT EXISTS / DROP ... IF EXISTS). Re-ejecutable.
-- No elimina node_tasks.assigned_to (la app actual lo sigue usando);
-- se backfillea a task_assignees para la transición a multi-responsable.
--
-- Ejecutar: su - postgres -c "psql -d postgres -f /tmp/fase1.sql"
-- ============================================================

BEGIN;

-- ============================================================
-- 1. HELPER DE ROL POR PROYECTO (la lógica de permisos en un solo lugar)
-- ============================================================
-- Devuelve 'owner' | 'editor' | 'viewer' | NULL para el usuario actual.
-- owner = dueño del proyecto o admin de plataforma.
CREATE OR REPLACE FUNCTION public.my_project_role(pid UUID)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM projects p WHERE p.id = pid AND p.user_id = auth.uid())
      THEN 'owner'
    WHEN EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND platform_role IN ('super_admin','admin'))
      THEN 'owner'
    ELSE (SELECT pm.role FROM project_members pm
          WHERE pm.project_id = pid AND pm.user_id = auth.uid() LIMIT 1)
  END;
$$;

-- Helper de acceso (alias estable; reutiliza la lógica existente).
CREATE OR REPLACE FUNCTION public.can_access_project(pid UUID)
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.my_project_role(pid) IS NOT NULL;
$$;

-- Helpers para resolver el proyecto de una tarea / mensaje / comentario
-- (sirven en políticas de INSERT donde project_id puede no venir del cliente).
CREATE OR REPLACE FUNCTION public.project_of_node(p_node_id TEXT)
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT project_id FROM funnel_nodes WHERE id = p_node_id;
$$;

CREATE OR REPLACE FUNCTION public.project_of_task(p_task_id TEXT)
RETURNS UUID LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT fn.project_id FROM node_tasks t JOIN funnel_nodes fn ON fn.id = t.node_id
  WHERE t.id = p_task_id;
$$;


-- ============================================================
-- 2. DENORMALIZAR project_id EN TABLAS HIJAS (realtime + RLS rápidas)
-- ============================================================
ALTER TABLE public.node_tasks    ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.task_comments ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;
ALTER TABLE public.node_messages ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE;

-- Backfill desde el nodo
UPDATE public.node_tasks t SET project_id = fn.project_id
  FROM public.funnel_nodes fn WHERE t.node_id = fn.id AND t.project_id IS NULL;

UPDATE public.task_comments c SET project_id = fn.project_id
  FROM public.node_tasks t JOIN public.funnel_nodes fn ON fn.id = t.node_id
  WHERE c.task_id = t.id AND c.project_id IS NULL;

UPDATE public.node_messages m SET project_id = fn.project_id
  FROM public.funnel_nodes fn WHERE m.node_id = fn.id AND m.project_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_node_tasks_project    ON public.node_tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_project ON public.task_comments(project_id);
CREATE INDEX IF NOT EXISTS idx_node_messages_project ON public.node_messages(project_id);

-- Triggers BEFORE INSERT: rellenar project_id automáticamente desde el nodo
CREATE OR REPLACE FUNCTION public.set_project_id_from_node()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.project_id IS NULL THEN
    NEW.project_id := public.project_of_node(NEW.node_id);
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.set_project_id_from_task()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.project_id IS NULL THEN
    NEW.project_id := public.project_of_task(NEW.task_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_tasks_project_id    ON public.node_tasks;
CREATE TRIGGER trg_tasks_project_id    BEFORE INSERT ON public.node_tasks
  FOR EACH ROW EXECUTE FUNCTION public.set_project_id_from_node();

DROP TRIGGER IF EXISTS trg_messages_project_id ON public.node_messages;
CREATE TRIGGER trg_messages_project_id BEFORE INSERT ON public.node_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_project_id_from_node();

DROP TRIGGER IF EXISTS trg_comments_project_id ON public.task_comments;
CREATE TRIGGER trg_comments_project_id BEFORE INSERT ON public.task_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_project_id_from_task();


-- ============================================================
-- 3. AMPLIAR node_tasks (lo que necesitan Kanban y Timeline)
-- ============================================================
ALTER TABLE public.node_tasks ADD COLUMN IF NOT EXISTS start_date     DATE;
ALTER TABLE public.node_tasks ADD COLUMN IF NOT EXISTS position       INTEGER DEFAULT 0;
ALTER TABLE public.node_tasks ADD COLUMN IF NOT EXISTS is_milestone   BOOLEAN DEFAULT FALSE;
ALTER TABLE public.node_tasks ADD COLUMN IF NOT EXISTS parent_task_id TEXT REFERENCES public.node_tasks(id) ON DELETE CASCADE;
ALTER TABLE public.node_tasks ADD COLUMN IF NOT EXISTS status_id      UUID;  -- FK se agrega tras crear task_statuses

-- position = ord actual (orden ya existente)
UPDATE public.node_tasks SET position = ord WHERE position = 0 AND ord IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_node_tasks_parent ON public.node_tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_node_tasks_status ON public.node_tasks(status_id);


-- ============================================================
-- 4. ESTADOS PERSONALIZABLES POR PROYECTO (Kanban / Resumen)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.task_statuses (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  color      TEXT        DEFAULT '#6B7280',
  category   TEXT        NOT NULL DEFAULT 'todo' CHECK (category IN ('todo','in_progress','done')),
  position   INTEGER     DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_task_statuses_project ON public.task_statuses(project_id);

-- FK de node_tasks.status_id → task_statuses (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'node_tasks_status_id_fkey'
  ) THEN
    ALTER TABLE public.node_tasks
      ADD CONSTRAINT node_tasks_status_id_fkey
      FOREIGN KEY (status_id) REFERENCES public.task_statuses(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Semilla: 4 estados por proyecto que aún no tenga ninguno
INSERT INTO public.task_statuses (project_id, name, color, category, position)
SELECT p.id, s.name, s.color, s.category, s.pos
FROM public.projects p
CROSS JOIN (VALUES
  ('Pendiente',   '#6B7280', 'todo',        0),
  ('En progreso', '#F59E0B', 'in_progress', 1),
  ('En revisión', '#6366F1', 'in_progress', 2),
  ('Hecho',       '#10B981', 'done',        3)
) AS s(name, color, category, pos)
WHERE NOT EXISTS (SELECT 1 FROM public.task_statuses ts WHERE ts.project_id = p.id);

-- Backfill: tareas done → estado 'Hecho'; resto → 'Pendiente'
UPDATE public.node_tasks t SET status_id = ts.id
FROM public.task_statuses ts
WHERE t.status_id IS NULL AND ts.project_id = t.project_id
  AND ts.category = (CASE WHEN t.done THEN 'done' ELSE 'todo' END)
  AND ts.position = (CASE WHEN t.done THEN 3 ELSE 0 END);


-- ============================================================
-- 5. MULTI-RESPONSABLE (task_assignees) — migra assigned_to
-- ============================================================
CREATE TABLE IF NOT EXISTS public.task_assignees (
  task_id     TEXT        NOT NULL REFERENCES public.node_tasks(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (task_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_task_assignees_user ON public.task_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_task_assignees_task ON public.task_assignees(task_id);

-- Backfill desde el responsable único actual
INSERT INTO public.task_assignees (task_id, user_id)
SELECT id, assigned_to FROM public.node_tasks
WHERE assigned_to IS NOT NULL
ON CONFLICT (task_id, user_id) DO NOTHING;


-- ============================================================
-- 6. INVITACIONES + auto-enlace al registrarse
-- ============================================================
CREATE TABLE IF NOT EXISTS public.invitations (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID        NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  email      TEXT        NOT NULL,
  role       TEXT        NOT NULL DEFAULT 'editor' CHECK (role IN ('editor','viewer')),
  invited_by UUID        REFERENCES public.profiles(id),
  status     TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '14 days'
);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON public.invitations (lower(email)) WHERE status = 'pending';

-- Al crearse un profile (tras signup), enlazar invitaciones pendientes de ese email.
CREATE OR REPLACE FUNCTION public.link_pending_invitations()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
BEGIN
  INSERT INTO public.project_members (project_id, user_id, role)
  SELECT i.project_id, NEW.id, i.role
  FROM public.invitations i
  WHERE lower(i.email) = lower(NEW.email) AND i.status = 'pending'
  ON CONFLICT (project_id, user_id) DO NOTHING;

  UPDATE public.invitations
  SET status = 'accepted'
  WHERE lower(email) = lower(NEW.email) AND status = 'pending';

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_profile_created_link_invites ON public.profiles;
CREATE TRIGGER on_profile_created_link_invites
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.link_pending_invitations();


-- ============================================================
-- 7. RLS POR ROL — lectura para miembros, escritura para owner/editor
-- ============================================================
ALTER TABLE public.task_statuses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations    ENABLE ROW LEVEL SECURITY;

-- ── FUNNEL_NODES ──
DROP POLICY IF EXISTS "nodes_access" ON public.funnel_nodes;
DROP POLICY IF EXISTS "nodes_select" ON public.funnel_nodes;
DROP POLICY IF EXISTS "nodes_write"  ON public.funnel_nodes;
CREATE POLICY "nodes_select" ON public.funnel_nodes
  FOR SELECT USING (public.can_access_project(project_id));
CREATE POLICY "nodes_write" ON public.funnel_nodes
  FOR ALL USING (public.my_project_role(project_id) IN ('owner','editor'))
  WITH CHECK (public.my_project_role(project_id) IN ('owner','editor'));

-- ── FUNNEL_EDGES ──
DROP POLICY IF EXISTS "edges_access" ON public.funnel_edges;
DROP POLICY IF EXISTS "edges_select" ON public.funnel_edges;
DROP POLICY IF EXISTS "edges_write"  ON public.funnel_edges;
CREATE POLICY "edges_select" ON public.funnel_edges
  FOR SELECT USING (public.can_access_project(project_id));
CREATE POLICY "edges_write" ON public.funnel_edges
  FOR ALL USING (public.my_project_role(project_id) IN ('owner','editor'))
  WITH CHECK (public.my_project_role(project_id) IN ('owner','editor'));

-- ── FUNNEL_ZONES ──
DROP POLICY IF EXISTS "zones_access" ON public.funnel_zones;
DROP POLICY IF EXISTS "zones_select" ON public.funnel_zones;
DROP POLICY IF EXISTS "zones_write"  ON public.funnel_zones;
CREATE POLICY "zones_select" ON public.funnel_zones
  FOR SELECT USING (public.can_access_project(project_id));
CREATE POLICY "zones_write" ON public.funnel_zones
  FOR ALL USING (public.my_project_role(project_id) IN ('owner','editor'))
  WITH CHECK (public.my_project_role(project_id) IN ('owner','editor'));

-- ── NODE_TASKS ── (lectura miembros; escritura owner/editor)
DROP POLICY IF EXISTS "tasks_access" ON public.node_tasks;
DROP POLICY IF EXISTS "tasks_select" ON public.node_tasks;
DROP POLICY IF EXISTS "tasks_write"  ON public.node_tasks;
CREATE POLICY "tasks_select" ON public.node_tasks
  FOR SELECT USING (public.can_access_project(public.project_of_node(node_id)));
CREATE POLICY "tasks_write" ON public.node_tasks
  FOR ALL USING (public.my_project_role(public.project_of_node(node_id)) IN ('owner','editor'))
  WITH CHECK (public.my_project_role(public.project_of_node(node_id)) IN ('owner','editor'));

-- ── TASK_ASSIGNEES ── (lectura miembros; escritura owner/editor)
DROP POLICY IF EXISTS "task_assignees_select" ON public.task_assignees;
DROP POLICY IF EXISTS "task_assignees_write"  ON public.task_assignees;
CREATE POLICY "task_assignees_select" ON public.task_assignees
  FOR SELECT USING (public.can_access_project(public.project_of_task(task_id)));
CREATE POLICY "task_assignees_write" ON public.task_assignees
  FOR ALL USING (public.my_project_role(public.project_of_task(task_id)) IN ('owner','editor'))
  WITH CHECK (public.my_project_role(public.project_of_task(task_id)) IN ('owner','editor'));

-- ── TASK_STATUSES ── (lectura miembros; escritura owner/editor)
DROP POLICY IF EXISTS "task_statuses_select" ON public.task_statuses;
DROP POLICY IF EXISTS "task_statuses_write"  ON public.task_statuses;
CREATE POLICY "task_statuses_select" ON public.task_statuses
  FOR SELECT USING (public.can_access_project(project_id));
CREATE POLICY "task_statuses_write" ON public.task_statuses
  FOR ALL USING (public.my_project_role(project_id) IN ('owner','editor'))
  WITH CHECK (public.my_project_role(project_id) IN ('owner','editor'));

-- ── TASK_COMMENTS ── (viewer SÍ puede comentar; editar/borrar solo autor u owner)
DROP POLICY IF EXISTS "task_comments_access" ON public.task_comments;
DROP POLICY IF EXISTS "task_comments_select" ON public.task_comments;
DROP POLICY IF EXISTS "task_comments_insert" ON public.task_comments;
DROP POLICY IF EXISTS "task_comments_modify" ON public.task_comments;
CREATE POLICY "task_comments_select" ON public.task_comments
  FOR SELECT USING (public.can_access_project(public.project_of_task(task_id)));
CREATE POLICY "task_comments_insert" ON public.task_comments
  FOR INSERT WITH CHECK (public.can_access_project(public.project_of_task(task_id)));
CREATE POLICY "task_comments_modify" ON public.task_comments
  FOR UPDATE USING (user_id = auth.uid()::text OR public.my_project_role(public.project_of_task(task_id)) = 'owner');
CREATE POLICY "task_comments_delete" ON public.task_comments
  FOR DELETE USING (user_id = auth.uid()::text OR public.my_project_role(public.project_of_task(task_id)) = 'owner');

-- ── NODE_MESSAGES ── (chat: cualquier miembro escribe; editar/borrar autor u owner)
DROP POLICY IF EXISTS "messages_access" ON public.node_messages;
DROP POLICY IF EXISTS "messages_select" ON public.node_messages;
DROP POLICY IF EXISTS "messages_insert" ON public.node_messages;
DROP POLICY IF EXISTS "messages_modify" ON public.node_messages;
DROP POLICY IF EXISTS "messages_delete" ON public.node_messages;
CREATE POLICY "messages_select" ON public.node_messages
  FOR SELECT USING (public.can_access_project(public.project_of_node(node_id)));
CREATE POLICY "messages_insert" ON public.node_messages
  FOR INSERT WITH CHECK (public.can_access_project(public.project_of_node(node_id)));
CREATE POLICY "messages_modify" ON public.node_messages
  FOR UPDATE USING (user_id = auth.uid()::text OR public.my_project_role(public.project_of_node(node_id)) = 'owner');
CREATE POLICY "messages_delete" ON public.node_messages
  FOR DELETE USING (user_id = auth.uid()::text OR public.my_project_role(public.project_of_node(node_id)) = 'owner');

-- ── INVITATIONS ── (gestiona owner/editor del proyecto)
DROP POLICY IF EXISTS "invitations_access" ON public.invitations;
CREATE POLICY "invitations_access" ON public.invitations
  FOR ALL USING (public.my_project_role(project_id) IN ('owner','editor'))
  WITH CHECK (public.my_project_role(project_id) IN ('owner','editor'));


-- ============================================================
-- 8. REALTIME — añadir las tablas del dominio a la publicación
-- ============================================================
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'node_tasks','node_messages','task_comments','task_assignees','task_statuses','invitations'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

COMMIT;

-- ============================================================
-- VERIFICACIÓN rápida (no modifica nada)
-- ============================================================
SELECT 'task_statuses por proyecto' AS check, count(*) AS filas FROM public.task_statuses
UNION ALL SELECT 'task_assignees (backfill)', count(*) FROM public.task_assignees
UNION ALL SELECT 'node_tasks con project_id', count(*) FROM public.node_tasks WHERE project_id IS NOT NULL
UNION ALL SELECT 'node_tasks con status_id',  count(*) FROM public.node_tasks WHERE status_id IS NOT NULL;
