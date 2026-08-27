create or replace function public.remove_household_member(target_household uuid, target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  replacement_household uuid;
begin
  if caller is null then
    raise exception 'Nicht angemeldet.';
  end if;

  if not exists (
    select 1 from public.households h
    where h.id = target_household and h.created_by = caller
  ) then
    raise exception 'Nur der Haushaltsersteller darf Mitglieder entfernen.';
  end if;

  if target_user = caller then
    raise exception 'Der Haushaltsersteller kann sich nicht selbst entfernen.';
  end if;

  if not exists (
    select 1 from public.household_members hm
    where hm.household_id = target_household and hm.user_id = target_user
  ) then
    raise exception 'Dieses Mitglied gehört nicht zum Haushalt.';
  end if;

  if exists (
    select 1 from public.household_members hm
    where hm.household_id = target_household and hm.user_id = target_user and hm.role = 'owner'
  ) then
    raise exception 'Der Haushaltsersteller kann nicht entfernt werden.';
  end if;

  delete from public.household_members
  where household_id = target_household and user_id = target_user;

  if exists (
    select 1 from public.profiles p
    where p.id = target_user and p.active_household_id = target_household
  ) then
    select hm.household_id into replacement_household
    from public.household_members hm
    where hm.user_id = target_user
    order by hm.joined_at asc
    limit 1;

    update public.profiles
    set active_household_id = replacement_household,
        updated_at = now()
    where id = target_user;
  end if;
end;
$$;

revoke all on function public.remove_household_member(uuid, uuid) from public;
grant execute on function public.remove_household_member(uuid, uuid) to authenticated;
