alter table public.meal_plan_entries
  add column if not exists meal_saskia text;

comment on column public.meal_plan_entries.meal_saskia is
  'Optional second planned meal for Saskia for the same household/date.';
