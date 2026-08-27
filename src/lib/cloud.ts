import { isCloudConfigured, supabase } from './supabase';

export type ShoppingItem = {
  id: string;
  name: string;
  amount: number;
  unit: string;
  done: boolean;
};

export type MealDay = { day: string; meal: string | null };

export type OwnRecipe = {
  id: string;
  title: string;
  ingredients: string[];
  instructions: string;
  servings: number;
  createdAt?: string;
};

type ShoppingRow = {
  id: string;
  name: string;
  amount: number | string;
  unit: string;
  done: boolean;
};

type MealRow = {
  day: string;
  meal: string | null;
};

type RecipeRow = {
  id: string;
  title: string;
  ingredients: unknown;
  instructions: string | null;
  servings: number | null;
  created_at?: string;
};

function requireCloud() {
  if (!isCloudConfigured) throw new Error('Die Cloud-Synchronisierung ist noch nicht konfiguriert.');
  return supabase;
}

function toShoppingItem(row: ShoppingRow): ShoppingItem {
  return {
    id: row.id,
    name: String(row.name),
    amount: Number(row.amount),
    unit: String(row.unit),
    done: Boolean(row.done),
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
  if (!isCloudConfigured) return [];

  const { data, error } = await supabase
    .from('shopping_items')
    .select('id,name,amount,unit,done')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as ShoppingRow[]).map(toShoppingItem);
}

export async function addShoppingItem(item: Omit<ShoppingItem, 'id' | 'done'>) {
  const client = requireCloud();
  const { data, error } = await client
    .from('shopping_items')
    .insert({ name: item.name, amount: item.amount, unit: item.unit, done: false })
    .select('id,name,amount,unit,done')
    .single();

  if (error) throw error;
  return toShoppingItem(data as ShoppingRow);
}

export async function setShoppingDone(id: string, done: boolean) {
  const client = requireCloud();
  const { error } = await client.from('shopping_items').update({ done }).eq('id', id);
  if (error) throw error;
}

export async function deleteShoppingItem(id: string) {
  const client = requireCloud();
  const { error } = await client.from('shopping_items').delete().eq('id', id);
  if (error) throw error;
}

export async function loadMealPlan(): Promise<MealDay[]> {
  if (!isCloudConfigured) return [];

  const { data, error } = await supabase.from('meal_plan').select('day,meal');
  if (error) throw error;

  return ((data ?? []) as MealRow[]).map((row) => ({
    day: String(row.day),
    meal: row.meal == null ? null : String(row.meal),
  }));
}

export async function saveMeal(day: string, meal: string | null) {
  const client = requireCloud();
  const { data: userData, error: userError } = await client.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error('Keine aktive Anmeldung gefunden.');

  const { error } = await client
    .from('meal_plan')
    .upsert(
      {
        owner_id: userData.user.id,
        day,
        meal,
      },
      { onConflict: 'owner_id,day' },
    );

  if (error) throw error;
}

export async function loadOwnRecipes(): Promise<OwnRecipe[]> {
  if (!isCloudConfigured) return [];

  const { data, error } = await supabase
    .from('custom_recipes')
    .select('id,title,ingredients,instructions,servings,created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data ?? []) as RecipeRow[]).map(toOwnRecipe);
}

export async function addOwnRecipe(input: Omit<OwnRecipe, 'id' | 'createdAt'>): Promise<OwnRecipe> {
  const client = requireCloud();
  const { data, error } = await client
    .from('custom_recipes')
    .insert({
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
  const client = requireCloud();
  const { error } = await client.from('custom_recipes').delete().eq('id', id);
  if (error) throw error;
}
