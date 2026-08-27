import 'react-native-url-polyfill/auto';
import { Account, Client, ID, Realtime, TablesDB } from 'react-native-appwrite';

const endpoint = process.env.EXPO_PUBLIC_APPWRITE_ENDPOINT?.trim() ?? '';
const projectId = process.env.EXPO_PUBLIC_APPWRITE_PROJECT_ID?.trim() ?? '';
const databaseId = process.env.EXPO_PUBLIC_APPWRITE_DATABASE_ID?.trim() ?? '';
const shoppingTableId = process.env.EXPO_PUBLIC_APPWRITE_SHOPPING_TABLE_ID?.trim() ?? '';
const mealPlanTableId = process.env.EXPO_PUBLIC_APPWRITE_MEAL_PLAN_TABLE_ID?.trim() ?? '';
const platform = process.env.EXPO_PUBLIC_APPWRITE_PLATFORM?.trim() || 'at.mealflow.app';

export const appwriteConfig = { endpoint, projectId, databaseId, shoppingTableId, mealPlanTableId, platform };
export const isCloudConfigured = Boolean(endpoint && projectId && databaseId && shoppingTableId && mealPlanTableId);

export const client = isCloudConfigured
  ? new Client().setEndpoint(endpoint).setProject(projectId).setPlatform(platform)
  : null;

export const account = client ? new Account(client) : null;
export const tablesDB = client ? new TablesDB(client) : null;
export const realtime = client ? new Realtime(client) : null;

export async function signIn(email: string, password: string) {
  if (!account) throw new Error('Appwrite ist noch nicht konfiguriert.');
  return account.createEmailPasswordSession({ email, password });
}

export async function signUp(email: string, password: string) {
  if (!account) throw new Error('Appwrite ist noch nicht konfiguriert.');
  await account.create({ userId: ID.unique(), email, password });
  return signIn(email, password);
}

export async function hasActiveSession() {
  if (!account) return false;
  try {
    await account.get();
    return true;
  } catch {
    return false;
  }
}

export async function signOut() {
  if (!account) return;
  await account.deleteSession({ sessionId: 'current' });
}
