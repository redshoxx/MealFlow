import { isCloudConfigured, supabase } from './supabase';

export type ShoppingItem = {
  id: string;
  name: string;
  amount: number;
  unit: string;
  done: boolean;
};

export type MealDay = { day: string; meal: string | null };

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

function requireCloud() {
  if (!isCloudConfigured) throw new Error('Supabase ist noch nicht konfiguriert.');
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
  if (!userData.user) throw new Error('Keine aktive Supabase-Sitzung.');

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
