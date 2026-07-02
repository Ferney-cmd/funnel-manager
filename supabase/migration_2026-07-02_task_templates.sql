-- Migración 2026-07-02: Plantillas de checklist de tareas (Fase 1)
-- Modelo híbrido: cualquiera crea; ver = compartidas + propias; editar/borrar = dueño o super_admin.

BEGIN;

CREATE TABLE IF NOT EXISTS public.task_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  scope      text NOT NULL DEFAULT 'personal' CHECK (scope IN ('personal','shared')),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.task_template_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES public.task_templates(id) ON DELETE CASCADE,
  text        text NOT NULL,
  priority    text NOT NULL DEFAULT 'normal',
  ord         int  NOT NULL DEFAULT 0,
  offset_days int
);
CREATE INDEX IF NOT EXISTS idx_tti_template ON public.task_template_items(template_id);

ALTER TABLE public.task_templates      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_template_items ENABLE ROW LEVEL SECURITY;

-- ── Políticas: task_templates ──
DROP POLICY IF EXISTS tt_select ON public.task_templates;
CREATE POLICY tt_select ON public.task_templates FOR SELECT
  USING (scope = 'shared' OR created_by = auth.uid() OR is_platform_admin());

DROP POLICY IF EXISTS tt_insert ON public.task_templates;
CREATE POLICY tt_insert ON public.task_templates FOR INSERT
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS tt_update ON public.task_templates;
CREATE POLICY tt_update ON public.task_templates FOR UPDATE
  USING (created_by = auth.uid() OR is_platform_admin());

DROP POLICY IF EXISTS tt_delete ON public.task_templates;
CREATE POLICY tt_delete ON public.task_templates FOR DELETE
  USING (created_by = auth.uid() OR is_platform_admin());

-- ── Políticas: task_template_items (siguen al padre) ──
DROP POLICY IF EXISTS tti_select ON public.task_template_items;
CREATE POLICY tti_select ON public.task_template_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.task_templates t
    WHERE t.id = template_id AND (t.scope = 'shared' OR t.created_by = auth.uid() OR is_platform_admin())));

DROP POLICY IF EXISTS tti_write ON public.task_template_items;
CREATE POLICY tti_write ON public.task_template_items FOR ALL
  USING (EXISTS (SELECT 1 FROM public.task_templates t
    WHERE t.id = template_id AND (t.created_by = auth.uid() OR is_platform_admin())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.task_templates t
    WHERE t.id = template_id AND (t.created_by = auth.uid() OR is_platform_admin())));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_templates      TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_template_items TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
