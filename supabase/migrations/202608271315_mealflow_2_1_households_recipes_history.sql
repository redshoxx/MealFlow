-- MealFlow 2.1: household sharing, invitations, meal history and AT/DE recipe catalog

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Mitglied' check (char_length(trim(display_name)) between 1 and 60),
  active_household_id uuid references public.households(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.household_members (
  household_id uuid not null references public.households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

create table public.household_invitations (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  email text not null check (position('@' in email) > 1),
  invite_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)),
  invited_by uuid not null references auth.users(id) on delete cascade,
  accepted_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now()
);

create or replace function public.is_household_member(target_household uuid, target_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.household_members where household_id=target_household and user_id=target_user);
$$;
create or replace function public.is_household_admin(target_household uuid, target_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.household_members where household_id=target_household and user_id=target_user and role in ('owner','admin'));
$$;
create or replace function public.shares_household(target_user uuid, current_uid uuid default auth.uid()) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.household_members mine join public.household_members theirs on theirs.household_id=mine.household_id where mine.user_id=current_uid and theirs.user_id=target_user);
$$;

create or replace function public.ensure_active_household() returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); hh uuid;
begin
  if uid is null then raise exception 'Anmeldung erforderlich'; end if;
  insert into public.profiles(id,display_name) select uid,coalesce(nullif(split_part(email,'@',1),''),'Mitglied') from auth.users where id=uid on conflict(id) do nothing;
  select active_household_id into hh from public.profiles where id=uid and active_household_id is not null and public.is_household_member(active_household_id,uid);
  if hh is null then select household_id into hh from public.household_members where user_id=uid order by joined_at limit 1; end if;
  if hh is null then insert into public.households(name,created_by) values('Mein Haushalt',uid) returning id into hh; insert into public.household_members values(hh,uid,'owner',now()); end if;
  update public.profiles set active_household_id=hh,updated_at=now() where id=uid;
  return hh;
end $$;

create or replace function public.join_household_by_code(join_code text) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); normalized text:=upper(trim(join_code)); hh uuid; inv public.household_invitations%rowtype; user_email text;
begin
  if uid is null then raise exception 'Anmeldung erforderlich'; end if;
  select id into hh from public.households where upper(invite_code)=normalized limit 1;
  if hh is null then
    select * into inv from public.household_invitations where upper(invite_code)=normalized and accepted_at is null and expires_at>now() limit 1;
    if inv.id is not null then select lower(email) into user_email from auth.users where id=uid; if lower(inv.email)<>user_email then raise exception 'Diese E-Mail-Einladung gehört zu einem anderen Konto'; end if; hh:=inv.household_id; update public.household_invitations set accepted_by=uid,accepted_at=now() where id=inv.id; end if;
  end if;
  if hh is null then raise exception 'Einladungscode ist ungültig oder abgelaufen'; end if;
  insert into public.household_members(household_id,user_id,role) values(hh,uid,'member') on conflict do nothing;
  update public.profiles set active_household_id=hh,updated_at=now() where id=uid;
  return hh;
end $$;

create or replace function public.create_household_invitation(target_household uuid,target_email text) returns text language plpgsql security definer set search_path='' as $$
declare code text; normalized_email text:=lower(trim(target_email));
begin
  if auth.uid() is null or not public.is_household_admin(target_household,auth.uid()) then raise exception 'Nur Haushalts-Admins können einladen'; end if;
  if position('@' in normalized_email)<=1 then raise exception 'Ungültige E-Mail-Adresse'; end if;
  delete from public.household_invitations where household_id=target_household and lower(email)=normalized_email and accepted_at is null;
  insert into public.household_invitations(household_id,email,invited_by) values(target_household,normalized_email,auth.uid()) returning invite_code into code;
  return code;
end $$;

create or replace function public.accept_household_invitation(invitation_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); inv public.household_invitations%rowtype; user_email text;
begin
  if uid is null then raise exception 'Anmeldung erforderlich'; end if;
  select lower(email) into user_email from auth.users where id=uid;
  select * into inv from public.household_invitations where id=invitation_id and accepted_at is null and expires_at>now();
  if inv.id is null or lower(inv.email)<>user_email then raise exception 'Einladung ist nicht gültig'; end if;
  insert into public.household_members(household_id,user_id,role) values(inv.household_id,uid,'member') on conflict do nothing;
  update public.household_invitations set accepted_by=uid,accepted_at=now() where id=inv.id;
  update public.profiles set active_household_id=inv.household_id,updated_at=now() where id=uid;
  return inv.household_id;
end $$;

insert into public.profiles(id,display_name) select id,coalesce(nullif(raw_user_meta_data->>'display_name',''),nullif(split_part(email,'@',1),''),'Mitglied') from auth.users on conflict(id) do nothing;
do $$ declare rec record; hh uuid; begin for rec in select id from auth.users loop select household_id into hh from public.household_members where user_id=rec.id order by joined_at limit 1; if hh is null then insert into public.households(name,created_by) values('Mein Haushalt',rec.id) returning id into hh; insert into public.household_members values(hh,rec.id,'owner',now()); end if; update public.profiles set active_household_id=coalesce(active_household_id,hh) where id=rec.id; end loop; end $$;

alter table public.shopping_items add column household_id uuid references public.households(id) on delete cascade;
alter table public.shopping_items add column completed_by uuid references auth.users(id) on delete set null;
alter table public.shopping_items add column completed_at timestamptz;
alter table public.meal_plan add column household_id uuid references public.households(id) on delete cascade;
alter table public.custom_recipes add column household_id uuid references public.households(id) on delete cascade;
update public.shopping_items s set household_id=p.active_household_id from public.profiles p where s.owner_id=p.id;
update public.meal_plan m set household_id=p.active_household_id from public.profiles p where m.owner_id=p.id;
update public.custom_recipes r set household_id=p.active_household_id from public.profiles p where r.owner_id=p.id;
alter table public.shopping_items alter column household_id set default public.ensure_active_household(), alter column household_id set not null;
alter table public.meal_plan alter column household_id set default public.ensure_active_household(), alter column household_id set not null;
alter table public.custom_recipes alter column household_id set default public.ensure_active_household(), alter column household_id set not null;
alter table public.meal_plan drop constraint if exists meal_plan_owner_id_day_key;
alter table public.meal_plan add constraint meal_plan_household_day_key unique(household_id,day);

create table public.meal_history(
 id uuid primary key default gen_random_uuid(), household_id uuid not null default public.ensure_active_household() references public.households(id) on delete cascade,
 recipe_title text not null, recipe_key text, cooked_on date not null default current_date, cooked_at timestamptz not null default now(), marked_by uuid not null default auth.uid() references auth.users(id) on delete cascade,
 unique(household_id,recipe_title,cooked_on)
);

create table public.recipe_catalog(
 id text primary key,title text not null,description text not null default '',duration_minutes int not null check(duration_minutes between 5 and 360),vegetarian boolean not null default false,
 ingredients jsonb not null default '[]'::jsonb,instructions text not null default '',tags text[] not null default '{}',seasonal_months int[] not null default '{}',region text not null default 'AT/DE',source_name text not null default 'MealFlow',created_at timestamptz not null default now()
);
insert into public.recipe_catalog(id,title,description,duration_minutes,vegetarian,ingredients,instructions,tags,seasonal_months,region) values
('wiener-schnitzel','Wiener Schnitzel','Klassischer österreichischer Favorit mit knuspriger Panier.',35,false,'["Kalbsschnitzel","Mehl","Ei","Semmelbrösel","Butterschmalz","Zitrone"]','Schnitzel dünn klopfen, panieren und in heißem Butterschmalz goldbraun ausbacken.','{"Schnitzel","Österreich"}','{1,2,3,4,5,6,7,8,9,10,11,12}','AT'),
('semmelknoedel-pilzrahm','Semmelknödel mit Pilzrahm','Herzhaftes Knödelgericht.',50,true,'["Semmeln","Milch","Ei","Zwiebel","Petersilie","Champignons","Schlagobers"]','Knödelmasse zubereiten und ziehen lassen. Pilze anbraten und mit Obers cremig vollenden.','{"Knödel","Pilze","vegetarisch"}','{9,10,11,12,1,2,3}','AT'),
('kartoffelgulasch','Erdäpfelgulasch','Einfacher österreichischer Eintopf.',40,true,'["Kartoffeln","Zwiebel","Paprikapulver","Tomatenmark","Gemüsebrühe","Majoran"]','Zwiebeln rösten, würzen, Kartoffeln und Brühe zugeben und weich schmoren.','{"Eintopf","Kartoffeln","vegetarisch"}','{1,2,3,9,10,11,12}','AT'),
('kaesespaetzle','Käsespätzle','Spätzle mit würzigem Käse und Röstzwiebeln.',35,true,'["Spätzle","Bergkäse","Zwiebel","Butter","Schnittlauch"]','Spätzle garen, mit Käse schichten und mit Röstzwiebeln servieren.','{"Spätzle","Käse","vegetarisch"}','{1,2,3,4,5,6,7,8,9,10,11,12}','AT/DE'),
('ofengemuese-feta','Ofengemüse mit Feta','Unkompliziertes Blechgericht.',40,true,'["Zucchini","Paprika","Kartoffeln","rote Zwiebel","Feta","Olivenöl"]','Gemüse würzen und rösten, gegen Ende Feta zugeben.','{"Ofengemüse","vegetarisch"}','{5,6,7,8,9,10}','AT/DE'),
('linseneintopf','Linseneintopf mit Wurzelgemüse','Sättigender Eintopf.',45,true,'["Linsen","Karotten","Sellerie","Lauch","Kartoffeln"]','Gemüse anschwitzen, Linsen und Brühe zugeben und weich köcheln.','{"Eintopf","Linsen","vegetarisch"}','{1,2,3,4,9,10,11,12}','AT/DE'),
('kuerbiscremesuppe','Kürbiscremesuppe','Cremige Herbstsuppe.',35,true,'["Kürbis","Zwiebel","Kartoffel","Gemüsebrühe","Schlagobers"]','Gemüse weich kochen, pürieren und abschmecken.','{"Suppe","Kürbis","vegetarisch"}','{9,10,11}','AT/DE'),
('erdaepfelgroestl','Erdäpfelgröstl','Knusprige Kartoffelpfanne.',30,true,'["gekochte Kartoffeln","Zwiebel","Butter","Petersilie","Ei"]','Kartoffeln und Zwiebeln kräftig anrösten und nach Wunsch mit Ei servieren.','{"Kartoffeln","Pfanne","vegetarisch"}','{1,2,3,4,5,6,7,8,9,10,11,12}','AT'),
('eierschwammerl-pasta','Pasta mit Eierschwammerln','Schnelle Sommerpasta.',30,true,'["Pasta","Eierschwammerl","Zwiebel","Schlagobers","Petersilie"]','Pasta kochen, Pilze anbraten und alles cremig vermengen.','{"Eierschwammerl","Pasta","vegetarisch"}','{7,8,9}','AT'),
('paprika-hendl','Paprikahendl','Österreichischer Klassiker.',55,false,'["Hühnerkeulen","Zwiebel","Paprikapulver","Tomatenmark","Sauerrahm"]','Huhn anbraten, Paprikasauce zubereiten und weich schmoren.','{"Hähnchen","Paprika","Österreich"}','{1,2,3,4,5,6,7,8,9,10,11,12}','AT'),
('gemueselaibchen','Gemüselaibchen mit Kräuterdip','Knusprige Gemüselaibchen.',35,true,'["Zucchini","Karotten","Haferflocken","Ei","Joghurt"]','Gemüse raspeln, Masse formen und goldbraun braten.','{"Zucchini","Gemüse","vegetarisch"}','{5,6,7,8,9}','AT/DE'),
('krautfleckerl','Krautfleckerl','Österreichische Nudelpfanne mit Weißkraut.',35,true,'["Fleckerl","Weißkraut","Zwiebel","Butter","Kümmel"]','Kraut und Zwiebel kräftig anrösten, Fleckerl unterheben und würzen.','{"Nudeln","Kraut","vegetarisch"}','{1,2,3,9,10,11,12}','AT');

create or replace function public.handle_new_user_household() returns trigger language plpgsql security definer set search_path='' as $$ declare hh uuid; display text; begin display:=coalesce(nullif(new.raw_user_meta_data->>'display_name',''),nullif(split_part(new.email,'@',1),''),'Mitglied'); insert into public.profiles(id,display_name) values(new.id,display); insert into public.households(name,created_by) values('Mein Haushalt',new.id) returning id into hh; insert into public.household_members values(hh,new.id,'owner',now()); update public.profiles set active_household_id=hh where id=new.id; return new; end $$;
create trigger on_auth_user_created_mealflow_household after insert on auth.users for each row execute function public.handle_new_user_household();

alter table public.households enable row level security; alter table public.profiles enable row level security; alter table public.household_members enable row level security; alter table public.household_invitations enable row level security; alter table public.meal_history enable row level security; alter table public.recipe_catalog enable row level security;
drop policy shopping_select_own on public.shopping_items; drop policy shopping_insert_own on public.shopping_items; drop policy shopping_update_own on public.shopping_items; drop policy shopping_delete_own on public.shopping_items;
drop policy meal_select_own on public.meal_plan; drop policy meal_insert_own on public.meal_plan; drop policy meal_update_own on public.meal_plan; drop policy meal_delete_own on public.meal_plan;
drop policy custom_recipes_select_own on public.custom_recipes; drop policy custom_recipes_insert_own on public.custom_recipes; drop policy custom_recipes_update_own on public.custom_recipes; drop policy custom_recipes_delete_own on public.custom_recipes;
create policy household_select_member on public.households for select to authenticated using(public.is_household_member(id,auth.uid()));
create policy household_update_admin on public.households for update to authenticated using(public.is_household_admin(id,auth.uid())) with check(public.is_household_admin(id,auth.uid()));
create policy profile_select_shared on public.profiles for select to authenticated using(id=auth.uid() or public.shares_household(id,auth.uid()));
create policy profile_update_self on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy member_select_household on public.household_members for select to authenticated using(public.is_household_member(household_id,auth.uid()));
create policy invitation_select_relevant on public.household_invitations for select to authenticated using(public.is_household_admin(household_id,auth.uid()) or lower(email)=lower(coalesce(auth.jwt()->>'email','')));
create policy shopping_select_household on public.shopping_items for select to authenticated using(public.is_household_member(household_id,auth.uid()));
create policy shopping_insert_household on public.shopping_items for insert to authenticated with check(public.is_household_member(household_id,auth.uid()) and owner_id=auth.uid());
create policy shopping_update_household on public.shopping_items for update to authenticated using(public.is_household_member(household_id,auth.uid())) with check(public.is_household_member(household_id,auth.uid()));
create policy shopping_delete_household on public.shopping_items for delete to authenticated using(public.is_household_member(household_id,auth.uid()));
create policy meal_select_household on public.meal_plan for select to authenticated using(public.is_household_member(household_id,auth.uid()));
create policy meal_insert_household on public.meal_plan for insert to authenticated with check(public.is_household_member(household_id,auth.uid()) and owner_id=auth.uid());
create policy meal_update_household on public.meal_plan for update to authenticated using(public.is_household_member(household_id,auth.uid())) with check(public.is_household_member(household_id,auth.uid()));
create policy meal_delete_household on public.meal_plan for delete to authenticated using(public.is_household_member(household_id,auth.uid()));
create policy custom_recipe_select_household on public.custom_recipes for select to authenticated using(public.is_household_member(household_id,auth.uid()));
create policy custom_recipe_insert_household on public.custom_recipes for insert to authenticated with check(public.is_household_member(household_id,auth.uid()) and owner_id=auth.uid());
create policy custom_recipe_update_household on public.custom_recipes for update to authenticated using(public.is_household_member(household_id,auth.uid())) with check(public.is_household_member(household_id,auth.uid()));
create policy custom_recipe_delete_household on public.custom_recipes for delete to authenticated using(public.is_household_member(household_id,auth.uid()));
create policy meal_history_select_household on public.meal_history for select to authenticated using(public.is_household_member(household_id,auth.uid()));
create policy meal_history_insert_household on public.meal_history for insert to authenticated with check(public.is_household_member(household_id,auth.uid()) and marked_by=auth.uid());
create policy meal_history_delete_household on public.meal_history for delete to authenticated using(public.is_household_member(household_id,auth.uid()));
create policy recipe_catalog_read on public.recipe_catalog for select to anon,authenticated using(true);
grant select,update on public.households to authenticated; grant select,update on public.profiles to authenticated; grant select on public.household_members to authenticated; grant select on public.household_invitations to authenticated; grant select,insert,update,delete on public.meal_history to authenticated; grant select on public.recipe_catalog to anon,authenticated;
grant execute on function public.ensure_active_household() to authenticated; grant execute on function public.join_household_by_code(text) to authenticated; grant execute on function public.create_household_invitation(uuid,text) to authenticated; grant execute on function public.accept_household_invitation(uuid) to authenticated;
create trigger households_set_updated_at before update on public.households for each row execute function public.set_updated_at(); create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
alter publication supabase_realtime add table public.household_members; alter publication supabase_realtime add table public.household_invitations; alter publication supabase_realtime add table public.meal_history;
