create table if not exists public.custom_recipes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) > 0),
  ingredients jsonb not null default '[]'::jsonb,
  instructions text not null default '',
  servings integer not null default 2 check (servings between 1 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.custom_recipes enable row level security;

drop policy if exists "custom_recipes_select_own" on public.custom_recipes;
drop policy if exists "custom_recipes_insert_own" on public.custom_recipes;
drop policy if exists "custom_recipes_update_own" on public.custom_recipes;
drop policy if exists "custom_recipes_delete_own" on public.custom_recipes;

create policy "custom_recipes_select_own" on public.custom_recipes for select to authenticated using (auth.uid() = owner_id);
create policy "custom_recipes_insert_own" on public.custom_recipes for insert to authenticated with check (auth.uid() = owner_id);
create policy "custom_recipes_update_own" on public.custom_recipes for update to authenticated using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "custom_recipes_delete_own" on public.custom_recipes for delete to authenticated using (auth.uid() = owner_id);

grant select, insert, update, delete on public.custom_recipes to authenticated;

drop trigger if exists custom_recipes_set_updated_at on public.custom_recipes;
create trigger custom_recipes_set_updated_at
before update on public.custom_recipes
for each row execute function public.set_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'custom_recipes'
  ) then
    alter publication supabase_realtime add table public.custom_recipes;
  end if;
end $$;
