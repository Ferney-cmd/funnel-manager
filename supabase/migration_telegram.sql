-- ============================================================
-- Telegram: vínculo cuenta ↔ chat_id (reutiliza whatsapp_link_codes
-- para el código, que es agnóstico al canal: code → user_id).
-- ============================================================
CREATE TABLE IF NOT EXISTS public.telegram_links (
  user_id   uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  chat_id   bigint UNIQUE NOT NULL,
  username  text,
  linked_at timestamptz DEFAULT now()
);
ALTER TABLE public.telegram_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS telegram_links_own ON public.telegram_links;
CREATE POLICY telegram_links_own ON public.telegram_links
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
