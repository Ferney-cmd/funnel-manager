-- Preferencias de notificación por usuario (Telegram) + marca de completado por fecha.
-- 2026-06-30

create table if not exists notify_prefs (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  morning_enabled boolean not null default true,
  morning_time   text    not null default '08:00',   -- HH:MM hora local
  night_enabled  boolean not null default true,
  night_time     text    not null default '18:00',
  tz             text    not null default 'America/Bogota',
  last_morning_sent date,
  last_night_sent   date,
  updated_at     timestamptz not null default now()
);

alter table notify_prefs enable row level security;

drop policy if exists notify_prefs_self on notify_prefs;
create policy notify_prefs_self on notify_prefs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- completed_at: cuándo se marcó como hecha (para el resumen de la noche)
alter table node_tasks add column if not exists completed_at timestamptz;

create or replace function fn_set_completed_at() returns trigger language plpgsql as $$
begin
  if coalesce(new.done, false) and not coalesce(old.done, false) then
    new.completed_at := now();
  elsif not coalesce(new.done, false) then
    new.completed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_set_completed_at on node_tasks;
create trigger trg_set_completed_at before update on node_tasks
  for each row execute function fn_set_completed_at();

-- backfill aproximado: tareas ya hechas → completed_at = created_at (para no perder histórico)
update node_tasks set completed_at = created_at where done = true and completed_at is null;

-- prefs por defecto para los Telegram ya vinculados
insert into notify_prefs (user_id)
  select user_id from telegram_links
  on conflict (user_id) do nothing;
