-- MealFlow 1.1 - secure same-account cross-device sync
create extension if not exists pgcrypto;

create table if not exists public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  amount numeric(10,2) not null default 1 check (amount > 0),
  unit text not null default 'Stk.',
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.meal_plan (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day text not null check (day in ('Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag')),
  meal text,
  updated_at timestamptz not null default now(),
  unique(user_id, day)
);

create table if not exists public.custom_recipes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  image_url text,
  ingredients jsonb not null default '[]'::jsonb,
  instructions text,
  created_at timestamptz not null default now()
);

alter table public.shopping_items enable row level security;
alter table public.meal_plan enable row level security;
alter table public.custom_recipes enable row level security;

create policy "shopping_select_own" on public.shopping_items for select to authenticated using ((select auth.uid()) = user_id);
create policy "shopping_insert_own" on public.shopping_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "shopping_update_own" on public.shopping_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "shopping_delete_own" on public.shopping_items for delete to authenticated using ((select auth.uid()) = user_id);

create policy "meal_select_own" on public.meal_plan for select to authenticated using ((select auth.uid()) = user_id);
create policy "meal_insert_own" on public.meal_plan for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "meal_update_own" on public.meal_plan for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "meal_delete_own" on public.meal_plan for delete to authenticated using ((select auth.uid()) = user_id);

create policy "recipes_select_own" on public.custom_recipes for select to authenticated using ((select auth.uid()) = user_id);
create policy "recipes_insert_own" on public.custom_recipes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "recipes_update_own" on public.custom_recipes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "recipes_delete_own" on public.custom_recipes for delete to authenticated using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.shopping_items to authenticated;
grant select, insert, update, delete on public.meal_plan to authenticated;
grant select, insert, update, delete on public.custom_recipes to authenticated;

do $$ begin
  alter publication supabase_realtime add table public.shopping_items;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table public.meal_plan;
exception when duplicate_object then null;
end $$;
