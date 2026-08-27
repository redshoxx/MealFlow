create extension if not exists pgcrypto;

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) > 0),
  amount numeric(10,2) not null default 1 check (amount > 0),
  unit text not null default 'Stk.',
  done boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meal_plan (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  day text not null check (day in ('Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag')),
  meal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, day)
);

alter table public.shopping_items enable row level security;
alter table public.meal_plan enable row level security;

create policy "shopping_select_own" on public.shopping_items for select to authenticated using (auth.uid() = owner_id);
create policy "shopping_insert_own" on public.shopping_items for insert to authenticated with check (auth.uid() = owner_id);
create policy "shopping_update_own" on public.shopping_items for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "shopping_delete_own" on public.shopping_items for delete to authenticated using (auth.uid() = owner_id);

create policy "meal_select_own" on public.meal_plan for select to authenticated using (auth.uid() = owner_id);
create policy "meal_insert_own" on public.meal_plan for insert to authenticated with check (auth.uid() = owner_id);
create policy "meal_update_own" on public.meal_plan for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "meal_delete_own" on public.meal_plan for delete to authenticated using (auth.uid() = owner_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.shopping_items to authenticated;
grant select, insert, update, delete on public.meal_plan to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger shopping_items_set_updated_at
before update on public.shopping_items
for each row execute function public.set_updated_at();

create trigger meal_plan_set_updated_at
before update on public.meal_plan
for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.shopping_items;
alter publication supabase_realtime add table public.meal_plan;
