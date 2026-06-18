-- ============================================================
-- task_notes — descripciones/notas con fecha por tarea
-- Append-only: cada entrada conserva su fecha de creación.
-- RLS replica el patrón de task_comments.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.task_notes (
  id          text PRIMARY KEY,
  task_id     text NOT NULL REFERENCES public.node_tasks(id) ON DELETE CASCADE,
  project_id  uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id     text DEFAULT '',
  user_name   text DEFAULT '',
  user_color  text DEFAULT '#7C3AED',
  text        text NOT NULL,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_task_notes_task_id ON public.task_notes(task_id);
CREATE INDEX IF NOT EXISTS idx_task_notes_project ON public.task_notes(project_id);

ALTER TABLE public.task_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS task_notes_select ON public.task_notes;
CREATE POLICY task_notes_select ON public.task_notes
  FOR SELECT USING (can_access_project(project_of_task(task_id)));

DROP POLICY IF EXISTS task_notes_insert ON public.task_notes;
CREATE POLICY task_notes_insert ON public.task_notes
  FOR INSERT WITH CHECK (can_access_project(project_of_task(task_id)));

DROP POLICY IF EXISTS task_notes_delete ON public.task_notes;
CREATE POLICY task_notes_delete ON public.task_notes
  FOR DELETE USING (
    (user_id = (uid())::text) OR (my_project_role(project_of_task(task_id)) = 'owner')
  );

-- Realtime (ignora error si ya está en la publicación)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.task_notes;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
