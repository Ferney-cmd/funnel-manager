import { createClient } from "@supabase/supabase-js";

/**
 * Cliente de Supabase con SERVICE ROLE (sin sesión de browser).
 * Úsalo SOLO en server-side (rutas protegidas por secreto, crons).
 * Salta RLS: hay que filtrar SIEMPRE por user_id explícitamente.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
