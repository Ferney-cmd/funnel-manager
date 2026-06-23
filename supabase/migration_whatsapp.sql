-- ============================================================
-- WhatsApp: vínculo cuenta ↔ número + códigos de un solo uso
-- El servicio Baileys / la ruta /api/whatsapp/* usan SERVICE ROLE
-- (sin sesión) y por eso pueden saltarse RLS; las policies de abajo
-- son para que el usuario gestione SU propio vínculo desde la app.
-- ============================================================

-- Vínculo WhatsApp ↔ usuario (un número por usuario)
CREATE TABLE IF NOT EXISTS public.whatsapp_links (
  user_id   uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  phone     text UNIQUE NOT NULL,          -- solo dígitos, ej. 573208839619
  linked_at timestamptz DEFAULT now()
);
ALTER TABLE public.whatsapp_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS whatsapp_links_own ON public.whatsapp_links;
CREATE POLICY whatsapp_links_own ON public.whatsapp_links
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Códigos de vínculo de un solo uso (se generan en la app, se escriben al bot)
CREATE TABLE IF NOT EXISTS public.whatsapp_link_codes (
  code       text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used       boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE public.whatsapp_link_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_codes_own ON public.whatsapp_link_codes;
CREATE POLICY wa_codes_own ON public.whatsapp_link_codes
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_wa_codes_user ON public.whatsapp_link_codes(user_id);
