import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'system' | 'light' | 'dark';
export type StartTab = 'heute' | 'woche' | 'einkauf' | 'notizen';

export type AppPreferences = {
  themeMode: ThemeMode;
  cozyMode: boolean;
  neutralDarkMode: boolean;
  compactShopping: boolean;
  showCompletedShopping: boolean;
  hapticsEnabled: boolean;
  startTab: StartTab;
};

const STORAGE_KEY = 'mealflow.preferences.v2.1.4';

export const DEFAULT_PREFERENCES: AppPreferences = {
  themeMode: 'system',
  cozyMode: false,
  neutralDarkMode: false,
  compactShopping: true,
  showCompletedShopping: true,
  hapticsEnabled: true,
  startTab: 'heute',
};

export async function loadPreferences(): Promise<AppPreferences> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<AppPreferences> & Record<string, unknown>;
    const storedStartTab = typeof parsed.startTab === 'string' ? String(parsed.startTab) : '';
    const retiredTabs = ['rezepte', 'kalorien', 'vorrat', 'budget'];
    const migratedStartTab = retiredTabs.includes(storedStartTab) ? 'notizen' : storedStartTab;
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      cozyMode: Boolean(parsed.cozyMode),
      neutralDarkMode: Boolean(parsed.neutralDarkMode),
      themeMode: ['system', 'light', 'dark'].includes(String(parsed.themeMode)) ? parsed.themeMode as ThemeMode : 'system',
      startTab: ['heute', 'woche', 'einkauf', 'notizen'].includes(migratedStartTab) ? migratedStartTab as StartTab : 'heute',
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function savePreferences(preferences: AppPreferences) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
