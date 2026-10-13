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
