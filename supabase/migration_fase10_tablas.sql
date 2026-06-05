-- =============================================================
-- migration_fase10_tablas.sql
-- Fase 10: saved_views, notifications, task_dependencies,
--          custom_fields, custom_field_values
-- Idempotent — safe to re-run (CREATE ... IF NOT EXISTS throughout)
-- =============================================================

-- -------------------------------------------------------------
-- 1. saved_views
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.saved_views (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  owner_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL DEFAULT 'list' CHECK (type IN ('list','kanban','calendar','timeline')),
  config      JSONB NOT NULL DEFAULT '{}',
  is_shared   BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_views_project ON public.saved_views(project_id);
CREATE INDEX IF NOT EXISTS idx_saved_views_owner   ON public.saved_views(owner_id);

ALTER TABLE public.saved_views ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'saved_views' AND policyname = 'saved_views_owner'
  ) THEN
    CREATE POLICY "saved_views_owner" ON public.saved_views
      FOR ALL USING (owner_id = auth.uid())
      WITH CHECK (owner_id = auth.uid());
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'saved_views' AND policyname = 'saved_views_shared'
  ) THEN
    CREATE POLICY "saved_views_shared" ON public.saved_views
      FOR SELECT USING (is_shared = true AND user_can_access_project(project_id));
  END IF;
END $$;

-- -------------------------------------------------------------
-- 2. notifications
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT DEFAULT '',
  project_id  UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id     TEXT REFERENCES public.node_tasks(id) ON DELETE CASCADE,
  actor_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  read        BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user    ON public.notifications(user_id, read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_project ON public.notifications(project_id);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'notifications' AND policyname = 'notifications_own'
  ) THEN
    CREATE POLICY "notifications_own" ON public.notifications
      FOR ALL USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END $$;

-- -------------------------------------------------------------
-- 3. task_dependencies
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.task_dependencies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id         TEXT REFERENCES public.node_tasks(id) ON DELETE CASCADE NOT NULL,
  depends_on_id   TEXT REFERENCES public.node_tasks(id) ON DELETE CASCADE NOT NULL,
  project_id      UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (task_id, depends_on_id)
);

CREATE INDEX IF NOT EXISTS idx_task_deps_task ON public.task_dependencies(task_id);

ALTER TABLE public.task_dependencies ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'task_dependencies' AND policyname = 'task_deps_access'
  ) THEN
    CREATE POLICY "task_deps_access" ON public.task_dependencies
      FOR ALL USING (user_can_access_project(project_id))
      WITH CHECK (user_can_access_project(project_id));
  END IF;
END $$;

-- -------------------------------------------------------------
-- 4a. custom_fields
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_fields (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL CHECK (type IN ('text','number','select','checkbox','date','url')),
  options     JSONB,
  position    INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_custom_fields_project ON public.custom_fields(project_id);

ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'custom_fields' AND policyname = 'custom_fields_access'
  ) THEN
    CREATE POLICY "custom_fields_access" ON public.custom_fields
      FOR SELECT USING (user_can_access_project(project_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'custom_fields' AND policyname = 'custom_fields_write'
  ) THEN
    CREATE POLICY "custom_fields_write" ON public.custom_fields
      FOR ALL USING (my_project_role(project_id) IN ('owner','editor'))
      WITH CHECK (my_project_role(project_id) IN ('owner','editor'));
  END IF;
END $$;

-- -------------------------------------------------------------
-- 4b. custom_field_values
-- -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.custom_field_values (
  task_id     TEXT REFERENCES public.node_tasks(id) ON DELETE CASCADE NOT NULL,
  field_id    UUID REFERENCES public.custom_fields(id) ON DELETE CASCADE NOT NULL,
  project_id  UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  value       JSONB,
  PRIMARY KEY (task_id, field_id)
);

ALTER TABLE public.custom_field_values ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'custom_field_values' AND policyname = 'cfv_access'
  ) THEN
    CREATE POLICY "cfv_access" ON public.custom_field_values
      FOR SELECT USING (user_can_access_project(project_id));
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'custom_field_values' AND policyname = 'cfv_write'
  ) THEN
    CREATE POLICY "cfv_write" ON public.custom_field_values
      FOR ALL USING (my_project_role(project_id) IN ('owner','editor'))
      WITH CHECK (my_project_role(project_id) IN ('owner','editor'));
  END IF;
END $$;

-- -------------------------------------------------------------
-- 5. Realtime publication (idempotent)
-- -------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['saved_views','notifications','task_dependencies','custom_fields','custom_field_values'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
