create table if not exists public.user_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_notes_title_length check (char_length(trim(title)) between 1 and 120),
  constraint user_notes_content_length check (char_length(content) <= 12000)
);

create table if not exists public.user_note_shares (
  note_id uuid not null references public.user_notes(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  shared_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (note_id, recipient_user_id),
  constraint user_note_share_not_self check (recipient_user_id <> shared_by)
);

create index if not exists user_notes_owner_updated_idx on public.user_notes(owner_id, updated_at desc);
create index if not exists user_note_shares_recipient_idx on public.user_note_shares(recipient_user_id, created_at desc);

create or replace function public.touch_user_note_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists user_notes_touch_updated_at on public.user_notes;
create trigger user_notes_touch_updated_at
before update on public.user_notes
for each row execute function public.touch_user_note_updated_at();

create or replace function public.owns_user_note(target_note uuid, current_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_notes n
    where n.id = target_note and n.owner_id = current_uid
  );
$$;

revoke all on function public.owns_user_note(uuid, uuid) from public;
grant execute on function public.owns_user_note(uuid, uuid) to authenticated;

alter table public.user_notes enable row level security;
alter table public.user_note_shares enable row level security;

drop policy if exists user_notes_select on public.user_notes;
create policy user_notes_select on public.user_notes
for select to authenticated
using (
  owner_id = auth.uid()
  or (
    public.shares_household(owner_id, auth.uid())
    and exists (
      select 1 from public.user_note_shares s
      where s.note_id = user_notes.id
        and s.recipient_user_id = auth.uid()
    )
  )
);

drop policy if exists user_notes_insert on public.user_notes;
create policy user_notes_insert on public.user_notes
for insert to authenticated
with check (owner_id = auth.uid());

drop policy if exists user_notes_update on public.user_notes;
create policy user_notes_update on public.user_notes
for update to authenticated
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists user_notes_delete on public.user_notes;
create policy user_notes_delete on public.user_notes
for delete to authenticated
using (owner_id = auth.uid());

drop policy if exists user_note_shares_select on public.user_note_shares;
create policy user_note_shares_select on public.user_note_shares
for select to authenticated
using (shared_by = auth.uid() or recipient_user_id = auth.uid());

drop policy if exists user_note_shares_insert on public.user_note_shares;
create policy user_note_shares_insert on public.user_note_shares
for insert to authenticated
with check (
  shared_by = auth.uid()
  and recipient_user_id <> auth.uid()
  and public.owns_user_note(note_id, auth.uid())
  and public.shares_household(recipient_user_id, auth.uid())
);

drop policy if exists user_note_shares_delete on public.user_note_shares;
create policy user_note_shares_delete on public.user_note_shares
for delete to authenticated
using (shared_by = auth.uid() or recipient_user_id = auth.uid());

grant select, insert, update, delete on public.user_notes to authenticated;
grant select, insert, delete on public.user_note_shares to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_notes'
  ) then
    alter publication supabase_realtime add table public.user_notes;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_note_shares'
  ) then
    alter publication supabase_realtime add table public.user_note_shares;
  end if;
end $$;
