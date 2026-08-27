import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import appConfig from '../../app.json';

const UPDATE_MANIFEST_URL = 'https://raw.githubusercontent.com/redshoxx/MealFlow/main/android-update.json';
const ALLOWED_APK_PREFIX = 'https://github.com/redshoxx/MealFlow/releases/download/';
const LAST_PROMPTED_KEY = 'mealflow.androidUpdater.lastPrompted.v1';
const CURRENT_VERSION = appConfig.expo.version;
const CURRENT_VERSION_CODE = Number(appConfig.expo.android?.versionCode ?? 0);

type AndroidUpdateManifest = {
  version: string;
  versionCode: number;
  releasedAt: string;
  downloadUrl: string;
  size?: number;
  sha256?: string;
};

function validateManifest(value: unknown): AndroidUpdateManifest {
  if (!value || typeof value !== 'object') throw new Error('Ungültige Update-Informationen.');
  const manifest = value as Partial<AndroidUpdateManifest>;
  if (!manifest.version || !Number.isInteger(manifest.versionCode) || Number(manifest.versionCode) <= 0) throw new Error('Ungültige Update-Version.');
  if (!manifest.downloadUrl || !manifest.downloadUrl.startsWith(ALLOWED_APK_PREFIX) || !manifest.downloadUrl.endsWith('/MealFlow-Android.apk')) throw new Error('Unsichere Update-Adresse blockiert.');
  return {
    version: String(manifest.version),
    versionCode: Number(manifest.versionCode),
    releasedAt: String(manifest.releasedAt || ''),
    downloadUrl: String(manifest.downloadUrl),
    size: typeof manifest.size === 'number' ? manifest.size : undefined,
    sha256: typeof manifest.sha256 === 'string' ? manifest.sha256 : undefined,
  };
}

async function loadManifest() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(`${UPDATE_MANIFEST_URL}?t=${Date.now()}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Update-Server antwortet mit ${response.status}.`);
    return validateManifest(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

function sizeLabel(bytes?: number) {
  if (!bytes || bytes <= 0) return '';
  return ` · ${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}

async function openUnknownSourcesSettings() {
  await IntentLauncher.startActivityAsync('android.settings.MANAGE_UNKNOWN_APP_SOURCES', {
    data: 'package:at.mealflow.app',
  });
}

export async function installAndroidUpdate(manifest: AndroidUpdateManifest) {
  if (Platform.OS !== 'android') return;
  if (!FileSystem.cacheDirectory) throw new Error('Temporärer Speicher ist nicht verfügbar.');

  const target = `${FileSystem.cacheDirectory}MealFlow-${manifest.version}-${manifest.versionCode}.apk`;
  await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);
  const result = await FileSystem.downloadAsync(manifest.downloadUrl, target);
  if (result.status < 200 || result.status >= 300) throw new Error(`APK-Download fehlgeschlagen (${result.status}).`);

  const info = await FileSystem.getInfoAsync(target);
  if (!info.exists || (manifest.size && Math.abs((info.size ?? 0) - manifest.size) > 2048)) {
    await FileSystem.deleteAsync(target, { idempotent: true }).catch(() => undefined);
    throw new Error('Die heruntergeladene APK ist unvollständig.');
  }

  const contentUri = await FileSystem.getContentUriAsync(target);
  try {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      type: 'application/vnd.android.package-archive',
      flags: 1,
    });
  } catch {
    Alert.alert(
      'Installation erlauben',
      'Android blockiert Installationen aus dieser App noch. Erlaube „Apps aus dieser Quelle“ und starte danach die Update-Suche erneut.',
      [
        { text: 'Später', style: 'cancel' },
        { text: 'Einstellung öffnen', onPress: () => { openUnknownSourcesSettings().catch(() => undefined); } },
      ],
    );
  }
}

export async function checkAndPromptAndroidUpdate(manual = false) {
  if (Platform.OS !== 'android') return false;

  let manifest: AndroidUpdateManifest;
  try {
    manifest = await loadManifest();
  } catch (error) {
    if (manual) {
      const message = error instanceof Error ? error.message : 'Update-Prüfung nicht möglich.';
      Alert.alert('Update-Prüfung', message);
    }
    return false;
  }

  if (manifest.versionCode <= CURRENT_VERSION_CODE) {
    if (manual) Alert.alert('MealFlow ist aktuell', `Version ${CURRENT_VERSION} ist bereits installiert.`);
    return false;
  }

  if (!manual) {
    const lastPrompted = await AsyncStorage.getItem(LAST_PROMPTED_KEY);
    if (lastPrompted === String(manifest.versionCode)) return true;
    await AsyncStorage.setItem(LAST_PROMPTED_KEY, String(manifest.versionCode));
  }

  Alert.alert(
    'MealFlow Update verfügbar',
    `Version ${manifest.version}${sizeLabel(manifest.size)} ist verfügbar. MealFlow lädt die APK direkt vom offiziellen GitHub Release. Android fragt vor der Installation noch einmal nach deiner Bestätigung.`,
    [
      { text: 'Später', style: 'cancel' },
      {
        text: 'Update installieren',
        onPress: () => {
          installAndroidUpdate(manifest).catch((error) => {
            Alert.alert('Update fehlgeschlagen', error instanceof Error ? error.message : 'Die APK konnte nicht installiert werden.');
          });
        },
      },
    ],
  );
  return true;
}
