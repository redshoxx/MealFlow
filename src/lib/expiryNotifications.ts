import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import type { PantryItem } from './inventory';

const IDS_KEY = 'mealflow.expiry.notifications.ids.v2.2.2';
const SENT_KEY = 'mealflow.expiry.notifications.sent.v2.2.2';
const WARNING_DAYS = 3;

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  } as any),
});

export type ExpiryInfo = {
  days: number;
  tone: 'expired' | 'today' | 'soon' | 'normal';
  label: string;
};

export function getExpiryInfo(expiresOn: string | null | undefined): ExpiryInfo | null {
  if (!expiresOn) return null;
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const expiry = new Date(`${expiresOn}T12:00:00`);
  if (Number.isNaN(expiry.getTime())) return null;
  const days = Math.round((expiry.getTime() - today.getTime()) / 86400000);
  if (days < 0) return { days, tone: 'expired', label: 'MHD überschritten' };
  if (days === 0) return { days, tone: 'today', label: 'Läuft heute ab' };
  if (days <= WARNING_DAYS) return { days, tone: 'soon', label: days === 1 ? 'Läuft morgen ab' : `Läuft in ${days} Tagen ab` };
  return {
    days,
    tone: 'normal',
    label: `MHD ${expiry.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' })}`,
  };
}

export function getUrgentPantry(items: PantryItem[], maxDays = WARNING_DAYS) {
  return items
    .map((item) => ({ item, info: getExpiryInfo(item.expiresOn) }))
    .filter((entry): entry is { item: PantryItem; info: ExpiryInfo } => Boolean(entry.info && entry.info.days <= maxDays))
    .sort((a, b) => a.info.days - b.info.days);
}

async function ensurePermission() {
  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted;
  if (!granted && current.canAskAgain) {
    const requested = await Notifications.requestPermissionsAsync();
    granted = requested.granted;
  }
  if (granted && Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('mhd', {
      name: 'MHD-Erinnerungen',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 120, 180],
      sound: 'default',
    });
  }
  return granted;
}

function notificationDate(iso: string, hour: number, minute: number, dayOffset = 0) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + dayOffset);
  date.setHours(hour, minute, 0, 0);
  return date;
}

async function schedule(title: string, body: string, date: Date, item: PantryItem) {
  return Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'default',
      data: { screen: 'vorrat', pantryItemId: item.id, expiresOn: item.expiresOn },
    },
    trigger: date as any,
  });
}

export async function syncExpiryNotifications(items: PantryItem[]) {
  const withExpiry = items.filter((item) => Boolean(item.expiresOn));
  const previousIds = JSON.parse((await AsyncStorage.getItem(IDS_KEY)) || '[]') as string[];
  await Promise.all(previousIds.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
  if (!withExpiry.length) {
    await AsyncStorage.setItem(IDS_KEY, '[]');
    return;
  }

  const granted = await ensurePermission();
  if (!granted) return;

  const now = new Date();
  const storedSent = JSON.parse((await AsyncStorage.getItem(SENT_KEY)) || '{}') as Record<string, string>;
  const validPrefixes = new Set(withExpiry.map((item) => `${item.id}:${item.expiresOn}`));
  const sent: Record<string, string> = {};
  for (const [key, value] of Object.entries(storedSent)) {
    if ([...validPrefixes].some((prefix) => key.startsWith(prefix))) sent[key] = value;
  }

  const ids: string[] = [];
  let immediateOffset = 4;

  for (const item of withExpiry) {
    if (!item.expiresOn) continue;
    const info = getExpiryInfo(item.expiresOn);
    if (!info || info.days < 0) continue;

    const todayKey = `${item.id}:${item.expiresOn}:today`;
    const soonKey = `${item.id}:${item.expiresOn}:soon`;
    const todayReminder = notificationDate(item.expiresOn, 8, 30);

    if (info.days > WARNING_DAYS) {
      const warningDate = notificationDate(item.expiresOn, 9, 0, -WARNING_DAYS);
      if (warningDate > now) {
        ids.push(await schedule('MHD bald erreicht', `${item.productName} läuft in ${WARNING_DAYS} Tagen ab.`, warningDate, item));
      }
    } else if (info.days > 0 && !sent[soonKey]) {
      const immediate = new Date(Date.now() + immediateOffset * 1000);
      immediateOffset += 2;
      ids.push(await schedule('Bald aufbrauchen', `${item.productName}: ${info.label}.`, immediate, item));
      sent[soonKey] = new Date().toISOString();
    }

    if (info.days === 0) {
      if (!sent[todayKey]) {
        const immediate = new Date(Date.now() + immediateOffset * 1000);
        immediateOffset += 2;
        ids.push(await schedule('Heute aufbrauchen', `${item.productName} erreicht heute das MHD.`, immediate, item));
        sent[todayKey] = new Date().toISOString();
      }
    } else if (todayReminder > now) {
      ids.push(await schedule('Heute aufbrauchen', `${item.productName} erreicht heute das MHD.`, todayReminder, item));
    }
  }

  await Promise.all([
    AsyncStorage.setItem(IDS_KEY, JSON.stringify(ids)),
    AsyncStorage.setItem(SENT_KEY, JSON.stringify(sent)),
  ]);
}
