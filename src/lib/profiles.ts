import { createClient } from "./supabase/client";

export type PlatformRole = "super_admin" | "admin" | "user";

export interface Profile {
  id:            string;
  full_name:     string;
  email:         string;
  color:         string;
  platform_role: PlatformRole;
}

export function isPlatformAdmin(p: Profile | null): boolean {
  return p?.platform_role === "super_admin" || p?.platform_role === "admin";
}

export function isSuperAdmin(p: Profile | null): boolean {
  return p?.platform_role === "super_admin";
}

const cache = new Map<string, Profile>();
let currentProfilePromise: Promise<Profile | null> | null = null;

export function getInitials(name: string): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export async function getCurrentProfile(): Promise<Profile | null> {
  if (currentProfilePromise) return currentProfilePromise;
  currentProfilePromise = (async () => {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email, color, platform_role")
      .eq("id", user.id)
      .single();
    if (!data) return null;
    cache.set(data.id, data as Profile);
    return data as Profile;
  })();
  return currentProfilePromise;
}

export async function getProfilesByIds(ids: string[]): Promise<Map<string, Profile>> {
  const result = new Map<string, Profile>();
  const missing: string[] = [];
  for (const id of ids) {
    if (cache.has(id)) result.set(id, cache.get(id)!);
    else missing.push(id);
  }
  if (missing.length === 0) return result;

  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, color, platform_role")
    .in("id", missing);

  for (const p of (data || []) as Profile[]) {
    cache.set(p.id, p);
    result.set(p.id, p);
  }
  return result;
}

export async function getAllProfiles(): Promise<Profile[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, color, platform_role")
    .order("full_name", { ascending: true });
  for (const p of (data || []) as Profile[]) cache.set(p.id, p);
  return (data || []) as Profile[];
}

export function clearProfileCache() {
  cache.clear();
  currentProfilePromise = null;
}
