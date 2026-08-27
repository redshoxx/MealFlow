import { supabase } from './supabase';

export type ShoppingItem = {
  id: string;
  name: string;
  amount: number;
  unit: string;
  done: boolean;
};

export type MealDay = { day: string; meal: string | null };

export async function loadShopping(): Promise<ShoppingItem[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('shopping_items')
    .select('id,name,amount,unit,done')
    .order('created_at');
  if (error) throw error;
  return data ?? [];
}

export async function addShoppingItem(item: Omit<ShoppingItem, 'id' | 'done'>) {
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Nicht angemeldet');
  const { data, error } = await supabase
    .from('shopping_items')
    .insert({ ...item, user_id: userId, done: false })
    .select('id,name,amount,unit,done')
    .single();
  if (error) throw error;
  return data as ShoppingItem;
}

export async function setShoppingDone(id: string, done: boolean) {
  if (!supabase) return;
  const { error } = await supabase.from('shopping_items').update({ done }).eq('id', id);
  if (error) throw error;
}

export async function deleteShoppingItem(id: string) {
  if (!supabase) return;
  const { error } = await supabase.from('shopping_items').delete().eq('id', id);
  if (error) throw error;
}

export async function loadMealPlan(): Promise<MealDay[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('meal_plan').select('day,meal');
  if (error) throw error;
  return data ?? [];
}

export async function saveMeal(day: string, meal: string | null) {
  if (!supabase) return;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error('Nicht angemeldet');
  const { error } = await supabase
    .from('meal_plan')
    .upsert({ user_id: userId, day, meal }, { onConflict: 'user_id,day' });
  if (error) throw error;
}
