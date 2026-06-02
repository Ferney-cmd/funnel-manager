-- ============================================================
-- HOTFIX — Cerrar los 2 gaps entre el código y la BD desplegada
-- ============================================================
-- El schema_v2_complete.sql NO incluía:
--   1) node_tasks.assigned_to  (el código asigna responsables)
--   2) la tabla task_comments  (el panel de detalle lee/escribe comentarios)
-- Sin esto, "asignar tarea" y "comentar" fallan en producción.
--
-- Es seguro re-ejecutarlo (usa IF NOT EXISTS / IF EXISTS).
-- Ejecutar como: su - postgres -c "psql -d postgres -f /tmp/hotfix.sql"
-- ============================================================

-- ── 1. Responsable de tarea (responsable único; el roadmap migra a multi en Fase 1) ──
ALTER TABLE public.node_tasks
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_node_tasks_assigned_to ON public.node_tasks(assigned_to);


-- ── 2. Comentarios por tarea ──
CREATE TABLE IF NOT EXISTS public.task_comments (
  id            TEXT        PRIMARY KEY,
  task_id       TEXT        NOT NULL REFERENCES public.node_tasks(id) ON DELETE CASCADE,
  user_id       TEXT        DEFAULT '',
  user_name     TEXT        DEFAULT '',
  user_initials TEXT        DEFAULT '',
  user_color    TEXT        DEFAULT '#7C3AED',
  text          TEXT        NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON public.task_comments(task_id);

ALTER TABLE public.task_comments ENABLE ROW LEVEL SECURITY;

-- Acceso: solo si el usuario puede acceder al proyecto dueño de la tarea.
DROP POLICY IF EXISTS "task_comments_access" ON public.task_comments;
CREATE POLICY "task_comments_access" ON public.task_comments
  FOR ALL USING (
    task_id IN (
      SELECT t.id
      FROM public.node_tasks t
      JOIN public.funnel_nodes fn ON fn.id = t.node_id
      WHERE public.user_can_access_project(fn.project_id)
    )
  )
  WITH CHECK (
    task_id IN (
      SELECT t.id
      FROM public.node_tasks t
      JOIN public.funnel_nodes fn ON fn.id = t.node_id
      WHERE public.user_can_access_project(fn.project_id)
    )
  );

-- Realtime para comentarios (idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'task_comments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comments;
  END IF;
END $$;
