alter table public.shopping_items
  add column if not exists stocked_at timestamptz,
  add column if not exists stocked_by uuid references auth.users(id) on delete set null;

create table if not exists public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null default public.ensure_active_household() references public.households(id) on delete cascade,
  added_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
  shopping_item_id uuid references public.shopping_items(id) on delete set null,
  barcode text,
  product_name text not null check (char_length(trim(product_name)) between 1 and 160),
  brand text,
  image_url text,
  quantity numeric(10,2) not null default 1 check (quantity > 0),
  unit text not null default 'Stk.' check (char_length(trim(unit)) between 1 and 24),
  expires_on date,
  source text not null default 'manual' check (source in ('manual','open_food_facts')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pantry_items_shopping_item_unique
  on public.pantry_items(shopping_item_id)
  where shopping_item_id is not null;
create index if not exists pantry_items_household_created_idx
  on public.pantry_items(household_id, created_at desc);
create index if not exists pantry_items_household_expiry_idx
  on public.pantry_items(household_id, expires_on)
  where expires_on is not null;

alter table public.pantry_items enable row level security;

drop policy if exists pantry_items_select_household on public.pantry_items;
drop policy if exists pantry_items_insert_household on public.pantry_items;
drop policy if exists pantry_items_update_household on public.pantry_items;
drop policy if exists pantry_items_delete_household on public.pantry_items;

create policy pantry_items_select_household on public.pantry_items
  for select to authenticated
  using (public.is_household_member(household_id, auth.uid()));
create policy pantry_items_insert_household on public.pantry_items
  for insert to authenticated
  with check (public.is_household_member(household_id, auth.uid()) and added_by = auth.uid());
create policy pantry_items_update_household on public.pantry_items
  for update to authenticated
  using (public.is_household_member(household_id, auth.uid()))
  with check (public.is_household_member(household_id, auth.uid()));
create policy pantry_items_delete_household on public.pantry_items
  for delete to authenticated
  using (public.is_household_member(household_id, auth.uid()));

grant select, insert, update, delete on public.pantry_items to authenticated;

create or replace function public.set_pantry_updated_at()
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

drop trigger if exists pantry_items_updated_at on public.pantry_items;
create trigger pantry_items_updated_at
before update on public.pantry_items
for each row execute function public.set_pantry_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pantry_items'
  ) then
    alter publication supabase_realtime add table public.pantry_items;
  end if;
end $$;
