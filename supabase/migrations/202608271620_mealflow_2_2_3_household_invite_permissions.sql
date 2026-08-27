alter table public.household_members
  add column if not exists can_invite boolean not null default false;

update public.household_members
set can_invite = true
where role = 'owner' and can_invite = false;

alter table public.household_invitations
  alter column email drop not null;

create or replace function public.can_invite_to_household(
  target_household uuid,
  target_user uuid default auth.uid()
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.household_members hm
    where hm.household_id = target_household
      and hm.user_id = target_user
      and (hm.role = 'owner' or hm.can_invite = true)
  );
$$;

create or replace function public.set_household_invite_permission(
  target_household uuid,
  target_user uuid,
  allowed boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_role text;
  target_role text;
begin
  if auth.uid() is null then raise exception 'Anmeldung erforderlich'; end if;

  select role into caller_role
  from public.household_members
  where household_id = target_household and user_id = auth.uid();

  if caller_role is distinct from 'owner' then
    raise exception 'Nur der Haushaltsersteller darf Einladungsrechte vergeben';
  end if;

  select role into target_role
  from public.household_members
  where household_id = target_household and user_id = target_user;

  if target_role is null then raise exception 'Mitglied nicht gefunden'; end if;
  if target_role = 'owner' then raise exception 'Das Einladungsrecht des Haushaltserstellers kann nicht entfernt werden'; end if;

  update public.household_members
  set can_invite = allowed
  where household_id = target_household and user_id = target_user;
end;
$$;

create or replace function public.create_household_invitation(target_household uuid, target_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  code text;
  normalized_email text := lower(trim(target_email));
begin
  if auth.uid() is null or not public.can_invite_to_household(target_household, auth.uid()) then
    raise exception 'Du hast keine Berechtigung, Personen in diesen Haushalt einzuladen';
  end if;
  if position('@' in normalized_email) <= 1 then raise exception 'Ungültige E-Mail-Adresse'; end if;

  delete from public.household_invitations
  where household_id = target_household
    and lower(email) = normalized_email
    and accepted_at is null;

  insert into public.household_invitations(household_id, email, invited_by)
  values (target_household, normalized_email, auth.uid())
  returning invite_code into code;
  return code;
end;
$$;

create or replace function public.create_household_join_code(target_household uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  code text;
begin
  if auth.uid() is null or not public.can_invite_to_household(target_household, auth.uid()) then
    raise exception 'Du hast keine Berechtigung, Personen in diesen Haushalt einzuladen';
  end if;

  insert into public.household_invitations(household_id, email, invited_by, expires_at)
  values (target_household, null, auth.uid(), now() + interval '14 days')
  returning invite_code into code;
  return code;
end;
$$;

create or replace function public.join_household_by_code(join_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  normalized text := upper(trim(join_code));
  inv public.household_invitations%rowtype;
  user_email text;
begin
  if uid is null then raise exception 'Anmeldung erforderlich'; end if;
  if normalized = '' then raise exception 'Einladungscode fehlt'; end if;

  select * into inv
  from public.household_invitations i
  where upper(i.invite_code) = normalized
    and i.accepted_at is null
    and i.expires_at > now()
  limit 1;

  if inv.id is null then raise exception 'Einladungscode ist ungültig oder abgelaufen'; end if;

  if inv.email is not null then
    select lower(u.email) into user_email from auth.users u where u.id = uid;
    if lower(inv.email) <> user_email then
      raise exception 'Diese E-Mail-Einladung gehört zu einem anderen Konto';
    end if;
  end if;

  insert into public.household_members(household_id, user_id, role, can_invite)
  values (inv.household_id, uid, 'member', false)
  on conflict (household_id, user_id) do nothing;

  update public.household_invitations
  set accepted_by = uid, accepted_at = now()
  where id = inv.id;

  update public.profiles
  set active_household_id = inv.household_id, updated_at = now()
  where id = uid;

  return inv.household_id;
end;
$$;

drop policy if exists invitation_select_relevant on public.household_invitations;
create policy invitation_select_relevant
on public.household_invitations
for select
to authenticated
using (
  public.can_invite_to_household(household_id, auth.uid())
  or (email is not null and lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')))
);

grant execute on function public.can_invite_to_household(uuid, uuid) to authenticated;
grant execute on function public.set_household_invite_permission(uuid, uuid, boolean) to authenticated;
grant execute on function public.create_household_join_code(uuid) to authenticated;
