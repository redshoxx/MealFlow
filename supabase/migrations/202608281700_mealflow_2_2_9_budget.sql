-- MealFlow 2.2.9: shared household budget and price catalog

create table if not exists public.household_budgets (
  household_id uuid primary key references public.households(id) on delete cascade,
  monthly_budget numeric(12,2) not null default 400 check (monthly_budget > 0 and monthly_budget <= 100000),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.household_product_prices (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  product_key text not null check (char_length(trim(product_key)) between 1 and 140),
  product_name text not null check (char_length(trim(product_name)) between 1 and 120),
  unit_price numeric(12,2) not null check (unit_price >= 0 and unit_price <= 100000),
  price_unit text not null check (char_length(trim(price_unit)) between 1 and 24),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (household_id, product_key)
);

alter table public.household_budgets enable row level security;
alter table public.household_product_prices enable row level security;

drop policy if exists "household_budgets_select_member" on public.household_budgets;
drop policy if exists "household_budgets_insert_member" on public.household_budgets;
drop policy if exists "household_budgets_update_member" on public.household_budgets;
drop policy if exists "household_product_prices_select_member" on public.household_product_prices;
drop policy if exists "household_product_prices_insert_member" on public.household_product_prices;
drop policy if exists "household_product_prices_update_member" on public.household_product_prices;
drop policy if exists "household_product_prices_delete_member" on public.household_product_prices;

create policy "household_budgets_select_member"
on public.household_budgets for select to authenticated
using (public.is_household_member(household_id, auth.uid()));

create policy "household_budgets_insert_member"
on public.household_budgets for insert to authenticated
with check (public.is_household_member(household_id, auth.uid()));

create policy "household_budgets_update_member"
on public.household_budgets for update to authenticated
using (public.is_household_member(household_id, auth.uid()))
with check (public.is_household_member(household_id, auth.uid()));

create policy "household_product_prices_select_member"
on public.household_product_prices for select to authenticated
using (public.is_household_member(household_id, auth.uid()));

create policy "household_product_prices_insert_member"
on public.household_product_prices for insert to authenticated
with check (public.is_household_member(household_id, auth.uid()));

create policy "household_product_prices_update_member"
on public.household_product_prices for update to authenticated
using (public.is_household_member(household_id, auth.uid()))
with check (public.is_household_member(household_id, auth.uid()));

create policy "household_product_prices_delete_member"
on public.household_product_prices for delete to authenticated
using (public.is_household_member(household_id, auth.uid()));

grant select, insert, update on public.household_budgets to authenticated;
grant select, insert, update, delete on public.household_product_prices to authenticated;

create trigger household_budgets_set_updated_at
before update on public.household_budgets
for each row execute function public.set_updated_at();

create trigger household_product_prices_set_updated_at
before update on public.household_product_prices
for each row execute function public.set_updated_at();

alter publication supabase_realtime add table public.household_budgets;
alter publication supabase_realtime add table public.household_product_prices;
