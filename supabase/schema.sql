-- Eine generische Tabelle für alle Daten (Training V1, Ernährung V2 ohne Migration).
-- kind: session | set | week | supp_day | settings | supplements
-- V2 geplant: meal_plan | shopping_list | food_log | body_weight
create table if not exists public.records (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null,
  kind text not null,
  day date,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null,
  deleted boolean not null default false,
  server_at timestamptz not null default clock_timestamp(),
  primary key (user_id, id)
);
create index if not exists records_user_server on public.records (user_id, server_at);
create index if not exists records_user_kind_day on public.records (user_id, kind, day);

alter table public.records enable row level security;
drop policy if exists "own rows" on public.records;
create policy "own rows" on public.records for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Letzter Schreibzugriff gewinnt (nach updated_at des Geräts); server_at für den Abgleich.
create or replace function public.records_lww() returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null;
  end if;
  new.server_at := clock_timestamp();
  return new;
end $$;
drop trigger if exists records_lww on public.records;
create trigger records_lww before insert or update on public.records
  for each row execute function public.records_lww();
