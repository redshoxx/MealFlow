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
  nutritionDataComplete: boolean;
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
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = asNumber(value);
    if (parsed > 0) return parsed;
  }
  return 0;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function mapNutritionRow(row: any): NutritionEntry {
  return {
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
  };
}

function servingQuantityFromProduct(product: any) {
  const direct = positiveNumber(product?.serving_quantity);
  if (direct) return direct;
  const match = String(product?.serving_size ?? '').match(/([0-9]+(?:[.,][0-9]+)?)\s*(?:g|ml)\b/i);
  return match ? positiveNumber(match[1]) : 0;
}

function nutrientPer100g(nutriments: any, key: string, servingQuantity: number) {
  const per100g = asNumber(nutriments?.[`${key}_100g`], Number.NaN);
  if (Number.isFinite(per100g) && per100g >= 0) return per100g;

  const perServing = asNumber(nutriments?.[`${key}_serving`], Number.NaN);
  if (servingQuantity > 0 && Number.isFinite(perServing) && perServing >= 0) {
    return (perServing / servingQuantity) * 100;
  }

  return 0;
}

function energyKcalPer100g(nutriments: any, servingQuantity: number) {
  const kcal = nutrientPer100g(nutriments, 'energy-kcal', servingQuantity);
  if (kcal > 0) return kcal;

  let kj = nutrientPer100g(nutriments, 'energy-kj', servingQuantity);
  if (!kj) {
    const genericEnergy = asNumber(nutriments?.energy_100g);
    if (genericEnergy > 0) kj = genericEnergy > 10000 ? genericEnergy / 1000 : genericEnergy;
  }
  return kj > 0 ? kj / 4.184 : 0;
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
  return (data ?? []).map(mapNutritionRow);
}

export async function loadNutritionEntriesRange(startDate: string, endDate: string): Promise<NutritionEntry[]> {
  const userId = await requireUserId();
  const { data, error } = await supabase
    .from('nutrition_entries')
    .select('id,eaten_on,meal_type,barcode,product_name,brand,image_url,amount_g,calories,protein_g,carbs_g,fat_g,source,created_at')
    .eq('user_id', userId)
    .gte('eaten_on', startDate)
    .lte('eaten_on', endDate)
    .order('eaten_on', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapNutritionRow);
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
  return mapNutritionRow(data);
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
    'nutrition_data_per',
    'nutriments',
  ].join(',');
  const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(clean)}?fields=${encodeURIComponent(fields)}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'MealFlow/2.2.1 (https://github.com/redshoxx/MealFlow)',
    },
  });
  if (!response.ok) throw new Error('Open Food Facts ist derzeit nicht erreichbar.');
  const payload = await response.json() as any;
  if (payload?.status !== 1 || !payload?.product) throw new Error('Dieses Produkt wurde bei Open Food Facts nicht gefunden.');

  const product = payload.product;
  const nutriments = product.nutriments ?? {};
  const servingQuantity = servingQuantityFromProduct(product);
  const kcal100g = round1(energyKcalPer100g(nutriments, servingQuantity));
  const protein100g = round1(nutrientPer100g(nutriments, 'proteins', servingQuantity));
  const carbs100g = round1(nutrientPer100g(nutriments, 'carbohydrates', servingQuantity));
  const fat100g = round1(nutrientPer100g(nutriments, 'fat', servingQuantity));
  const hasNutrimentPayload = Boolean(
    nutriments['energy-kcal_100g'] != null || nutriments['energy-kcal_serving'] != null ||
    nutriments.energy_100g != null || nutriments['energy-kj_100g'] != null ||
    nutriments.proteins_100g != null || nutriments.proteins_serving != null ||
    nutriments.carbohydrates_100g != null || nutriments.carbohydrates_serving != null ||
    nutriments.fat_100g != null || nutriments.fat_serving != null
  );

  return {
    barcode: clean,
    name: String(product.product_name_de || product.product_name || `Produkt ${clean}`),
    brand: product.brands ? String(product.brands) : undefined,
    imageUrl: product.image_front_small_url || product.image_front_url || undefined,
    servingSize: product.serving_size ? String(product.serving_size) : undefined,
    servingQuantity: servingQuantity || undefined,
    kcal100g,
    protein100g,
    carbs100g,
    fat100g,
    nutritionDataComplete: hasNutrimentPayload && kcal100g >= 0,
  };
}
