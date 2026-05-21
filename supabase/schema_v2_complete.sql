-- ============================================================
-- FunnelManager — Schema v2 COMPLETO (para nuevo Supabase)
-- Ejecutar TODO en: Supabase Dashboard → SQL Editor
-- Incluye: roles plataforma, subproyectos, fechas/alertas, RLS multi-usuario
-- ============================================================

-- ============================================================
-- 1. PROFILES (con platform_role)
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id            UUID        REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name     TEXT        NOT NULL DEFAULT '',
  email         TEXT,
  color         TEXT        DEFAULT '#7C3AED',
  avatar_url    TEXT,
  platform_role TEXT        DEFAULT 'user' CHECK (platform_role IN ('super_admin', 'admin', 'user')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. PROJECTS (con subproyectos, descripción y fechas)
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id                 UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id            UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  parent_project_id  UUID        REFERENCES projects(id) ON DELETE CASCADE,
  name               TEXT        NOT NULL,
  description        TEXT        DEFAULT '',
  client             TEXT        DEFAULT '',
  status             TEXT        DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'blocked')),
  start_date         DATE,
  end_date           DATE,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projects_parent ON projects(parent_project_id);

-- ============================================================
-- 3. PROJECT_MEMBERS (multi-usuario)
-- ============================================================
CREATE TABLE IF NOT EXISTS project_members (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  UUID        REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id     UUID        REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role        TEXT        DEFAULT 'viewer' CHECK (role IN ('owner', 'editor', 'viewer')),
  invited_by  UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

-- ============================================================
-- 4. FUNNEL_NODES (módulos del embudo)
-- ============================================================
CREATE TABLE IF NOT EXISTS funnel_nodes (
  id             TEXT        PRIMARY KEY,
  project_id     UUID        REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  title          TEXT        NOT NULL,
  subtitle       TEXT        DEFAULT '',
  icon           TEXT        DEFAULT '📦',
  role           TEXT        NOT NULL DEFAULT 'ghl',
  owner_initials TEXT        DEFAULT '',
  owner_color    TEXT        DEFAULT '#7C3AED',
  assigned_to    UUID        REFERENCES profiles(id),
  has_unread     BOOLEAN     DEFAULT FALSE,
  position_x     FLOAT       DEFAULT 0,
  position_y     FLOAT       DEFAULT 160,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 5. NODE_TASKS (con fecha límite y descripción)
-- ============================================================
CREATE TABLE IF NOT EXISTS node_tasks (
  id           TEXT        PRIMARY KEY,
  node_id      TEXT        REFERENCES funnel_nodes(id) ON DELETE CASCADE NOT NULL,
  text         TEXT        NOT NULL,
  description  TEXT        DEFAULT '',
  done         BOOLEAN     DEFAULT FALSE,
  ord          INTEGER     DEFAULT 0,
  due_date     DATE,
  priority     TEXT        DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON node_tasks(due_date) WHERE done = FALSE;

-- ============================================================
-- 6. NODE_MESSAGES (chat + adjuntos + read_by)
-- ============================================================
CREATE TABLE IF NOT EXISTS node_messages (
  id             TEXT        PRIMARY KEY,
  node_id        TEXT        REFERENCES funnel_nodes(id) ON DELETE CASCADE NOT NULL,
  user_id        TEXT        DEFAULT '',
  user_name      TEXT        DEFAULT '',
  user_initials  TEXT        DEFAULT '',
  user_color     TEXT        DEFAULT '#7C3AED',
  text           TEXT        NOT NULL,
  is_me          BOOLEAN     DEFAULT FALSE,
  file_url       TEXT,
  file_type      TEXT,
  read_by        TEXT[]      DEFAULT '{}',
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 7. FUNNEL_EDGES (conexiones entre nodos)
-- ============================================================
CREATE TABLE IF NOT EXISTS funnel_edges (
  id            TEXT    PRIMARY KEY,
  project_id    UUID    REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  source        TEXT    NOT NULL,
  target        TEXT    NOT NULL,
  source_handle TEXT    DEFAULT NULL,
  target_handle TEXT    DEFAULT NULL,
  animated      BOOLEAN DEFAULT FALSE,
  dashed        BOOLEAN DEFAULT FALSE,
  label         TEXT    DEFAULT NULL
);

-- ============================================================
-- 8. FUNNEL_ZONES (zonas arrastrables del canvas)
-- ============================================================
CREATE TABLE IF NOT EXISTS funnel_zones (
  id          TEXT        PRIMARY KEY,
  project_id  UUID        REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  label       TEXT        NOT NULL DEFAULT 'Nueva Zona',
  color       TEXT        NOT NULL DEFAULT '#7C3AED',
  position_x  FLOAT       NOT NULL DEFAULT 60,
  position_y  FLOAT       NOT NULL DEFAULT 60,
  width       FLOAT       NOT NULL DEFAULT 360,
  height      FLOAT       NOT NULL DEFAULT 260,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 9. PROJECT_DOCS (documentos por proyecto)
-- ============================================================
CREATE TABLE IF NOT EXISTS project_docs (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id  UUID        REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  node_id     TEXT        REFERENCES funnel_nodes(id) ON DELETE CASCADE,
  title       TEXT        NOT NULL,
  content     TEXT        DEFAULT '',
  file_url    TEXT,
  uploaded_by UUID        REFERENCES profiles(id),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 10. FUNCIONES AUXILIARES
-- ============================================================

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  palette TEXT[] := ARRAY['#7C3AED','#10B981','#3B82F6','#F59E0B','#E24B4A','#6366F1','#EC4899','#8B5CF6'];
  c       TEXT;
  is_first BOOLEAN;
BEGIN
  c := palette[1 + (abs(hashtext(NEW.id::text)) % array_length(palette, 1))];

  -- ¿Es el primer usuario? Lo hacemos super_admin automáticamente
  SELECT NOT EXISTS (SELECT 1 FROM profiles) INTO is_first;

  INSERT INTO profiles (id, email, full_name, color, platform_role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    c,
    CASE WHEN is_first THEN 'super_admin' ELSE 'user' END
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Marcar mensajes como leídos
CREATE OR REPLACE FUNCTION mark_node_messages_read(
  p_node_id  TEXT,
  p_user_id  TEXT
)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE node_messages
  SET    read_by = array_append(read_by, p_user_id)
  WHERE  node_id  = p_node_id
    AND  user_id != p_user_id
    AND  NOT (p_user_id = ANY(read_by));
$$;

-- Función para chequear si user puede acceder a proyecto (rompe recursión RLS)
CREATE OR REPLACE FUNCTION user_can_access_project(p_project_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects p WHERE p.id = p_project_id AND p.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM project_members pm WHERE pm.project_id = p_project_id AND pm.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND platform_role IN ('super_admin', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION user_owns_project(p_project_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects p WHERE p.id = p_project_id AND p.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND platform_role IN ('super_admin', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_platform_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND platform_role IN ('super_admin', 'admin')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- 11. VISTA: Tareas con estado de alerta (por vencer / vencidas)
-- ============================================================
CREATE OR REPLACE VIEW tasks_with_alerts AS
SELECT
  t.*,
  fn.project_id,
  fn.title AS node_title,
  CASE
    WHEN t.done THEN 'done'
    WHEN t.due_date IS NULL THEN 'no_date'
    WHEN t.due_date < CURRENT_DATE THEN 'overdue'
    WHEN t.due_date = CURRENT_DATE THEN 'due_today'
    WHEN t.due_date <= CURRENT_DATE + INTERVAL '1 day' THEN 'due_tomorrow'
    WHEN t.due_date <= CURRENT_DATE + INTERVAL '3 days' THEN 'due_soon'
    ELSE 'on_track'
  END AS alert_status
FROM node_tasks t
JOIN funnel_nodes fn ON fn.id = t.node_id;

GRANT SELECT ON tasks_with_alerts TO authenticated;

-- ============================================================
-- 12. TRIGGERS
-- ============================================================
DROP TRIGGER IF EXISTS projects_updated_at ON projects;
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS profiles_touch_updated ON profiles;
CREATE TRIGGER profiles_touch_updated
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS project_docs_updated_at ON project_docs;
CREATE TRIGGER project_docs_updated_at
  BEFORE UPDATE ON project_docs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- 13. ROW LEVEL SECURITY
-- ============================================================
ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_nodes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE node_tasks       ENABLE ROW LEVEL SECURITY;
ALTER TABLE node_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_edges     ENABLE ROW LEVEL SECURITY;
ALTER TABLE funnel_zones     ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_docs     ENABLE ROW LEVEL SECURITY;

-- ── PROFILES ──
-- Todos los autenticados pueden leer perfiles (para mostrar avatares, asignaciones, etc.)
CREATE POLICY "profiles_read_authenticated" ON profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- Admin puede actualizar cualquier perfil (para cambiar roles)
CREATE POLICY "profiles_admin_update" ON profiles
  FOR UPDATE USING (is_platform_admin());

-- ── PROJECTS ──
-- Ver: dueño, miembro o admin de plataforma
CREATE POLICY "projects_select" ON projects
  FOR SELECT USING (
    user_id = auth.uid()
    OR id IN (SELECT project_id FROM project_members WHERE user_id = auth.uid())
    OR is_platform_admin()
  );

-- Crear: solo admin/super_admin pueden crear proyectos raíz; cualquier user puede crear subproyectos en proyectos donde es owner/editor
CREATE POLICY "projects_insert" ON projects
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (
      is_platform_admin()
      OR (parent_project_id IS NOT NULL AND user_can_access_project(parent_project_id))
    )
  );

CREATE POLICY "projects_update" ON projects
  FOR UPDATE USING (user_id = auth.uid() OR is_platform_admin());

CREATE POLICY "projects_delete" ON projects
  FOR DELETE USING (user_id = auth.uid() OR is_platform_admin());

-- ── PROJECT_MEMBERS ──
CREATE POLICY "members_owner_manage" ON project_members
  FOR ALL USING (user_owns_project(project_id))
  WITH CHECK (user_owns_project(project_id));

CREATE POLICY "members_self_read" ON project_members
  FOR SELECT USING (user_id = auth.uid());

-- ── NODES, EDGES, ZONES ──
CREATE POLICY "nodes_access" ON funnel_nodes
  FOR ALL USING (user_can_access_project(project_id))
  WITH CHECK (user_can_access_project(project_id));

CREATE POLICY "edges_access" ON funnel_edges
  FOR ALL USING (user_can_access_project(project_id))
  WITH CHECK (user_can_access_project(project_id));

CREATE POLICY "zones_access" ON funnel_zones
  FOR ALL USING (user_can_access_project(project_id))
  WITH CHECK (user_can_access_project(project_id));

-- ── TASKS & MESSAGES (via node) ──
CREATE POLICY "tasks_access" ON node_tasks
  FOR ALL USING (
    node_id IN (SELECT id FROM funnel_nodes WHERE user_can_access_project(project_id))
  )
  WITH CHECK (
    node_id IN (SELECT id FROM funnel_nodes WHERE user_can_access_project(project_id))
  );

CREATE POLICY "messages_access" ON node_messages
  FOR ALL USING (
    node_id IN (SELECT id FROM funnel_nodes WHERE user_can_access_project(project_id))
  )
  WITH CHECK (
    node_id IN (SELECT id FROM funnel_nodes WHERE user_can_access_project(project_id))
  );

-- ── PROJECT_DOCS ──
CREATE POLICY "docs_access" ON project_docs
  FOR ALL USING (user_can_access_project(project_id))
  WITH CHECK (user_can_access_project(project_id));

-- ============================================================
-- 14. REALTIME PUBLICATION
-- ============================================================
ALTER PUBLICATION supabase_realtime ADD TABLE node_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE node_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE funnel_nodes;
ALTER PUBLICATION supabase_realtime ADD TABLE funnel_edges;
ALTER PUBLICATION supabase_realtime ADD TABLE projects;

-- ============================================================
-- 15. STORAGE BUCKET (adjuntos)
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
  VALUES ('node-attachments', 'node-attachments', true)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authed users can upload attachments"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'node-attachments');

CREATE POLICY "Public can read attachments"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'node-attachments');

CREATE POLICY "Users can delete own attachments"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'node-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);

-- ============================================================
-- FIN — Schema v2 listo para producción
-- ============================================================
