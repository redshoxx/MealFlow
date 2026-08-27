create table if not exists public.nutrition_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade default auth.uid(),
  daily_calorie_target integer not null default 2000 check (daily_calorie_target > 0),
  protein_target_g numeric(8,2) not null default 120 check (protein_target_g >= 0),
  carbs_target_g numeric(8,2) not null default 220 check (carbs_target_g >= 0),
  fat_target_g numeric(8,2) not null default 65 check (fat_target_g >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.nutrition_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  eaten_on date not null default current_date,
  meal_type text not null check (meal_type in ('breakfast','lunch','dinner','snack')),
  barcode text,
  product_name text not null,
  brand text,
  image_url text,
  amount_g numeric(10,2) not null default 100 check (amount_g > 0),
  calories numeric(10,2) not null default 0 check (calories >= 0),
  protein_g numeric(10,2) not null default 0 check (protein_g >= 0),
  carbs_g numeric(10,2) not null default 0 check (carbs_g >= 0),
  fat_g numeric(10,2) not null default 0 check (fat_g >= 0),
  source text not null default 'open_food_facts',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists nutrition_entries_user_date_idx on public.nutrition_entries(user_id, eaten_on, created_at desc);

alter table public.nutrition_profiles enable row level security;
alter table public.nutrition_entries enable row level security;

drop policy if exists nutrition_profiles_select_own on public.nutrition_profiles;
drop policy if exists nutrition_profiles_insert_own on public.nutrition_profiles;
drop policy if exists nutrition_profiles_update_own on public.nutrition_profiles;
drop policy if exists nutrition_profiles_delete_own on public.nutrition_profiles;
create policy nutrition_profiles_select_own on public.nutrition_profiles for select to authenticated using (user_id = auth.uid());
create policy nutrition_profiles_insert_own on public.nutrition_profiles for insert to authenticated with check (user_id = auth.uid());
create policy nutrition_profiles_update_own on public.nutrition_profiles for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy nutrition_profiles_delete_own on public.nutrition_profiles for delete to authenticated using (user_id = auth.uid());

drop policy if exists nutrition_entries_select_own on public.nutrition_entries;
drop policy if exists nutrition_entries_insert_own on public.nutrition_entries;
drop policy if exists nutrition_entries_update_own on public.nutrition_entries;
drop policy if exists nutrition_entries_delete_own on public.nutrition_entries;
create policy nutrition_entries_select_own on public.nutrition_entries for select to authenticated using (user_id = auth.uid());
create policy nutrition_entries_insert_own on public.nutrition_entries for insert to authenticated with check (user_id = auth.uid());
create policy nutrition_entries_update_own on public.nutrition_entries for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy nutrition_entries_delete_own on public.nutrition_entries for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.nutrition_profiles to authenticated;
grant select, insert, update, delete on public.nutrition_entries to authenticated;

create or replace function public.set_nutrition_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists nutrition_profiles_updated_at on public.nutrition_profiles;
create trigger nutrition_profiles_updated_at before update on public.nutrition_profiles for each row execute function public.set_nutrition_updated_at();
drop trigger if exists nutrition_entries_updated_at on public.nutrition_entries;
create trigger nutrition_entries_updated_at before update on public.nutrition_entries for each row execute function public.set_nutrition_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'nutrition_entries'
  ) then
    alter publication supabase_realtime add table public.nutrition_entries;
  end if;
end $$;
