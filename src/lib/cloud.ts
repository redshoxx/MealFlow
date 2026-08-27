import { ID } from 'react-native-appwrite';
import { appwriteConfig, isCloudConfigured, realtime, tablesDB } from './appwrite';

export type ShoppingItem = {
  id: string;
  name: string;
  amount: number;
  unit: string;
  done: boolean;
};

export type MealDay = { day: string; meal: string | null };

type ShoppingRow = { $id: string; name: string; amount: number; unit: string; done: boolean };
type MealRow = { $id: string; day: string; meal?: string | null };

function requireCloud() {
  if (!isCloudConfigured || !tablesDB) throw new Error('Appwrite ist noch nicht konfiguriert.');
  return tablesDB;
}

function toShoppingItem(row: ShoppingRow): ShoppingItem {
  return { id: row.$id, name: String(row.name), amount: Number(row.amount), unit: String(row.unit), done: Boolean(row.done) };
}

export async function loadShopping(): Promise<ShoppingItem[]> {
  if (!isCloudConfigured || !tablesDB) return [];
  const result = await tablesDB.listRows({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.shoppingTableId,
    total: false,
    ttl: 0,
  });
  return (result.rows as unknown as ShoppingRow[]).map(toShoppingItem);
}

export async function addShoppingItem(item: Omit<ShoppingItem, 'id' | 'done'>) {
  const db = requireCloud();
  const row = await db.createRow({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.shoppingTableId,
    rowId: ID.unique(),
    data: { ...item, done: false },
  });
  return toShoppingItem(row as unknown as ShoppingRow);
}

export async function setShoppingDone(id: string, done: boolean) {
  const db = requireCloud();
  await db.updateRow({ databaseId: appwriteConfig.databaseId, tableId: appwriteConfig.shoppingTableId, rowId: id, data: { done } });
}

export async function deleteShoppingItem(id: string) {
  const db = requireCloud();
  await db.deleteRow({ databaseId: appwriteConfig.databaseId, tableId: appwriteConfig.shoppingTableId, rowId: id });
}

export async function loadMealPlan(): Promise<MealDay[]> {
  if (!isCloudConfigured || !tablesDB) return [];
  const result = await tablesDB.listRows({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.mealPlanTableId,
    total: false,
    ttl: 0,
  });
  return (result.rows as unknown as MealRow[]).map((row) => ({ day: String(row.day), meal: row.meal == null ? null : String(row.meal) }));
}

export async function saveMeal(day: string, meal: string | null) {
  const db = requireCloud();
  const current = await db.listRows({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.mealPlanTableId,
    total: false,
    ttl: 0,
  });
  const existing = (current.rows as unknown as MealRow[]).find((row) => row.day === day);

  if (existing) {
    await db.updateRow({ databaseId: appwriteConfig.databaseId, tableId: appwriteConfig.mealPlanTableId, rowId: existing.$id, data: { meal } });
    return;
  }

  await db.createRow({
    databaseId: appwriteConfig.databaseId,
    tableId: appwriteConfig.mealPlanTableId,
    rowId: ID.unique(),
    data: { day, meal },
  });
}

export async function subscribeToCloudChanges(onChange: () => void) {
  if (!isCloudConfigured || !realtime) return null;
  const subscription = await realtime.subscribe(
    [
      `tablesdb.${appwriteConfig.databaseId}.tables.${appwriteConfig.shoppingTableId}.rows`,
      `tablesdb.${appwriteConfig.databaseId}.tables.${appwriteConfig.mealPlanTableId}.rows`,
    ],
    () => onChange(),
  );
  return async () => subscription.unsubscribe();
}
