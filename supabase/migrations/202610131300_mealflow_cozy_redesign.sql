-- MealFlow 2026: additive fields, no destructive changes to existing dishes or plans.
alter table public.custom_recipes
  add column if not exists category text not null default 'Hauptgerichte',
  add column if not exists minutes integer not null default 0,
  add column if not exists difficulty text not null default 'Einfach',
  add column if not exists image_url text not null default '';
alter table public.custom_recipes
  drop constraint if exists custom_recipes_minutes_range;
alter table public.custom_recipes
  add constraint custom_recipes_minutes_range check (minutes between 0 and 600);
alter table public.meal_plan_entries
  add column if not exists meal_portions integer not null default 2,
  add column if not exists meal_saskia_portions integer not null default 2;
alter table public.meal_plan_entries
  drop constraint if exists meal_plan_entries_portions_range;
alter table public.meal_plan_entries
  add constraint meal_plan_entries_portions_range check (
    meal_portions between 1 and 20 and meal_saskia_portions between 1 and 20
  );

-- Completion states are scoped to the week, so last week's purchases are not
-- erroneously marked as complete in a new weekly shopping list.
create table if not exists public.mealflow_weekly_checks (
  household_id uuid not null references public.households(id) on delete cascade,
  week_start date not null,
  ingredient_key text not null,
  done boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key(household_id, week_start, ingredient_key)
);
alter table public.mealflow_weekly_checks enable row level security;
create policy mealflow_weekly_checks_select on public.mealflow_weekly_checks
  for select to authenticated using (public.is_household_member(household_id, auth.uid()));
create policy mealflow_weekly_checks_insert on public.mealflow_weekly_checks
  for insert to authenticated with check (public.is_household_member(household_id, auth.uid()));
create policy mealflow_weekly_checks_update on public.mealflow_weekly_checks
  for update to authenticated using (public.is_household_member(household_id, auth.uid()))
  with check (public.is_household_member(household_id, auth.uid()));
grant select, insert, update on public.mealflow_weekly_checks to authenticated;
alter publication supabase_realtime add table public.mealflow_weekly_checks;
