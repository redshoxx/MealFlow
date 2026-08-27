import AsyncStorage from '@react-native-async-storage/async-storage';

export type ThemeMode = 'system' | 'light' | 'dark';
export type StartTab = 'heute' | 'woche' | 'einkauf' | 'rezepte';

export type AppPreferences = {
  themeMode: ThemeMode;
  compactShopping: boolean;
  showCompletedShopping: boolean;
  hapticsEnabled: boolean;
  startTab: StartTab;
};

const STORAGE_KEY = 'mealflow.preferences.v2.1.4';

export const DEFAULT_PREFERENCES: AppPreferences = {
  themeMode: 'system',
  compactShopping: true,
  showCompletedShopping: true,
  hapticsEnabled: true,
  startTab: 'heute',
};

export async function loadPreferences(): Promise<AppPreferences> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFERENCES;
    const parsed = JSON.parse(raw) as Partial<AppPreferences>;
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      themeMode: ['system', 'light', 'dark'].includes(String(parsed.themeMode)) ? parsed.themeMode as ThemeMode : 'system',
      startTab: ['heute', 'woche', 'einkauf', 'rezepte'].includes(String(parsed.startTab)) ? parsed.startTab as StartTab : 'heute',
    };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

export async function savePreferences(preferences: AppPreferences) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
