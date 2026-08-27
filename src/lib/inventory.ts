import { getActiveHouseholdId } from './cloud';
import { supabase } from './supabase';

export type PantrySource = 'manual' | 'open_food_facts';

export type PantryItem = {
  id: string;
  shoppingItemId: string | null;
  barcode: string | null;
  productName: string;
  brand: string | null;
  imageUrl: string | null;
  quantity: number;
  unit: string;
  expiresOn: string | null;
  source: PantrySource;
  createdAt: string;
};

export type PurchasedForPantry = {
  id: string;
  name: string;
  amount: number;
  unit: string;
  completedAt: string | null;
  stockedAt: string | null;
  scanned: boolean;
};

export type ScannedProduct = {
  barcode: string;
  name: string;
  brand?: string;
  imageUrl?: string;
};

export type PantryDraft = {
  shoppingItemId?: string | null;
  barcode?: string | null;
  productName: string;
  brand?: string | null;
  imageUrl?: string | null;
  quantity: number;
  unit: string;
  expiresOn?: string | null;
  source: PantrySource;
};

function asNumber(value: unknown, fallback = 0) {
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mapPantryRow(row: any): PantryItem {
  return {
    id: String(row.id),
    shoppingItemId: row.shopping_item_id == null ? null : String(row.shopping_item_id),
    barcode: row.barcode == null ? null : String(row.barcode),
    productName: String(row.product_name),
    brand: row.brand == null ? null : String(row.brand),
    imageUrl: row.image_url == null ? null : String(row.image_url),
    quantity: asNumber(row.quantity, 1),
    unit: String(row.unit || 'Stk.'),
    expiresOn: row.expires_on == null ? null : String(row.expires_on),
    source: row.source === 'open_food_facts' ? 'open_food_facts' : 'manual',
    createdAt: String(row.created_at),
  };
}

async function requireUserId() {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Keine aktive Anmeldung gefunden.');
  return data.user.id;
}

export async function loadPantry(): Promise<PantryItem[]> {
  const householdId = await getActiveHouseholdId();
  const { data, error } = await supabase
    .from('pantry_items')
    .select('id,shopping_item_id,barcode,product_name,brand,image_url,quantity,unit,expires_on,source,created_at')
    .eq('household_id', householdId)
    .order('expires_on', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapPantryRow);
}

export async function loadPurchasedForPantry(limit = 60): Promise<PurchasedForPantry[]> {
  const householdId = await getActiveHouseholdId();
  const { data, error } = await supabase
    .from('shopping_items')
    .select('id,name,amount,unit,completed_at,stocked_at')
    .eq('household_id', householdId)
    .eq('done', true)
    .order('completed_at', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    name: String(row.name),
    amount: asNumber(row.amount, 1),
    unit: String(row.unit || 'Stk.'),
    completedAt: row.completed_at == null ? null : String(row.completed_at),
    stockedAt: row.stocked_at == null ? null : String(row.stocked_at),
    scanned: Boolean(row.stocked_at),
  }));
}

export async function fetchInventoryProduct(barcode: string): Promise<ScannedProduct> {
  const clean = barcode.replace(/\D/g, '');
  if (!clean) throw new Error('Der Barcode ist ungültig.');
  const fields = ['code', 'product_name', 'product_name_de', 'brands', 'image_front_small_url', 'image_front_url'].join(',');
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
  return {
    barcode: clean,
    name: String(product.product_name_de || product.product_name || `Produkt ${clean}`),
    brand: product.brands ? String(product.brands) : undefined,
    imageUrl: product.image_front_small_url || product.image_front_url || undefined,
  };
}

export async function addPantryItem(input: PantryDraft): Promise<PantryItem> {
  const householdId = await getActiveHouseholdId();
  const userId = await requireUserId();
  const cleanName = input.productName.trim();
  if (!cleanName) throw new Error('Bitte gib einen Produktnamen ein.');
  if (!(input.quantity > 0)) throw new Error('Bitte gib eine gültige Menge ein.');

  const { data, error } = await supabase
    .from('pantry_items')
    .insert({
      household_id: householdId,
      added_by: userId,
      shopping_item_id: input.shoppingItemId || null,
      barcode: input.barcode || null,
      product_name: cleanName,
      brand: input.brand?.trim() || null,
      image_url: input.imageUrl || null,
      quantity: input.quantity,
      unit: input.unit.trim() || 'Stk.',
      expires_on: input.expiresOn || null,
      source: input.source,
    })
    .select('id,shopping_item_id,barcode,product_name,brand,image_url,quantity,unit,expires_on,source,created_at')
    .single();
  if (error) throw error;

  if (input.shoppingItemId) {
    const { error: shoppingError } = await supabase
      .from('shopping_items')
      .update({ stocked_at: new Date().toISOString(), stocked_by: userId })
      .eq('id', input.shoppingItemId)
      .eq('household_id', householdId)
      .eq('done', true);
    if (shoppingError) {
      await supabase.from('pantry_items').delete().eq('id', data.id).eq('household_id', householdId);
      throw shoppingError;
    }
  }

  return mapPantryRow(data);
}

export async function updatePantryItem(id: string, input: { quantity: number; unit: string; expiresOn?: string | null }) {
  const householdId = await getActiveHouseholdId();
  if (!(input.quantity > 0)) throw new Error('Bitte gib eine gültige Menge ein.');
  const { data, error } = await supabase
    .from('pantry_items')
    .update({ quantity: input.quantity, unit: input.unit.trim() || 'Stk.', expires_on: input.expiresOn || null })
    .eq('id', id)
    .eq('household_id', householdId)
    .select('id,shopping_item_id,barcode,product_name,brand,image_url,quantity,unit,expires_on,source,created_at')
    .single();
  if (error) throw error;
  return mapPantryRow(data);
}

export async function deletePantryItem(id: string) {
  const householdId = await getActiveHouseholdId();
  const { error } = await supabase.from('pantry_items').delete().eq('id', id).eq('household_id', householdId);
  if (error) throw error;
}
