alter table public.user_notes
  add column if not exists note_type text not null default 'text',
  add column if not exists checklist_items jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_notes_note_type_check'
      and conrelid = 'public.user_notes'::regclass
  ) then
    alter table public.user_notes
      add constraint user_notes_note_type_check
      check (note_type in ('text', 'checklist'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_notes_checklist_items_array_check'
      and conrelid = 'public.user_notes'::regclass
  ) then
    alter table public.user_notes
      add constraint user_notes_checklist_items_array_check
      check (jsonb_typeof(checklist_items) = 'array');
  end if;
end $$;
