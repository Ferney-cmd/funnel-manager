-- Migración 2026-06-25
-- 1) Degradar rol 'admin' (deja de ser global; solo super_admin tiene poder global)
-- 2) Registro libre: cualquier autenticado crea sus propios proyectos (Cliente raíz o Proyecto sub)
-- 3) Sembrar estados Kanban por defecto al crear proyecto + backfill a los existentes
-- 4) Bajar a 'user' a todos los super_admin salvo las dos cuentas Ferney

BEGIN;

-- ── 1) Solo super_admin = poder global ───────────────────────────────
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
  SELECT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND platform_role = 'super_admin');
$fn$;

CREATE OR REPLACE FUNCTION public.user_owns_project(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
  SELECT EXISTS (SELECT 1 FROM projects p WHERE p.id = p_project_id AND p.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND platform_role = 'super_admin');
$fn$;

CREATE OR REPLACE FUNCTION public.user_can_access_project(p_project_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $fn$
  SELECT EXISTS (SELECT 1 FROM projects p WHERE p.id = p_project_id AND p.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id = p_project_id AND pm.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND platform_role = 'super_admin');
$fn$;

CREATE OR REPLACE FUNCTION public.my_project_role(pid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM projects p WHERE p.id = pid AND p.user_id = auth.uid()) THEN 'owner'
    WHEN EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND platform_role = 'super_admin') THEN 'owner'
    ELSE (SELECT pm.role FROM project_members pm WHERE pm.project_id = pid AND pm.user_id = auth.uid() LIMIT 1)
  END;
$fn$;

-- ── 2) Registro libre: cualquier autenticado crea sus propios proyectos ──
DROP POLICY IF EXISTS projects_insert ON projects;
CREATE POLICY projects_insert ON projects
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- ── 3) Estados Kanban por defecto en cada proyecto nuevo + backfill ──────
CREATE OR REPLACE FUNCTION public.seed_default_task_statuses()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $fn$
BEGIN
  INSERT INTO task_statuses (project_id, name, color, category, position) VALUES
    (NEW.id, 'Pendiente',   '#6B7280', 'todo',        0),
    (NEW.id, 'En progreso', '#F59E0B', 'in_progress', 1),
    (NEW.id, 'En revisión', '#6366F1', 'in_progress', 2),
    (NEW.id, 'Hecho',       '#10B981', 'done',        3);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_seed_task_statuses ON projects;
CREATE TRIGGER trg_seed_task_statuses
  AFTER INSERT ON projects
  FOR EACH ROW EXECUTE FUNCTION seed_default_task_statuses();

INSERT INTO task_statuses (project_id, name, color, category, position)
SELECT p.id, v.name, v.color, v.category, v.position
FROM projects p
CROSS JOIN (VALUES
  ('Pendiente','#6B7280','todo',0),
  ('En progreso','#F59E0B','in_progress',1),
  ('En revisión','#6366F1','in_progress',2),
  ('Hecho','#10B981','done',3)
) AS v(name,color,category,position)
WHERE NOT EXISTS (SELECT 1 FROM task_statuses ts WHERE ts.project_id = p.id);

-- ── 4) Degradar super_admins salvo las dos cuentas Ferney ────────────────
UPDATE profiles SET platform_role = 'user'
WHERE platform_role <> 'user'
  AND email NOT IN ('fernei@inditecsolutions.com','ferney25898@gmail.com');

COMMIT;
