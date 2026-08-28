import AsyncStorage from '@react-native-async-storage/async-storage';
import { getActiveHouseholdId } from './cloud';
import { supabase } from './supabase';

export type HouseholdBudget = {
  monthlyBudget: number;
  updatedAt?: string | null;
};

export type ProductPrice = {
  productKey: string;
  productName: string;
  unitPrice: number;
  priceUnit: string;
  updatedAt?: string | null;
};

const budgetKey = (householdId: string) => `mealflow.budget.v2.2.9.${householdId}`;
const pricesKey = (householdId: string) => `mealflow.prices.v2.2.9.${householdId}`;

async function loadLocalBudget(householdId: string): Promise<HouseholdBudget> {
  try {
    const raw = await AsyncStorage.getItem(budgetKey(householdId));
    if (!raw) return { monthlyBudget: 400 };
    const parsed = JSON.parse(raw) as HouseholdBudget;
    const value = Number(parsed.monthlyBudget);
    return { monthlyBudget: Number.isFinite(value) && value > 0 ? value : 400, updatedAt: parsed.updatedAt ?? null };
  } catch {
    return { monthlyBudget: 400 };
  }
}

async function saveLocalBudget(householdId: string, budget: HouseholdBudget) {
  await AsyncStorage.setItem(budgetKey(householdId), JSON.stringify(budget));
}

async function loadLocalPrices(householdId: string): Promise<ProductPrice[]> {
  try {
    const raw = await AsyncStorage.getItem(pricesKey(householdId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && typeof entry.productKey === 'string') as ProductPrice[] : [];
  } catch {
    return [];
  }
}

async function saveLocalPrices(householdId: string, prices: ProductPrice[]) {
  await AsyncStorage.setItem(pricesKey(householdId), JSON.stringify(prices));
}

export function normalizeBudgetProductName(value: string) {
  return value
    .toLocaleLowerCase('de-AT')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function suggestedPriceUnit(shoppingUnit: string) {
  if (shoppingUnit === 'g') return 'kg';
  if (shoppingUnit === 'ml') return 'l';
  return shoppingUnit || 'Stk.';
}

export function estimateWithPrice(amount: number, shoppingUnit: string, price: ProductPrice | undefined) {
  if (!price || !Number.isFinite(price.unitPrice) || price.unitPrice < 0) return null;
  let comparableAmount = Number(amount) || 0;
  if (shoppingUnit === 'g' && price.priceUnit === 'kg') comparableAmount /= 1000;
  else if (shoppingUnit === 'ml' && price.priceUnit === 'l') comparableAmount /= 1000;
  else if (shoppingUnit === 'kg' && price.priceUnit === 'g') comparableAmount *= 1000;
  else if (shoppingUnit === 'l' && price.priceUnit === 'ml') comparableAmount *= 1000;
  else if (shoppingUnit !== price.priceUnit) return null;
  return Math.max(0, comparableAmount * price.unitPrice);
}

export async function loadHouseholdBudget(): Promise<HouseholdBudget> {
  const householdId = await getActiveHouseholdId();
  const local = await loadLocalBudget(householdId);
  try {
    const { data, error } = await supabase
      .from('household_budgets')
      .select('monthly_budget,updated_at')
      .eq('household_id', householdId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return local;
    const remote = { monthlyBudget: Number(data.monthly_budget ?? local.monthlyBudget), updatedAt: data.updated_at ?? null };
    await saveLocalBudget(householdId, remote).catch(() => undefined);
    return remote;
  } catch {
    return local;
  }
}

export async function saveHouseholdBudget(monthlyBudget: number): Promise<HouseholdBudget> {
  const householdId = await getActiveHouseholdId();
  const value = Number(monthlyBudget);
  if (!Number.isFinite(value) || value <= 0 || value > 100000) throw new Error('Bitte gib ein gültiges Monatsbudget ein.');
  const local: HouseholdBudget = { monthlyBudget: Math.round(value * 100) / 100, updatedAt: new Date().toISOString() };
  await saveLocalBudget(householdId, local);
  try {
    const { data, error } = await supabase
      .from('household_budgets')
      .upsert({ household_id: householdId, monthly_budget: local.monthlyBudget, updated_by: (await supabase.auth.getUser()).data.user?.id ?? null }, { onConflict: 'household_id' })
      .select('monthly_budget,updated_at')
      .single();
    if (error) throw error;
    const remote = { monthlyBudget: Number(data.monthly_budget), updatedAt: data.updated_at ?? null };
    await saveLocalBudget(householdId, remote).catch(() => undefined);
    return remote;
  } catch {
    return local;
  }
}

export async function loadProductPrices(): Promise<ProductPrice[]> {
  const householdId = await getActiveHouseholdId();
  const local = await loadLocalPrices(householdId);
  try {
    const { data, error } = await supabase
      .from('household_product_prices')
      .select('product_key,product_name,unit_price,price_unit,updated_at')
      .eq('household_id', householdId)
      .order('product_name', { ascending: true });
    if (error) throw error;
    const remote = (data ?? []).map((row: any) => ({
      productKey: String(row.product_key),
      productName: String(row.product_name),
      unitPrice: Number(row.unit_price),
      priceUnit: String(row.price_unit),
      updatedAt: row.updated_at ?? null,
    }));
    const merged = new Map<string, ProductPrice>();
    local.forEach((entry) => merged.set(entry.productKey, entry));
    remote.forEach((entry) => merged.set(entry.productKey, entry));
    const result = Array.from(merged.values()).sort((a, b) => a.productName.localeCompare(b.productName, 'de-AT'));
    await saveLocalPrices(householdId, result).catch(() => undefined);
    return result;
  } catch {
    return local;
  }
}

export async function saveProductPrice(productName: string, unitPrice: number, priceUnit: string): Promise<ProductPrice> {
  const householdId = await getActiveHouseholdId();
  const cleanName = productName.trim().slice(0, 120);
  const productKey = normalizeBudgetProductName(cleanName);
  const cleanUnit = priceUnit.trim().slice(0, 24);
  const price = Number(unitPrice);
  if (!cleanName || !productKey) throw new Error('Produktname fehlt.');
  if (!cleanUnit) throw new Error('Preiseinheit fehlt.');
  if (!Number.isFinite(price) || price < 0 || price > 100000) throw new Error('Bitte gib einen gültigen Preis ein.');

  const localPrice: ProductPrice = {
    productKey,
    productName: cleanName,
    unitPrice: Math.round(price * 100) / 100,
    priceUnit: cleanUnit,
    updatedAt: new Date().toISOString(),
  };
  const localPrices = await loadLocalPrices(householdId);
  await saveLocalPrices(householdId, [localPrice, ...localPrices.filter((entry) => entry.productKey !== productKey)]);

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError) throw userError;
    if (!userData.user) throw new Error('Keine aktive Anmeldung gefunden.');
    const { data, error } = await supabase
      .from('household_product_prices')
      .upsert({
        household_id: householdId,
        product_key: productKey,
        product_name: cleanName,
        unit_price: localPrice.unitPrice,
        price_unit: cleanUnit,
        updated_by: userData.user.id,
      }, { onConflict: 'household_id,product_key' })
      .select('product_key,product_name,unit_price,price_unit,updated_at')
      .single();
    if (error) throw error;
    const remote = {
      productKey: String(data.product_key),
      productName: String(data.product_name),
      unitPrice: Number(data.unit_price),
      priceUnit: String(data.price_unit),
      updatedAt: data.updated_at ?? null,
    };
    const prices = await loadLocalPrices(householdId);
    await saveLocalPrices(householdId, [remote, ...prices.filter((entry) => entry.productKey !== remote.productKey)]).catch(() => undefined);
    return remote;
  } catch {
    return localPrice;
  }
}
