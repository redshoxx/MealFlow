create table if not exists public.meal_plan_entries (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default ensure_active_household() references public.households(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  planned_date date not null,
  meal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, planned_date)
);

alter table public.meal_plan_entries enable row level security;

drop policy if exists meal_entries_select_household on public.meal_plan_entries;
create policy meal_entries_select_household on public.meal_plan_entries
for select to authenticated
using (is_household_member(household_id, auth.uid()));

drop policy if exists meal_entries_insert_household on public.meal_plan_entries;
create policy meal_entries_insert_household on public.meal_plan_entries
for insert to authenticated
with check (is_household_member(household_id, auth.uid()) and owner_id = auth.uid());

drop policy if exists meal_entries_update_household on public.meal_plan_entries;
create policy meal_entries_update_household on public.meal_plan_entries
for update to authenticated
using (is_household_member(household_id, auth.uid()))
with check (is_household_member(household_id, auth.uid()));

drop policy if exists meal_entries_delete_household on public.meal_plan_entries;
create policy meal_entries_delete_household on public.meal_plan_entries
for delete to authenticated
using (is_household_member(household_id, auth.uid()));

grant select, insert, update, delete on public.meal_plan_entries to authenticated;

create index if not exists meal_plan_entries_household_date_idx
  on public.meal_plan_entries (household_id, planned_date);

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'meal_plan_entries_set_updated_at'
      and tgrelid = 'public.meal_plan_entries'::regclass
  ) then
    create trigger meal_plan_entries_set_updated_at
      before update on public.meal_plan_entries
      for each row execute function public.set_updated_at();
  end if;
end $$;

insert into public.meal_plan_entries (household_id, owner_id, planned_date, meal, created_at, updated_at)
select
  household_id,
  owner_id,
  (
    date_trunc('week', current_date)::date + 7 +
    case day
      when 'Montag' then 0
      when 'Dienstag' then 1
      when 'Mittwoch' then 2
      when 'Donnerstag' then 3
      when 'Freitag' then 4
      when 'Samstag' then 5
      when 'Sonntag' then 6
      else 0
    end
  )::date,
  meal,
  created_at,
  updated_at
from public.meal_plan
where meal is not null and btrim(meal) <> ''
on conflict (household_id, planned_date)
do update set
  meal = excluded.meal,
  owner_id = excluded.owner_id,
  updated_at = greatest(public.meal_plan_entries.updated_at, excluded.updated_at);

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'meal_plan_entries'
  ) then
    alter publication supabase_realtime add table public.meal_plan_entries;
  end if;
end $$;
