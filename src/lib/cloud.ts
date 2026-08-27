import { isCloudConfigured, supabase } from './supabase';

export type HouseholdMember = {
  userId: string;
  displayName: string;
  role: 'owner' | 'admin' | 'member';
  joinedAt: string;
  canInvite: boolean;
};

export type Household = {
  id: string;
  name: string;
  inviteCode: string;
  role: 'owner' | 'admin' | 'member';
  myDisplayName: string;
  canInvite: boolean;
  members: HouseholdMember[];
};

export type HouseholdInvitation = {
  id: string;
  householdId: string;
  householdName: string;
  email: string;
  inviteCode: string;
  expiresAt: string;
};

export type ShoppingItem = {
  id: string;
  name: string;
  amount: number;
  unit: string;
  done: boolean;
  completedBy?: string | null;
  completedByName?: string | null;
  completedAt?: string | null;
  addedBy?: string | null;
  addedByName?: string | null;
};

export type MealDay = { plannedDate: string; day: string; meal: string | null };

export type OwnRecipe = {
  id: string;
  title: string;
  ingredients: string[];
  instructions: string;
  servings: number;
  createdAt?: string;
};

export type MealHistoryEntry = {
  id: string;
  recipeTitle: string;
  recipeKey?: string | null;
  cookedOn: string;
  cookedAt: string;
  markedBy: string;
  markedByName?: string | null;
};

type ShoppingRow = {
  id: string;
  owner_id?: string | null;
  name: string;
  amount: number | string;
  unit: string;
  done: boolean;
  completed_by?: string | null;
  completed_at?: string | null;
};

type MealRow = { planned_date: string; meal: string | null };

type RecipeRow = {
  id: string;
  title: string;
  ingredients: unknown;
  instructions: string | null;
  servings: number | null;
  created_at?: string;
};

type HistoryRow = {
  id: string;
  recipe_title: string;
  recipe_key?: string | null;
  cooked_on: string;
  cooked_at: string;
  marked_by: string;
};

let activeHouseholdId: string | null = null;

function requireCloud() {
  if (!isCloudConfigured) throw new Error('Die Cloud-Synchronisierung ist noch nicht konfiguriert.');
  return supabase;
}

async function requireUser() {
  const client = requireCloud();
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Keine aktive Anmeldung gefunden.');
  return data.user;
}

export function clearHouseholdCache() {
  activeHouseholdId = null;
}

export async function getActiveHouseholdId(force = false): Promise<string> {
  if (!force && activeHouseholdId) return activeHouseholdId;
  const client = requireCloud();
  const { data, error } = await client.rpc('ensure_active_household');
  if (error) throw error;
  if (!data) throw new Error('Es konnte kein aktiver Haushalt geladen werden.');
  activeHouseholdId = String(data);
  return activeHouseholdId;
}

async function loadProfileNames(userIds: string[]) {
  const ids = Array.from(new Set(userIds.filter(Boolean)));
  if (!ids.length) return new Map<string, string>();
  const { data, error } = await supabase.from('profiles').select('id,display_name').in('id', ids);
  if (error) throw error;
  return new Map((data ?? []).map((row: any) => [String(row.id), String(row.display_name || 'Mitglied')]));
}

export async function loadHousehold(): Promise<Household> {
  const householdId = await getActiveHouseholdId(true);
  const user = await requireUser();
  const [{ data: householdData, error: householdError }, { data: memberData, error: memberError }, { data: myProfile, error: profileError }] = await Promise.all([
    supabase.from('households').select('id,name,invite_code').eq('id', householdId).single(),
    supabase.from('household_members').select('user_id,role,joined_at,can_invite').eq('household_id', householdId).order('joined_at', { ascending: true }),
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
  ]);
  if (householdError) throw householdError;
  if (memberError) throw memberError;
  if (profileError) throw profileError;

  const membersRaw = memberData ?? [];
  const names = await loadProfileNames(membersRaw.map((row: any) => String(row.user_id)));
  const members: HouseholdMember[] = membersRaw.map((row: any) => ({
    userId: String(row.user_id),
    displayName: names.get(String(row.user_id)) ?? 'Mitglied',
    role: row.role as HouseholdMember['role'],
    joinedAt: String(row.joined_at),
    canInvite: row.role === 'owner' || Boolean(row.can_invite),
  }));
  const own = members.find((member) => member.userId === user.id);

  return {
    id: String(householdData.id),
    name: String(householdData.name),
    inviteCode: String(householdData.invite_code),
    role: own?.role ?? 'member',
    myDisplayName: String(myProfile.display_name || own?.displayName || 'Mitglied'),
    canInvite: own?.role === 'owner' || Boolean(own?.canInvite),
    members,
  };
}

export async function renameHousehold(householdId: string, name: string) {
  const clean = name.trim();
  if (!clean) throw new Error('Bitte gib einen Namen für den Haushalt ein.');
  const { error } = await requireCloud().from('households').update({ name: clean }).eq('id', householdId);
  if (error) throw error;
}

export async function updateMyDisplayName(name: string) {
  const clean = name.trim();
  if (!clean) throw new Error('Bitte gib einen Namen ein.');
  const user = await requireUser();
  const { error } = await requireCloud().from('profiles').update({ display_name: clean }).eq('id', user.id);
  if (error) throw error;
}

export async function joinHouseholdByCode(code: string): Promise<string> {
  const { data, error } = await requireCloud().rpc('join_household_by_code', { join_code: code.trim() });
  if (error) throw error;
  activeHouseholdId = String(data);
  return activeHouseholdId;
}

export async function createHouseholdInvitation(householdId: string, email: string): Promise<string> {
  const { data, error } = await requireCloud().rpc('create_household_invitation', {
    target_household: householdId,
    target_email: email.trim(),
  });
  if (error) throw error;
  return String(data);
}

export async function createHouseholdJoinCode(householdId: string): Promise<string> {
  const { data, error } = await requireCloud().rpc('create_household_join_code', { target_household: householdId });
  if (error) throw error;
  return String(data);
}

export async function setHouseholdInvitePermission(householdId: string, userId: string, allowed: boolean) {
  const { error } = await requireCloud().rpc('set_household_invite_permission', {
    target_household: householdId,
    target_user: userId,
    allowed,
  });
  if (error) throw error;
}

export async function loadPendingHouseholdInvitations(): Promise<HouseholdInvitation[]> {
  const user = await requireUser();
  if (!user.email) return [];
  const { data, error } = await supabase
    .from('household_invitations')
    .select('id,household_id,email,invite_code,expires_at')
    .eq('email', user.email.toLowerCase())
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = data ?? [];
  const householdIds = Array.from(new Set(rows.map((row: any) => String(row.household_id))));
  const { data: households, error: householdError } = householdIds.length
    ? await supabase.from('households').select('id,name').in('id', householdIds)
    : { data: [], error: null as any };
  if (householdError) throw householdError;
  const names = new Map((households ?? []).map((row: any) => [String(row.id), String(row.name)]));
  return rows.map((row: any) => ({
    id: String(row.id),
    householdId: String(row.household_id),
    householdName: names.get(String(row.household_id)) ?? 'Gemeinsamer Haushalt',
    email: String(row.email),
    inviteCode: String(row.invite_code),
    expiresAt: String(row.expires_at),
  }));
}

export async function acceptHouseholdInvitation(invitationId: string): Promise<string> {
  const { data, error } = await requireCloud().rpc('accept_household_invitation', { invitation_id: invitationId });
  if (error) throw error;
  activeHouseholdId = String(data);
  return activeHouseholdId;
}

function toShoppingItem(row: ShoppingRow, names?: Map<string, string>): ShoppingItem {
  return {
    id: row.id,
    name: String(row.name),
    amount: Number(row.amount),
    unit: String(row.unit),
    done: Boolean(row.done),
    completedBy: row.completed_by ?? null,
    completedByName: row.completed_by ? names?.get(row.completed_by) ?? 'Mitglied' : null,
    completedAt: row.completed_at ?? null,
    addedBy: row.owner_id ?? null,
    addedByName: row.owner_id ? names?.get(row.owner_id) ?? 'Mitglied' : null,
  };
}

function toOwnRecipe(row: RecipeRow): OwnRecipe {
  return {
    id: row.id,
    title: String(row.title),
    ingredients: Array.isArray(row.ingredients) ? row.ingredients.map(String) : [],
    instructions: row.instructions ?? '',
    servings: Number(row.servings ?? 2),
    createdAt: row.created_at,
  };
}

export async function loadShopping(): Promise<ShoppingItem[]> {
  const householdId = await getActiveHouseholdId();
  const { data, error } = await supabase
    .from('shopping_items')
    .select('id,owner_id,name,amount,unit,done,completed_by,completed_at')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as ShoppingRow[];
  const names = await loadProfileNames(rows.flatMap((row) => [row.completed_by ?? '', row.owner_id ?? '']).filter(Boolean));
  return rows.map((row) => toShoppingItem(row, names));
}

export async function addShoppingItem(item: Omit<ShoppingItem, 'id' | 'done' | 'completedBy' | 'completedByName' | 'completedAt' | 'addedBy' | 'addedByName'>) {
  const householdId = await getActiveHouseholdId();
  const user = await requireUser();
  const { data, error } = await requireCloud()
    .from('shopping_items')
    .insert({ household_id: householdId, owner_id: user.id, name: item.name, amount: item.amount, unit: item.unit, done: false })
    .select('id,owner_id,name,amount,unit,done,completed_by,completed_at')
    .single();
  if (error) throw error;
  const names = await loadProfileNames([user.id]);
  return toShoppingItem(data as ShoppingRow, names);
}

export async function setShoppingDone(id: string, done: boolean) {
  const user = await requireUser();
  const householdId = await getActiveHouseholdId();
  const { error } = await requireCloud()
    .from('shopping_items')
    .update({
      done,
      completed_by: done ? user.id : null,
      completed_at: done ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .eq('household_id', householdId);
  if (error) throw error;
}

export async function deleteShoppingItem(id: string) {
  const householdId = await getActiveHouseholdId();
  const { error } = await requireCloud().from('shopping_items').delete().eq('id', id).eq('household_id', householdId);
  if (error) throw error;
}

export async function loadMealPlan(): Promise<MealDay[]> {
  const householdId = await getActiveHouseholdId();
  const from = new Date();
  from.setDate(from.getDate() - 8);
  const until = new Date();
  until.setDate(until.getDate() + 22);
  const toIso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const { data, error } = await supabase
    .from('meal_plan_entries')
    .select('planned_date,meal')
    .eq('household_id', householdId)
    .gte('planned_date', toIso(from))
    .lte('planned_date', toIso(until))
    .order('planned_date', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as MealRow[]).map((row) => {
    const plannedDate = String(row.planned_date);
    const date = new Date(`${plannedDate}T12:00:00`);
    const rawDay = date.toLocaleDateString('de-AT', { weekday: 'long' });
    return { plannedDate, day: rawDay.charAt(0).toUpperCase() + rawDay.slice(1), meal: row.meal == null ? null : String(row.meal) };
  });
}

export async function saveMeal(plannedDate: string, meal: string | null) {
  const householdId = await getActiveHouseholdId();
  const user = await requireUser();
  const clean = meal?.trim() || null;
  if (!clean) {
    const { error } = await requireCloud().from('meal_plan_entries').delete().eq('household_id', householdId).eq('planned_date', plannedDate);
    if (error) throw error;
    return;
  }
  const { error } = await requireCloud()
    .from('meal_plan_entries')
    .upsert({ household_id: householdId, owner_id: user.id, planned_date: plannedDate, meal: clean }, { onConflict: 'household_id,planned_date' });
  if (error) throw error;
}

export async function loadOwnRecipes(): Promise<OwnRecipe[]> {
  const householdId = await getActiveHouseholdId();
  const { data, error } = await supabase
    .from('custom_recipes')
    .select('id,title,ingredients,instructions,servings,created_at')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data ?? []) as RecipeRow[]).map(toOwnRecipe);
}

export async function addOwnRecipe(input: Omit<OwnRecipe, 'id' | 'createdAt'>): Promise<OwnRecipe> {
  const householdId = await getActiveHouseholdId();
  const user = await requireUser();
  const { data, error } = await requireCloud()
    .from('custom_recipes')
    .insert({
      household_id: householdId,
      owner_id: user.id,
      title: input.title,
      ingredients: input.ingredients,
      instructions: input.instructions,
      servings: input.servings,
    })
    .select('id,title,ingredients,instructions,servings,created_at')
    .single();
  if (error) throw error;
  return toOwnRecipe(data as RecipeRow);
}

export async function deleteOwnRecipe(id: string) {
  const householdId = await getActiveHouseholdId();
  const { error } = await requireCloud().from('custom_recipes').delete().eq('id', id).eq('household_id', householdId);
  if (error) throw error;
}

export async function loadMealHistory(limit = 40): Promise<MealHistoryEntry[]> {
  const householdId = await getActiveHouseholdId();
  const { data, error } = await supabase
    .from('meal_history')
    .select('id,recipe_title,recipe_key,cooked_on,cooked_at,marked_by')
    .eq('household_id', householdId)
    .order('cooked_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as HistoryRow[];
  const names = await loadProfileNames(rows.map((row) => row.marked_by));
  return rows.map((row) => ({
    id: String(row.id),
    recipeTitle: String(row.recipe_title),
    recipeKey: row.recipe_key ?? null,
    cookedOn: String(row.cooked_on),
    cookedAt: String(row.cooked_at),
    markedBy: String(row.marked_by),
    markedByName: names.get(String(row.marked_by)) ?? 'Mitglied',
  }));
}

export async function recordCookedMeal(recipeTitle: string, recipeKey?: string | null) {
  const householdId = await getActiveHouseholdId();
  const user = await requireUser();
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await requireCloud()
    .from('meal_history')
    .upsert({
      household_id: householdId,
      recipe_title: recipeTitle.trim(),
      recipe_key: recipeKey ?? null,
      cooked_on: today,
      marked_by: user.id,
      cooked_at: new Date().toISOString(),
    }, { onConflict: 'household_id,recipe_title,cooked_on' });
  if (error) throw error;
}
