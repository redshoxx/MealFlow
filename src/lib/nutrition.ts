import { supabase } from './supabase';

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export type NutritionProfile = {
  dailyCalorieTarget: number;
  proteinTargetG: number;
  carbsTargetG: number;
  fatTargetG: number;
};

export type NutritionEntry = {
  id: string;
  eatenOn: string;
  mealType: MealType;
  barcode?: string | null;
  productName: string;
  brand?: string | null;
  imageUrl?: string | null;
  amountG: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  source: string;
  createdAt: string;
};

export type FoodProduct = {
  barcode: string;
  name: string;
  brand?: string;
  imageUrl?: string;
  servingSize?: string;
  servingQuantity?: number;
  kcal100g: number;
  protein100g: number;
  carbs100g: number;
  fat100g: number;
};

export type NutritionTotals = {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

const DEFAULT_PROFILE: NutritionProfile = {
  dailyCalorieTarget: 2000,
  proteinTargetG: 120,
  carbsTargetG: 220,
  fatTargetG: 65,
};

async function requireUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Keine aktive Anmeldung gefunden.');
  return data.user.id;
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

export async function loadNutritionProfile(): Promise<NutritionProfile> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('nutrition_profiles')
    .select('daily_calorie_target,protein_target_g,carbs_target_g,fat_target_g')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const { error: insertError } = await supabase.from('nutrition_profiles').insert({
      user_id: userId,
      daily_calorie_target: DEFAULT_PROFILE.dailyCalorieTarget,
      protein_target_g: DEFAULT_PROFILE.proteinTargetG,
      carbs_target_g: DEFAULT_PROFILE.carbsTargetG,
      fat_target_g: DEFAULT_PROFILE.fatTargetG,
    });
    if (insertError) throw insertError;
    return DEFAULT_PROFILE;
  }
  return {
    dailyCalorieTarget: asNumber(data.daily_calorie_target, DEFAULT_PROFILE.dailyCalorieTarget),
    proteinTargetG: asNumber(data.protein_target_g, DEFAULT_PROFILE.proteinTargetG),
    carbsTargetG: asNumber(data.carbs_target_g, DEFAULT_PROFILE.carbsTargetG),
    fatTargetG: asNumber(data.fat_target_g, DEFAULT_PROFILE.fatTargetG),
  };
}

export async function saveNutritionProfile(profile: NutritionProfile) {
  const userId = await requireUserId();
  const { error } = await supabase.from('nutrition_profiles').upsert({
    user_id: userId,
    daily_calorie_target: Math.max(1, Math.round(profile.dailyCalorieTarget)),
    protein_target_g: Math.max(0, profile.proteinTargetG),
    carbs_target_g: Math.max(0, profile.carbsTargetG),
    fat_target_g: Math.max(0, profile.fatTargetG),
  }, { onConflict: 'user_id' });
  if (error) throw error;
}

export async function loadNutritionEntries(eatenOn: string): Promise<NutritionEntry[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('nutrition_entries')
    .select('id,eaten_on,meal_type,barcode,product_name,brand,image_url,amount_g,calories,protein_g,carbs_g,fat_g,source,created_at')
    .eq('user_id', userId)
    .eq('eaten_on', eatenOn)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    eatenOn: String(row.eaten_on),
    mealType: row.meal_type as MealType,
    barcode: row.barcode == null ? null : String(row.barcode),
    productName: String(row.product_name),
    brand: row.brand == null ? null : String(row.brand),
    imageUrl: row.image_url == null ? null : String(row.image_url),
    amountG: asNumber(row.amount_g),
    calories: asNumber(row.calories),
    proteinG: asNumber(row.protein_g),
    carbsG: asNumber(row.carbs_g),
    fatG: asNumber(row.fat_g),
    source: String(row.source ?? 'open_food_facts'),
    createdAt: String(row.created_at),
  }));
}

export async function addNutritionEntry(input: Omit<NutritionEntry, 'id' | 'createdAt'>) {
  const userId = await requireUserId();
  const { data, error } = await supabase.from('nutrition_entries').insert({
    user_id: userId,
    eaten_on: input.eatenOn,
    meal_type: input.mealType,
    barcode: input.barcode ?? null,
    product_name: input.productName,
    brand: input.brand ?? null,
    image_url: input.imageUrl ?? null,
    amount_g: input.amountG,
    calories: input.calories,
    protein_g: input.proteinG,
    carbs_g: input.carbsG,
    fat_g: input.fatG,
    source: input.source,
  }).select('id,eaten_on,meal_type,barcode,product_name,brand,image_url,amount_g,calories,protein_g,carbs_g,fat_g,source,created_at').single();
  if (error) throw error;
  return {
    id: String(data.id),
    eatenOn: String(data.eaten_on),
    mealType: data.meal_type as MealType,
    barcode: data.barcode == null ? null : String(data.barcode),
    productName: String(data.product_name),
    brand: data.brand == null ? null : String(data.brand),
    imageUrl: data.image_url == null ? null : String(data.image_url),
    amountG: asNumber(data.amount_g),
    calories: asNumber(data.calories),
    proteinG: asNumber(data.protein_g),
    carbsG: asNumber(data.carbs_g),
    fatG: asNumber(data.fat_g),
    source: String(data.source ?? 'open_food_facts'),
    createdAt: String(data.created_at),
  } satisfies NutritionEntry;
}

export async function deleteNutritionEntry(id: string) {
  const userId = await requireUserId();
  const { error } = await supabase.from('nutrition_entries').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

export function calculateProductNutrition(product: FoodProduct, amountG: number): NutritionTotals {
  const factor = Math.max(0, amountG) / 100;
  return {
    calories: round1(product.kcal100g * factor),
    proteinG: round1(product.protein100g * factor),
    carbsG: round1(product.carbs100g * factor),
    fatG: round1(product.fat100g * factor),
  };
}

export async function fetchOpenFoodFactsProduct(barcode: string): Promise<FoodProduct> {
  const clean = barcode.replace(/\D/g, '');
  if (!clean) throw new Error('Der Barcode ist ungültig.');
  const fields = [
    'code',
    'product_name',
    'product_name_de',
    'brands',
    'image_front_small_url',
    'image_front_url',
    'serving_size',
    'serving_quantity',
    'nutriments',
  ].join(',');
  const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(clean)}?fields=${encodeURIComponent(fields)}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'MealFlow/2.2.0 (https://github.com/redshoxx/MealFlow)',
    },
  });
  if (!response.ok) throw new Error('Open Food Facts ist derzeit nicht erreichbar.');
  const payload = await response.json() as any;
  if (payload?.status !== 1 || !payload?.product) throw new Error('Dieses Produkt wurde bei Open Food Facts nicht gefunden.');
  const product = payload.product;
  const nutriments = product.nutriments ?? {};
  let kcal100g = asNumber(nutriments['energy-kcal_100g']);
  if (!kcal100g) {
    const kj100g = asNumber(nutriments['energy-kj_100g'] ?? nutriments.energy_100g);
    if (kj100g > 0) kcal100g = kj100g / 4.184;
  }
  return {
    barcode: clean,
    name: String(product.product_name_de || product.product_name || `Produkt ${clean}`),
    brand: product.brands ? String(product.brands) : undefined,
    imageUrl: product.image_front_small_url || product.image_front_url || undefined,
    servingSize: product.serving_size ? String(product.serving_size) : undefined,
    servingQuantity: asNumber(product.serving_quantity) || undefined,
    kcal100g: round1(kcal100g),
    protein100g: round1(asNumber(nutriments.proteins_100g)),
    carbs100g: round1(asNumber(nutriments.carbohydrates_100g)),
    fat100g: round1(asNumber(nutriments.fat_100g)),
  };
}
