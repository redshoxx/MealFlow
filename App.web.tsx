import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Alert,
  Appearance,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  addShoppingItem,
  clearHouseholdCache,
  createHouseholdJoinCode,
  deleteShoppingItem,
  joinHouseholdByCode,
  loadHousehold,
  loadMealPlan,
  loadShopping,
  removeHouseholdMember,
  saveMeal,
  saveSaskiaMeal,
  setHouseholdInvitePermission,
  setShoppingDone,
  updateShoppingItem,
  type Household,
  type ShoppingItem,
} from './src/lib/cloud';
import { DEFAULT_PREFERENCES, loadPreferences, savePreferences, type AppPreferences, type StartTab, type ThemeMode } from './src/lib/preferences';
import { isCloudConfigured, supabase } from './src/lib/supabase';
import { ProteinRecipesScreen, refreshProteinRecipeStyles } from './src/screens/ProteinRecipesScreen';
import { TodayOverviewScreen, refreshTodayOverviewStyles } from './src/screens/TodayOverviewScreen';
import { MealPlanOverviewScreen, refreshMealPlanOverviewStyles } from './src/screens/MealPlanOverviewScreen';
import { refreshUiComponentStyles } from './src/ui/components';
import { colors, radius, setThemePalette, spacing, typography } from './src/ui/theme';
import appConfig from './app.json';

type Tab = StartTab;
type PlanSlot = 'main' | 'saskia';

type WeekDay = {
  date: Date;
  iso: string;
  weekday: string;
  day: string;
  month: string;
};

const APP_VERSION = appConfig.expo.version;
const UNITS = ['Stk.', 'Pkg.', 'g', 'kg', 'ml', 'l', 'Dose', 'Bund'];
const NAV: Array<{ key: Tab; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }> = [
  { key: 'heute', label: 'Heute', icon: 'home-variant-outline' },
  { key: 'woche', label: '4-Wochen-Plan', icon: 'calendar-month-outline' },
  { key: 'einkauf', label: 'Einkauf', icon: 'cart-outline' },
  { key: 'rezepte', label: 'Rezepte', icon: 'food-apple-outline' },
];

const LIDL_GROUPS: Array<{ label: string; words: string[] }> = [
  { label: 'Obst & Gemüse', words: ['apfel', 'banane', 'tomate', 'gurke', 'paprika', 'kartoffel', 'erdapfel', 'zwiebel', 'knoblauch', 'salat', 'zucchini', 'karotte', 'brokkoli', 'avocado', 'zitrone', 'orange', 'beere', 'pilz', 'kurbis', 'spinat', 'mango', 'kiwi', 'birne'] },
  { label: 'Backwaren', words: ['brot', 'semmel', 'toast', 'baguette', 'croissant', 'weckerl'] },
  { label: 'Kühlung & Milchprodukte', words: ['milch', 'butter', 'joghurt', 'käse', 'kase', 'topfen', 'sahne', 'obers', 'mozzarella', 'feta', 'ei', 'eier'] },
  { label: 'Fleisch, Wurst & Fisch', words: ['fleisch', 'huhn', 'hendl', 'rind', 'schwein', 'hackfleisch', 'faschiert', 'wurst', 'schinken', 'speck', 'salami', 'fisch', 'lachs'] },
  { label: 'Grundnahrungsmittel', words: ['nudel', 'pasta', 'reis', 'mehl', 'zucker', 'salz', 'öl', 'ol', 'essig', 'linsen', 'gewürz', 'gewurz'] },
  { label: 'Konserven & Saucen', words: ['tomatenmark', 'konserve', 'ketchup', 'mayonnaise', 'mayo', 'senf', 'sauce', 'pesto', 'dose', 'mais', 'bohnen'] },
  { label: 'Frühstück', words: ['müsli', 'musli', 'hafer', 'cornflakes', 'marmelade', 'honig', 'kaffee', 'tee'] },
  { label: 'Snacks & Süßes', words: ['schokolade', 'chips', 'keks', 'gummi', 'nuss', 'popcorn', 'riegel', 'bonbon'] },
  { label: 'Getränke', words: ['wasser', 'mineral', 'cola', 'limo', 'saft', 'eistee', 'energy', 'sirup', 'getränk', 'getrank'] },
  { label: 'Tiefkühlung', words: ['tiefkühl', 'tiefkuhl', 'tk ', 'eiscreme', 'speiseeis', 'pommes', 'frozen'] },
  { label: 'Haushalt & Drogerie', words: ['toilettenpapier', 'küchenrolle', 'kuchenrolle', 'waschmittel', 'spülmittel', 'spulmittel', 'reiniger', 'müllbeutel', 'mullbeutel', 'zahnpasta', 'shampoo', 'duschgel', 'seife', 'deo'] },
];

function normalize(value: string) {
  return value.toLocaleLowerCase('de-AT').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').trim();
}

function formatAmount(value: number) {
  return Number.isInteger(value) ? String(value) : String(value).replace('.', ',');
}

function isoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function currentWeek(offset = 0): WeekDay[] {
  const now = new Date();
  now.setHours(12, 0, 0, 0);
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((now.getDay() + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return {
      date,
      iso: isoDate(date),
      weekday: date.toLocaleDateString('de-AT', { weekday: 'long' }),
      day: date.toLocaleDateString('de-AT', { day: '2-digit' }),
      month: date.toLocaleDateString('de-AT', { month: 'short' }).replace('.', ''),
    };
  });
}

function groupShopping(items: ShoppingItem[]) {
  const result = new Map<string, ShoppingItem[]>();
  for (const item of items) {
    const name = normalize(item.name);
    const group = LIDL_GROUPS.find((entry) => entry.words.some((word) => name.includes(normalize(word))))?.label ?? 'Sonstiges';
    const list = result.get(group) ?? [];
    list.push(item);
    result.set(group, list);
  }
  const order = [...LIDL_GROUPS.map((entry) => entry.label), 'Sonstiges'];
  return order
    .filter((label) => result.has(label))
    .map((label) => ({ label, items: (result.get(label) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'de-AT')) }));
}

function webShoppingItemFromRealtimeRow(row: any, household: Household): ShoppingItem | null {
  const id = row?.id ? String(row.id) : '';
  const name = typeof row?.name === 'string' ? row.name : '';
  if (!id || !name) return null;

  const addedBy = row?.owner_id ? String(row.owner_id) : null;
  const completedBy = row?.completed_by ? String(row.completed_by) : null;
  const memberName = (userId: string | null) => userId
    ? household.members.find((member) => member.userId === userId)?.displayName ?? 'Mitglied'
    : null;

  return {
    id,
    name,
    amount: Number(row?.amount ?? 1),
    unit: String(row?.unit ?? 'Stk.'),
    done: Boolean(row?.done),
    completedBy,
    completedByName: memberName(completedBy),
    completedAt: row?.completed_at ? String(row.completed_at) : null,
    addedBy,
    addedByName: memberName(addedBy),
  };
}

function mergeWebRealtimeShoppingItem(current: ShoppingItem[], next: ShoppingItem) {
  const existingIndex = current.findIndex((item) => item.id === next.id);
  if (existingIndex >= 0) {
    return current.map((item, index) => index === existingIndex ? { ...item, ...next } : item);
  }
  const optimisticIndex = current.findIndex((item) => (
    item.id.startsWith('local-')
    && normalize(item.name) === normalize(next.name)
    && Number(item.amount) === Number(next.amount)
    && item.unit === next.unit
  ));
  if (optimisticIndex >= 0) {
    return current.map((item, index) => index === optimisticIndex ? next : item);
  }
  return [next, ...current];
}

function applyTheme(preferences: AppPreferences) {
  const dark = preferences.themeMode === 'dark' || (preferences.themeMode === 'system' && Appearance.getColorScheme() === 'dark');
  setThemePalette(dark ? 'dark' : 'light', preferences.cozyMode, preferences.neutralDarkMode);
  styles = createStyles();
  refreshUiComponentStyles();
  refreshProteinRecipeStyles();
  refreshTodayOverviewStyles();
  refreshMealPlanOverviewStyles();
  return dark;
}

function WebButton({ label, icon, onPress, variant = 'primary', disabled = false }: { label: string; icon?: React.ComponentProps<typeof MaterialCommunityIcons>['name']; onPress: () => void; variant?: 'primary' | 'secondary' | 'danger'; disabled?: boolean }) {
  const primary = variant === 'primary';
  const danger = variant === 'danger';
  return <Pressable disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.button, primary && styles.buttonPrimary, danger && styles.buttonDanger, disabled && styles.disabled, pressed && styles.pressed]}>
    {icon ? <MaterialCommunityIcons name={icon} size={18} color={primary ? colors.onAccent : danger ? colors.danger : colors.text} /> : null}
    <Text style={[styles.buttonText, primary && styles.buttonTextPrimary, danger && styles.buttonTextDanger]}>{label}</Text>
  </Pressable>;
}

function IconAction({ icon, onPress, danger = false, label }: { icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; onPress: () => void; danger?: boolean; label: string }) {
  return <Pressable accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.iconAction, danger && styles.iconActionDanger, pressed && styles.pressed]}>
    <MaterialCommunityIcons name={icon} size={19} color={danger ? colors.danger : colors.textSecondary} />
  </Pressable>;
}

function WebBrandMark({ size = 58 }: { size?: number }) {
  return <Image
    source={require('./assets/icon.png')}
    resizeMode="contain"
    style={{ width: size, height: size, borderRadius: Math.round(size * 0.24) }}
    accessibilityLabel="MealFlow Logo"
  />;
}

function PageHeader({ eyebrow, title, subtitle, onSettings }: { eyebrow?: string; title: string; subtitle: string; onSettings: () => void }) {
  return <View style={styles.pageHeader}>
    <View style={styles.flex1}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.pageTitle}>{title}</Text>
      <Text style={styles.pageSubtitle}>{subtitle}</Text>
    </View>
    <IconAction icon="cog-outline" onPress={onSettings} label="Einstellungen" />
  </View>;
}

function AuthScreen() {
  const [register, setRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    if (!email.trim() || password.length < 6) {
      setError('Bitte gib eine gültige E-Mail-Adresse und ein Passwort mit mindestens 6 Zeichen ein.');
      return;
    }
    setBusy(true);
    try {
      if (register) {
        const { error: authError } = await supabase.auth.signUp({ email: email.trim(), password });
        if (authError) throw authError;
        Alert.alert('Konto erstellt', 'Falls die E-Mail-Bestätigung aktiv ist, bestätige zuerst deine E-Mail-Adresse.');
      } else {
        const { error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (authError) throw authError;
      }
    } catch (e: any) {
      setError(e?.message || 'Anmeldung fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  };

  return <View style={styles.authRoot}>
    <View style={styles.authLeft}>
      <WebBrandMark size={62} />
      <Text style={styles.authBrand}>MealFlow</Text>
      <Text style={styles.authHero}>Gemeinsam planen. Einfach einkaufen.</Text>
      <Text style={styles.authCopy}>Die Web-Version synchronisiert Haushalt, 4-Wochen-Plan und Einkauf mit der App. Gesunde Rezepte sind direkt verfügbar.</Text>
      <View style={styles.authFeatureList}>
        {['Realtime-Synchronisierung', 'Responsive für Desktop & Tablet', 'Gleicher MealFlow-Account'].map((item) => <View key={item} style={styles.authFeature}><MaterialCommunityIcons name="check-circle" size={19} color={colors.accent} /><Text style={styles.authFeatureText}>{item}</Text></View>)}
      </View>
    </View>
    <View style={styles.authPanel}>
      <Text style={styles.authPanelEyebrow}>{register ? 'NEUES KONTO' : 'WILLKOMMEN ZURÜCK'}</Text>
      <Text style={styles.authPanelTitle}>{register ? 'MealFlow registrieren' : 'Bei MealFlow anmelden'}</Text>
      <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="E-Mail-Adresse" placeholderTextColor={colors.textTertiary} style={styles.input} />
      <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Passwort" placeholderTextColor={colors.textTertiary} style={styles.input} onSubmitEditing={submit} />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      <Pressable disabled={busy} onPress={submit} style={({ pressed }) => [styles.authSubmit, (pressed || busy) && styles.pressed]}>
        {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.authSubmitText}>{register ? 'Konto erstellen' : 'Anmelden'}</Text>}
      </Pressable>
      <Pressable onPress={() => { setRegister((value) => !value); setError(''); }}><Text style={styles.authSwitch}>{register ? 'Schon registriert? Anmelden' : 'Noch kein Konto? Registrieren'}</Text></Pressable>
    </View>
  </View>;
}

function HomeScreen({ household, items, meals, saskiaMeals, onNavigate, onSettings }: { household: Household; items: ShoppingItem[]; meals: Record<string, string>; saskiaMeals: Record<string, string>; onNavigate: (tab: Tab) => void; onSettings: () => void }) {
  const now = new Date();
  const today = isoDate(now);
  const name = household.myDisplayName?.trim();
  const greeting = now.getHours() < 11 ? 'Guten Morgen' : now.getHours() < 17 ? 'Guten Tag' : 'Guten Abend';
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() + index);
    const iso = isoDate(date);
    return { iso, date, planned: Number(Boolean(meals[iso])) + Number(Boolean(saskiaMeals[iso])) };
  });
  const planned = week.reduce((count, day) => count + day.planned, 0);
  const openItems = items.filter((item) => !item.done);
  const tomorrow = week[1]!;
  return <ScrollView contentContainerStyle={styles.pageContent}>
    <PageHeader eyebrow={`${now.toLocaleDateString('de-AT', { weekday: 'long', day: '2-digit', month: 'long' })} · ${household.name}`}
      title={`${greeting}${name ? `, ${name}` : ''}`} subtitle="Dein Tag, übersichtlich geplant – alles Wichtige auf einer Seite." onSettings={onSettings} />

    <View style={styles.webOverviewHero}>
      <View style={styles.webOverviewHeading}><View style={styles.flex1}><Text style={styles.webOverviewEyebrow}>DIE NÄCHSTEN 7 TAGE</Text><Text style={styles.webOverviewTitle}>{planned} von 14 Gerichten geplant</Text></View><MaterialCommunityIcons name="calendar-check-outline" size={30} color={colors.onAccent} /></View>
      <View style={styles.webOverviewTrack}><View style={[styles.webOverviewFill, { width: `${Math.round(planned / 14 * 100)}%` as `${number}%` }]} /></View>
      <View style={styles.webOverviewDays}>{week.map((day, index) => <Pressable key={day.iso} onPress={() => onNavigate('woche')} style={[styles.webOverviewDay, index === 0 && styles.webOverviewDayCurrent]}>
        <Text style={[styles.webOverviewDayText, index === 0 && styles.webOverviewDayTextCurrent]}>{day.date.toLocaleDateString('de-AT', { weekday: 'short' }).slice(0, 2)}</Text>
        <Text style={[styles.webOverviewDayNumber, index === 0 && styles.webOverviewDayTextCurrent]}>{day.date.getDate()}</Text>
        <View style={styles.webOverviewDots}><View style={[styles.webOverviewDot, day.planned >= 1 && styles.webOverviewDotDone]} /><View style={[styles.webOverviewDot, day.planned >= 2 && styles.webOverviewDotDone]} /></View>
      </Pressable>)}</View>
    </View>

    <View style={styles.webSectionHeading}><Text style={styles.pageTitle}>Heute auf dem Speiseplan</Text><WebButton label="Plan bearbeiten" icon="calendar-outline" variant="secondary" onPress={() => onNavigate('woche')} /></View>
    <View style={styles.webTodayMeals}>
      <Pressable onPress={() => onNavigate('woche')} style={[styles.card, styles.webTodayMealCard]}>
        <View style={styles.webTodayMealTop}><MaterialCommunityIcons name="silverware-fork-knife" size={25} color={colors.accent} /><Text style={styles.cardEyebrow}>ABENDESSEN</Text></View>
        <Text style={styles.webTodayMealTitle}>{meals[today] || 'Noch kein Gericht geplant'}</Text>
        <Text style={styles.cardCopy}>{meals[today] ? 'Für heute eingeplant' : 'Gericht auswählen und eintragen'}</Text>
      </Pressable>
      <Pressable onPress={() => onNavigate('woche')} style={[styles.card, styles.webTodayMealCard, styles.webTodayMealSaskia]}>
        <View style={styles.webTodayMealTop}><MaterialCommunityIcons name="account-heart-outline" size={25} color={colors.accent} /><Text style={styles.cardEyebrow}>FÜR SASKIA</Text></View>
        <Text style={styles.webTodayMealTitle}>{saskiaMeals[today] || 'Noch kein Gericht geplant'}</Text>
        <Text style={styles.cardCopy}>Separater Essensplatz für Saskia</Text>
      </Pressable>
    </View>

    <View style={styles.webTodayBottom}>
      <View style={[styles.card, styles.webTodayPanel]}>
        <View style={styles.webSectionHeading}><Text style={styles.webTodaySubTitle}>Einkauf</Text><Pressable onPress={() => onNavigate('einkauf')}><Text style={styles.webTodayLink}>Zur Liste →</Text></Pressable></View>
        <Text style={styles.cardCopy}>{openItems.length} Produkte noch offen</Text>
        {openItems.slice(0, 4).map((item) => <View key={item.id} style={styles.webShoppingPreview}><MaterialCommunityIcons name="circle-outline" size={17} color={colors.textSecondary} /><Text style={styles.webShoppingName} numberOfLines={1}>{item.name}</Text><Text style={styles.cardCopy}>{item.amount} {item.unit}</Text></View>)}
        {!openItems.length ? <Text style={styles.cardCopy}>Einkaufsliste erledigt.</Text> : null}
      </View>
      <View style={[styles.card, styles.webTodayPanel]}>
        <Text style={styles.webTodaySubTitle}>Was steht morgen an?</Text>
        <Text style={styles.cardCopy}>{tomorrow.date.toLocaleDateString('de-AT', { weekday: 'long', day: '2-digit', month: 'long' })}</Text>
        <Text style={styles.webTodayMealTitle}>{meals[tomorrow.iso] || 'Noch nichts geplant'}</Text>
        {saskiaMeals[tomorrow.iso] ? <Text style={styles.cardCopy}>Für Saskia: {saskiaMeals[tomorrow.iso]}</Text> : null}
        <View style={styles.webTodayBottomActions}>
          <WebButton label="Rezepte entdecken" icon="food-apple-outline" onPress={() => onNavigate('rezepte')} />
        </View>
      </View>
    </View>
  </ScrollView>;
}

function PlanScreen({ household, meals, saskiaMeals, onChanged, onSettings }: { household: Household; meals: Record<string, string>; saskiaMeals: Record<string, string>; onChanged: () => Promise<void>; onSettings: () => void }) {
  const [week, setWeek] = useState(0);
  const [editor, setEditor] = useState<{ day: WeekDay; slot: PlanSlot } | null>(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const weeks = useMemo(() => [0, 1, 2, 3].map(currentWeek), []);
  const selected = weeks[week] ?? weeks[0]!;
  const allDays = weeks.flat();
  const planned = allDays.reduce((count, day) => count + (meals[day.iso] ? 1 : 0) + (saskiaMeals[day.iso] ? 1 : 0), 0);

  const open = (day: WeekDay, slot: PlanSlot) => {
    setEditor({ day, slot });
    setValue(slot === 'saskia' ? (saskiaMeals[day.iso] ?? '') : (meals[day.iso] ?? ''));
  };

  const save = async () => {
    if (!editor) return;
    setBusy(true);
    try {
      if (editor.slot === 'saskia') await saveSaskiaMeal(editor.day.iso, value.trim() || null);
      else await saveMeal(editor.day.iso, value.trim() || null);
      await onChanged();
      setEditor(null);
    } catch (e: any) {
      Alert.alert('Planung nicht gespeichert', e?.message || 'Bitte versuche es erneut.');
    } finally {
      setBusy(false);
    }
  };

  return <>
    <ScrollView contentContainerStyle={styles.pageContent}>
      <PageHeader eyebrow={`${household.name} · ${planned} von 56 Gerichten geplant`} title="4-Wochen-Plan" subtitle="Aktuelle Kalenderwoche plus drei weitere Wochen. Pro Tag gibt es ein normales Abendessen und einen eigenen Platz für Saskia." onSettings={onSettings} />
      <View style={styles.weekTabs}>{weeks.map((days, index) => {
        const first = days[0]!;
        const last = days[6]!;
        return <Pressable key={index} onPress={() => setWeek(index)} style={[styles.weekTab, week === index && styles.weekTabActive]}>
          <Text style={[styles.weekTabTitle, week === index && styles.weekTabTitleActive]}>Woche {index + 1}</Text>
          <Text style={styles.weekTabRange}>{first.day}.{first.date.toLocaleDateString('de-AT', { month: '2-digit' })} – {last.day}.{last.date.toLocaleDateString('de-AT', { month: '2-digit' })}</Text>
        </Pressable>;
      })}</View>
      <View style={styles.planGrid}>{selected.map((day) => {
        const main = meals[day.iso] ?? '';
        const saskia = saskiaMeals[day.iso] ?? '';
        return <View key={day.iso} style={[styles.card, styles.dayCard]}>
          <View style={styles.dayHeader}><View><Text style={styles.dayWeekday}>{day.weekday}</Text><Text style={styles.dayDate}>{day.day}. {day.month}</Text></View><Text style={styles.dayCount}>{(main ? 1 : 0) + (saskia ? 1 : 0)}/2</Text></View>
          <Pressable onPress={() => open(day, 'main')} style={styles.mealSlot}><Text style={styles.slotLabel}>ABENDESSEN</Text><Text style={[styles.slotValue, !main && styles.slotEmpty]} numberOfLines={2}>{main || 'Gericht hinzufügen'}</Text></Pressable>
          <Pressable onPress={() => open(day, 'saskia')} style={[styles.mealSlot, styles.saskiaSlot]}><Text style={styles.slotLabelAccent}>FÜR SASKIA</Text><Text style={[styles.slotValue, !saskia && styles.slotEmpty]} numberOfLines={2}>{saskia || 'Gericht für Saskia hinzufügen'}</Text></Pressable>
        </View>;
      })}</View>
    </ScrollView>
    <Modal transparent visible={Boolean(editor)} animationType="fade" onRequestClose={() => setEditor(null)}>
      <View style={styles.overlay}><View style={styles.dialog}>
        <Text style={styles.dialogEyebrow}>{editor?.slot === 'saskia' ? 'FÜR SASKIA' : 'ABENDESSEN'}</Text>
        <Text style={styles.dialogTitle}>{editor?.day.weekday}, {editor?.day.day}. {editor?.day.month}</Text>
        <TextInput autoFocus value={value} onChangeText={setValue} placeholder="Gericht eingeben" placeholderTextColor={colors.textTertiary} style={styles.input} onSubmitEditing={save} />
        <View style={styles.dialogActions}><WebButton label="Abbrechen" variant="secondary" onPress={() => setEditor(null)} /><WebButton label={busy ? 'Speichern …' : 'Speichern'} icon="check" onPress={save} disabled={busy} /></View>
      </View></View>
    </Modal>
  </>;
}

function ShoppingScreen({ household, items, setItems, onSettings }: {
  household: Household;
  items: ShoppingItem[];
  setItems: React.Dispatch<React.SetStateAction<ShoppingItem[]>>;
  onSettings: () => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [shoppingMode, setShoppingMode] = useState(false);
  const [editing, setEditing] = useState<ShoppingItem | null>(null);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('1');
  const [unit, setUnit] = useState('Stk.');
  const [completedOpen, setCompletedOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const openItems = useMemo(() => items.filter((item) => !item.done), [items]);
  const completed = useMemo(() => items.filter((item) => item.done), [items]);
  const groups = useMemo(() => groupShopping(openItems), [openItems]);

  const openForm = (item?: ShoppingItem) => {
    setEditing(item ?? null);
    setName(item?.name ?? '');
    setAmount(item ? String(item.amount) : '1');
    setUnit(item?.unit ?? 'Stk.');
    setFormOpen(true);
  };

  const save = async () => {
    const clean = name.trim();
    const numeric = Number(amount.replace(',', '.'));
    if (busy || !clean || !Number.isFinite(numeric) || numeric <= 0) return;
    setBusy(true);
    const original = editing;
    const temporary: ShoppingItem | null = original ? null : {
      id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: clean,
      amount: numeric,
      unit,
      done: false,
      addedByName: household.myDisplayName,
    };
    if (original) {
      setItems((current) => current.map((entry) =>
        entry.id === original.id ? { ...entry, name: clean, amount: numeric, unit } : entry));
    } else if (temporary) {
      setItems((current) => [temporary, ...current]);
    }
    setFormOpen(false);
    try {
      if (original) {
        const remote = await updateShoppingItem(original.id, { name: clean, amount: numeric, unit });
        setItems((current) => current.map((entry) => entry.id === original.id ? { ...entry, ...remote } : entry));
      } else if (temporary) {
        const remote = await addShoppingItem({ name: clean, amount: numeric, unit });
        setItems((current) => mergeWebRealtimeShoppingItem(
          current.filter((entry) => entry.id !== temporary.id),
          remote,
        ));
      }
    } catch (e: any) {
      if (original) {
        setItems((current) => current.map((entry) => entry.id === original.id ? original : entry));
      } else if (temporary) {
        setItems((current) => current.filter((entry) => entry.id !== temporary.id));
      }
      Alert.alert('Produkt nicht gespeichert', e?.message || 'Bitte versuche es erneut.');
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (item: ShoppingItem) => {
    const nextDone = !item.done;
    setItems((current) => current.map((entry) =>
      entry.id === item.id ? {
        ...entry,
        done: nextDone,
        completedByName: nextDone ? household.myDisplayName : null,
      } : entry));
    try {
      await setShoppingDone(item.id, nextDone);
    } catch (e: any) {
      setItems((current) => current.map((entry) =>
        entry.id === item.id && entry.done === nextDone ? item : entry));
      Alert.alert('Änderung fehlgeschlagen', e?.message || 'Bitte versuche es erneut.');
    }
  };

  const remove = async (item: ShoppingItem) => {
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    try {
      await deleteShoppingItem(item.id);
    } catch (e: any) {
      setItems((current) => current.some((entry) => entry.id === item.id) ? current : [item, ...current]);
      Alert.alert('Löschen fehlgeschlagen', e?.message || 'Bitte versuche es erneut.');
    }
  };

  const row = (item: ShoppingItem, mode = false) => <View key={item.id} style={styles.shoppingRow}>
    <Pressable onPress={() => toggle(item)} style={[styles.check, item.done && styles.checkDone]}>{item.done ? <MaterialCommunityIcons name="check" size={16} color={colors.onAccent} /> : null}</Pressable>
    <View style={styles.flex1}><Text style={[styles.shoppingName, item.done && styles.doneText]}>{item.name}</Text><Text style={styles.shoppingMeta}>{formatAmount(item.amount)} {item.unit}{item.addedByName ? ` · von ${item.addedByName}` : ''}</Text></View>
    {!mode ? <View style={styles.rowActions}><IconAction icon="pencil-outline" onPress={() => openForm(item)} label={`${item.name} bearbeiten`} /><IconAction icon="trash-can-outline" onPress={() => remove(item)} danger label={`${item.name} löschen`} /></View> : null}
  </View>;

  return <>
    <ScrollView contentContainerStyle={styles.pageContent}>
      <PageHeader eyebrow={`${household.name} · Lidl-orientiert sortiert`} title="Einkauf" subtitle={`${openItems.length} Produkte offen. Änderungen werden in Echtzeit mit allen Geräten synchronisiert.`} onSettings={onSettings} />
      <View style={styles.shoppingTopActions}><WebButton label="Einkaufsmodus" icon="cart-check" variant="secondary" onPress={() => setShoppingMode(true)} disabled={!openItems.length} /><WebButton label="Produkt hinzufügen" icon="plus" onPress={() => openForm()} /></View>
      {groups.length ? <View style={styles.shoppingGroups}>{groups.map((group) => <View key={group.label} style={styles.shoppingGroup}><View style={styles.groupHeader}><Text style={styles.groupTitle}>{group.label}</Text><Text style={styles.groupCount}>{group.items.length}</Text></View><View style={[styles.card, styles.listCard]}>{group.items.map((item) => row(item))}</View></View>)}</View> : <View style={[styles.card, styles.emptyCard]}><MaterialCommunityIcons name="cart-check" size={30} color={colors.accent} /><Text style={styles.emptyTitle}>Alles erledigt</Text><Text style={styles.cardCopy}>Die gemeinsame Einkaufsliste ist aktuell leer.</Text></View>}
      {completed.length ? <View style={styles.completedBlock}><Pressable onPress={() => setCompletedOpen((value) => !value)} style={[styles.card, styles.completedToggle]}><View><Text style={styles.completedTitle}>Erledigt</Text><Text style={styles.shoppingMeta}>{completed.length} Produkte</Text></View><MaterialCommunityIcons name={completedOpen ? 'chevron-up' : 'chevron-down'} size={24} color={colors.textSecondary} /></Pressable>{completedOpen ? <View style={[styles.card, styles.listCard]}>{completed.map((item) => row(item))}</View> : null}</View> : null}
    </ScrollView>

    <Modal transparent visible={formOpen} animationType="fade" onRequestClose={() => setFormOpen(false)}><View style={styles.overlay}><View style={styles.dialog}>
      <Text style={styles.dialogEyebrow}>{editing ? 'PRODUKT BEARBEITEN' : 'NEUES PRODUKT'}</Text><Text style={styles.dialogTitle}>{editing ? 'Produkt ändern' : 'Zur Einkaufsliste hinzufügen'}</Text>
      <TextInput autoFocus value={name} onChangeText={setName} placeholder="z. B. Milch" placeholderTextColor={colors.textTertiary} style={styles.input} />
      <View style={styles.formRow}><TextInput value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="Menge" placeholderTextColor={colors.textTertiary} style={[styles.input, styles.flex1]} /><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.unitRow}>{UNITS.map((entry) => <Pressable key={entry} onPress={() => setUnit(entry)} style={[styles.unitChip, unit === entry && styles.unitChipActive]}><Text style={[styles.unitText, unit === entry && styles.unitTextActive]}>{entry}</Text></Pressable>)}</ScrollView></View>
      <View style={styles.dialogActions}><WebButton label="Abbrechen" variant="secondary" onPress={() => setFormOpen(false)} /><WebButton label={busy ? 'Speichern …' : 'Speichern'} icon="check" onPress={save} disabled={busy || !name.trim()} /></View>
    </View></View></Modal>

    <Modal visible={shoppingMode} animationType="slide" onRequestClose={() => setShoppingMode(false)}><View style={styles.shoppingModeRoot}><View style={styles.shoppingModeHeader}><View><Text style={styles.dialogEyebrow}>IM GESCHÄFT</Text><Text style={styles.dialogTitle}>Einkaufsmodus</Text></View><IconAction icon="close" onPress={() => setShoppingMode(false)} label="Einkaufsmodus schließen" /></View><ScrollView contentContainerStyle={styles.shoppingModeContent}>
      <View style={[styles.card, styles.shoppingModeSummary]}><View style={styles.shoppingModeSummaryIcon}><MaterialCommunityIcons name={openItems.length ? "cart-outline" : "check-all"} size={24} color={colors.accent} /></View><View style={styles.flex1}><Text style={styles.shoppingModeSummaryTitle}>{openItems.length ? `${openItems.length} offen` : 'Einkauf erledigt'}</Text><Text style={styles.shoppingMeta}>{completed.length} erledigt · {items.length} Produkte gesamt</Text><View style={styles.shoppingModeProgressTrack}><View style={[styles.shoppingModeProgressFill, { width: `${items.length ? Math.round((completed.length / items.length) * 100) : 0}%` as `${number}%` }]} /></View></View></View>
      {openItems.length ? groups.map((group) => <View key={group.label} style={styles.shoppingGroup}><View style={styles.groupHeader}><Text style={styles.groupTitle}>{group.label}</Text><Text style={styles.groupCount}>{group.items.length}</Text></View><View style={[styles.card, styles.listCard]}>{group.items.map((item) => row(item, true))}</View></View>) : <View style={[styles.card, styles.emptyCard]}><MaterialCommunityIcons name="check-all" size={34} color={colors.accent} /><Text style={styles.emptyTitle}>Einkauf erledigt</Text><WebButton label="Schließen" onPress={() => setShoppingMode(false)} /></View>}
    </ScrollView></View></Modal>
  </>;
}

function SettingsModal({ visible, household, preferences, onClose, onPreferences, onReload }: { visible: boolean; household: Household; preferences: AppPreferences; onClose: () => void; onPreferences: (next: AppPreferences) => void; onReload: () => Promise<void> }) {
  const [joinCode, setJoinCode] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);
  const update = (patch: Partial<AppPreferences>) => onPreferences({ ...preferences, ...patch });

  const makeInvite = async () => {
    setBusy(true);
    try { setInviteCode(await createHouseholdJoinCode(household.id)); }
    catch (e: any) { Alert.alert('Einladung', e?.message || 'Code konnte nicht erstellt werden.'); }
    finally { setBusy(false); }
  };

  const join = async () => {
    if (!joinCode.trim()) return;
    setBusy(true);
    try { await joinHouseholdByCode(joinCode.trim()); clearHouseholdCache(); await onReload(); setJoinCode(''); }
    catch (e: any) { Alert.alert('Beitritt fehlgeschlagen', e?.message || 'Bitte prüfe den Code.'); }
    finally { setBusy(false); }
  };

  const remove = async (userId: string) => {
    setBusy(true);
    try { await removeHouseholdMember(household.id, userId); await onReload(); }
    catch (e: any) { Alert.alert('Mitglied', e?.message || 'Mitglied konnte nicht entfernt werden.'); }
    finally { setBusy(false); }
  };

  const permission = async (userId: string, allowed: boolean) => {
    setBusy(true);
    try { await setHouseholdInvitePermission(household.id, userId, allowed); await onReload(); }
    catch (e: any) { Alert.alert('Berechtigung', e?.message || 'Berechtigung konnte nicht geändert werden.'); }
    finally { setBusy(false); }
  };

  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}><View style={styles.overlay}><View style={styles.settingsDialog}>
    <View style={styles.settingsHeader}><View><Text style={styles.dialogEyebrow}>MEALFLOW WEB</Text><Text style={styles.dialogTitle}>Einstellungen</Text></View><IconAction icon="close" onPress={onClose} label="Einstellungen schließen" /></View>
    <ScrollView contentContainerStyle={styles.settingsContent}>
      <Text style={styles.settingsSection}>Darstellung</Text>
      <View style={[styles.card, styles.settingsCard]}><Text style={styles.settingLabel}>Erscheinungsbild</Text><View style={styles.segmentRow}>{(['system', 'light', 'dark'] as ThemeMode[]).map((mode) => <Pressable key={mode} onPress={() => update({ themeMode: mode })} style={[styles.segment, preferences.themeMode === mode && styles.segmentActive]}><Text style={[styles.segmentText, preferences.themeMode === mode && styles.segmentTextActive]}>{mode === 'system' ? 'System' : mode === 'light' ? 'Hell' : 'Dunkel'}</Text></Pressable>)}</View><View style={styles.settingRow}><View style={styles.flex1}><Text style={styles.settingLabel}>Cozy Mode</Text><Text style={styles.settingHint}>Warme, wohnliche Farben.</Text></View><Switch value={preferences.cozyMode} onValueChange={(value) => update({ cozyMode: value })} /></View><View style={styles.divider} /><View style={styles.settingRow}><View style={styles.flex1}><Text style={styles.settingLabel}>Neutral Dark Mode</Text><Text style={styles.settingHint}>Im dunklen Modus weiße und graue Akzente statt Grün.</Text></View><Switch value={preferences.neutralDarkMode} onValueChange={(value) => update({ neutralDarkMode: value })} /></View></View>
      <Text style={styles.settingsSection}>Haushalt</Text>
      <View style={[styles.card, styles.settingsCard]}><Text style={styles.settingLabel}>{household.name}</Text><Text style={styles.settingHint}>{household.members.length} Mitglieder · Rolle: {household.role}</Text>{household.members.map((member) => <View key={member.userId} style={styles.memberRow}><View style={styles.avatar}><Text style={styles.avatarText}>{member.displayName.slice(0, 1).toUpperCase()}</Text></View><View style={styles.flex1}><Text style={styles.memberName}>{member.displayName}</Text><Text style={styles.settingHint}>{member.role === 'owner' ? 'Ersteller' : member.role === 'admin' ? 'Admin' : 'Mitglied'}{member.canInvite ? ' · darf einladen' : ''}</Text></View>{household.role === 'owner' && member.role !== 'owner' ? <><Switch disabled={busy} value={member.canInvite} onValueChange={(value) => permission(member.userId, value)} /><IconAction icon="account-remove-outline" danger label={`${member.displayName} entfernen`} onPress={() => remove(member.userId)} /></> : null}</View>)}</View>
      {household.canInvite ? <View style={[styles.card, styles.settingsCard]}><Text style={styles.settingLabel}>Einladungscode</Text><Text style={styles.settingHint}>Erzeuge einen 14 Tage gültigen Einmal-Code.</Text>{inviteCode ? <Text selectable style={styles.inviteCode}>{inviteCode}</Text> : null}<WebButton label={busy ? 'Bitte warten …' : 'Neuen Code erstellen'} icon="account-plus-outline" variant="secondary" onPress={makeInvite} disabled={busy} /></View> : null}
      <View style={[styles.card, styles.settingsCard]}><Text style={styles.settingLabel}>Haushalt beitreten</Text><View style={styles.formRow}><TextInput value={joinCode} onChangeText={setJoinCode} autoCapitalize="characters" placeholder="Einladungscode" placeholderTextColor={colors.textTertiary} style={[styles.input, styles.flex1]} /><WebButton label="Beitreten" onPress={join} disabled={busy || !joinCode.trim()} /></View></View>
      <View style={[styles.card, styles.settingsCard]}><Text style={styles.settingLabel}>App-Version</Text><Text style={styles.settingHint}>MealFlow {APP_VERSION} · Web-Oberfläche nutzt dieselben Daten wie iOS und Android.</Text></View>
      <WebButton label="Abmelden" icon="logout" variant="danger" onPress={() => supabase.auth.signOut()} />
    </ScrollView>
  </View></View></Modal>;
}

function Sidebar({ tab, onTab, household, onSettings }: { tab: Tab; onTab: (tab: Tab) => void; household: Household; onSettings: () => void }) {
  return <View style={styles.sidebar}>
    <View style={styles.sidebarBrand}><WebBrandMark size={42} /><View><Text style={styles.sidebarBrandName}>MealFlow</Text><Text style={styles.sidebarBrandMeta}>Web</Text></View></View>
    <View style={styles.navList}>{NAV.map((item) => <Pressable key={item.key} onPress={() => onTab(item.key)} style={[styles.navItem, tab === item.key && styles.navItemActive]}><MaterialCommunityIcons name={item.icon} size={21} color={tab === item.key ? colors.accent : colors.textSecondary} /><Text style={[styles.navText, tab === item.key && styles.navTextActive]}>{item.label}</Text></Pressable>)}</View>
    <View style={styles.sidebarBottom}><Pressable onPress={onSettings} style={styles.householdButton}><View style={styles.avatar}><Text style={styles.avatarText}>{household.name.slice(0, 1).toUpperCase()}</Text></View><View style={styles.flex1}><Text numberOfLines={1} style={styles.householdName}>{household.name}</Text><Text style={styles.sidebarBrandMeta}>{household.myDisplayName}</Text></View><MaterialCommunityIcons name="cog-outline" size={20} color={colors.textSecondary} /></Pressable></View>
  </View>;
}

function MobileNav({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  return <View style={styles.mobileNav}>{NAV.map((item) => <Pressable key={item.key} onPress={() => onTab(item.key)} style={styles.mobileNavItem}><MaterialCommunityIcons name={item.icon} size={22} color={tab === item.key ? colors.accent : colors.textTertiary} /><Text style={[styles.mobileNavText, tab === item.key && styles.mobileNavTextActive]}>{item.key === 'woche' ? 'Plan' : item.label}</Text></Pressable>)}</View>;
}

function MainWebApp() {
  const { width } = useWindowDimensions();
  const desktop = width >= 980;
  const [tab, setTab] = useState<Tab>('heute');
  const [household, setHousehold] = useState<Household | null>(null);
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const shoppingRevision = useRef(0);
  const planRevision = useRef(0);
  const updateShoppingItems: React.Dispatch<React.SetStateAction<ShoppingItem[]>> = (update) => {
    shoppingRevision.current += 1;
    setItems(update);
  };
  const [meals, setMeals] = useState<Record<string, string>>({});
  const [saskiaMeals, setSaskiaMeals] = useState<Record<string, string>>({});
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [, setThemeRevision] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const shoppingStartVersion = shoppingRevision.current;
      const nextHousehold = await loadHousehold();
      setHousehold(nextHousehold);
      setLoading(false);
      setError('');
      const planStartVersion = planRevision.current;
      const [shoppingResult, planResult] = await Promise.allSettled([loadShopping(), loadMealPlan()]);
      if (shoppingResult.status === 'fulfilled' && shoppingStartVersion === shoppingRevision.current) {
        shoppingRevision.current += 1;
        setItems(shoppingResult.value);
      }
      if (planResult.status === 'fulfilled' && planStartVersion === planRevision.current) {
        const plan = planResult.value;
        setMeals(Object.fromEntries(plan.map((entry) => [entry.plannedDate, entry.meal ?? ''])));
        setSaskiaMeals(Object.fromEntries(plan.map((entry) => [entry.plannedDate, entry.mealSaskia ?? ''])));
      }
    } catch (e: any) {
      setError(e?.message || 'MealFlow konnte nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPreferences().then((loaded) => {
      setPreferences(loaded);
      setTab(loaded.startTab);
      applyTheme(loaded);
      setThemeRevision((value) => value + 1);
    }).catch(() => undefined);
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!household?.id) return;
    const filter = `household_id=eq.${household.id}`;
    let disposed = false;

    const applyShoppingRealtime = (payload: any) => {
      // Patch the UI on arrival instead of fetching the entire list.
      shoppingRevision.current += 1;
      if (payload?.eventType === 'DELETE') {
        const deletedId = payload?.old?.id ? String(payload.old.id) : '';
        if (deletedId) setItems((current) => current.filter((item) => item.id !== deletedId));
      } else {
        const next = webShoppingItemFromRealtimeRow(payload?.new, household);
        if (next) setItems((current) => mergeWebRealtimeShoppingItem(current, next));
      }
    };

    const catchUpShopping = () => {
      const request = ++shoppingRevision.current;
      loadShopping().then((next) => {
        if (!disposed && request === shoppingRevision.current) setItems(next);
      }).catch(() => undefined);
    };

    const channel = supabase.channel(`mealflow-web-${household.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items', filter }, applyShoppingRealtime)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_plan_entries', filter }, (payload: any) => {
         ++planRevision.current;
         const row = payload.eventType === 'DELETE' ? payload.old : payload.new;
         const date = typeof row?.planned_date === 'string' ? row.planned_date : '';
         if (!date) return;
         setMeals((current) => ({ ...current, [date]: payload.eventType === 'DELETE' ? '' : String(row.meal ?? '') }));
         setSaskiaMeals((current) => ({ ...current, [date]: payload.eventType === 'DELETE' ? '' : String(row.meal_saskia ?? '') }));
       })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'household_members', filter }, () => loadHousehold().then(setHousehold).catch(() => undefined))
      .subscribe((status) => {
        // Catch events missed during disconnects without delaying live events.
        if (status === 'SUBSCRIBED') {
           catchUpShopping();
           const request = ++planRevision.current;
           loadMealPlan().then((plan) => {
             if (disposed || request !== planRevision.current) return;
             setMeals(Object.fromEntries(plan.map((entry) => [entry.plannedDate, entry.meal ?? ''])));
             setSaskiaMeals(Object.fromEntries(plan.map((entry) => [entry.plannedDate, entry.mealSaskia ?? ''])));
           }).catch(() => undefined);
         }
      });
    return () => {
      disposed = true;
      shoppingRevision.current += 1;
      planRevision.current += 1;
      supabase.removeChannel(channel);
    };
  }, [household?.id]);

  useEffect(() => {
    if (preferences.themeMode !== 'system') return;
    const sub = Appearance.addChangeListener(() => { applyTheme(preferences); setThemeRevision((value) => value + 1); });
    return () => sub.remove();
  }, [preferences]);

  const updatePreferences = (next: AppPreferences) => {
    setPreferences(next);
    applyTheme(next);
    setThemeRevision((value) => value + 1);
    savePreferences(next).catch(() => undefined);
  };

  const navigate = (next: Tab) => {
    setTab(next);
    const prefs = { ...preferences, startTab: next };
    setPreferences(prefs);
    savePreferences(prefs).catch(() => undefined);
  };

  if (!household) return <View style={styles.appRoot}>
    <View style={styles.mainArea}>
      <ScrollView contentContainerStyle={styles.pageContent}>
        <Text style={styles.eyebrow}>MEALFLOW</Text>
        <Text style={styles.pageTitle}>Willkommen bei MealFlow</Text>
        <View style={[styles.card, { padding: 22, gap: 12 }]}>
          <MaterialCommunityIcons name={error ? 'cloud-alert-outline' : 'home-heart'} size={30} color={colors.accent} />
          <Text style={styles.cardEyebrow}>{error ? 'VERBINDUNGSPROBLEM' : 'HAUSHALT VERBINDEN'}</Text>
          <Text style={styles.pageSubtitle}>{error || 'Dein Dashboard ist bereit. Wir verbinden gerade deinen Haushalt und synchronisieren deine Daten.'}</Text>
          {error ? <WebButton label="Erneut versuchen" icon="refresh" onPress={() => { setLoading(true); void refresh(); }} /> : null}
        </View>
      </ScrollView>
    </View>
  </View>;

  const content = tab === 'heute'
    ? <TodayOverviewScreen household={household} items={items} meals={meals} saskiaMeals={saskiaMeals} onNavigate={navigate} onSettings={() => setSettingsOpen(true)} />
    : tab === 'woche'
      ? <MealPlanOverviewScreen household={household} meals={meals} saskiaMeals={saskiaMeals} onSettings={() => setSettingsOpen(true)} onSave={async (date, slot, title) => {
        // Only the edited day changes. Realtime keeps other devices in sync.
        ++planRevision.current;
        if (slot === 'saskia') {
          await saveSaskiaMeal(date, title || null);
          setSaskiaMeals((current) => ({ ...current, [date]: title }));
        } else {
          await saveMeal(date, title || null);
          setMeals((current) => ({ ...current, [date]: title }));
        }
      }} />
      : tab === 'einkauf'
        ? <ShoppingScreen household={household} items={items} setItems={updateShoppingItems} onSettings={() => setSettingsOpen(true)} />
        : <ProteinRecipesScreen onSettings={() => setSettingsOpen(true)} onGoShopping={() => navigate('einkauf')} onPlanChanged={(date, title) => { ++planRevision.current; setMeals((current) => ({ ...current, [date]: title })); }} />;

  return <View style={styles.appRoot}>
    {desktop ? <Sidebar tab={tab} onTab={navigate} household={household} onSettings={() => setSettingsOpen(true)} /> : null}
    <View style={styles.mainArea}>{content}</View>
    {!desktop ? <MobileNav tab={tab} onTab={navigate} /> : null}
    <SettingsModal visible={settingsOpen} household={household} preferences={preferences} onClose={() => setSettingsOpen(false)} onPreferences={updatePreferences} onReload={refresh} />
  </View>;
}

function Root() {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  useEffect(() => {
    if (!isCloudConfigured) { setChecking(false); return; }
    supabase.auth.getSession().then(({ data }) => { setAuthenticated(Boolean(data.session)); setChecking(false); }).catch(() => setChecking(false));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { if (!session) clearHouseholdCache(); setAuthenticated(Boolean(session)); setChecking(false); });
    return () => data.subscription.unsubscribe();
  }, []);
  if (checking) return <View style={{ flex: 1, backgroundColor: colors.background }} />;
  if (!isCloudConfigured) return <View style={styles.loadingRoot}><Text style={styles.loadingTitle}>Cloud-Verbindung fehlt</Text></View>;
  return authenticated ? <MainWebApp /> : <AuthScreen />;
}

export default function App() {
  return <SafeAreaProvider><Root /></SafeAreaProvider>;
}

function createStyles() {
  return StyleSheet.create({
    flex1: { flex: 1 },
    appRoot: { flex: 1, minHeight: '100vh' as any, flexDirection: 'row', backgroundColor: colors.background },
    mainArea: { flex: 1, minWidth: 0, backgroundColor: colors.background },
    sidebar: { width: 260, backgroundColor: colors.surface, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: colors.border, padding: 20 },
    sidebarBrand: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingBottom: 26 },
    brandMarkSmall: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    sidebarBrandName: { ...typography.title, color: colors.text },
    sidebarBrandMeta: { ...typography.caption, color: colors.textTertiary },
    navList: { gap: 6 },
    navItem: { minHeight: 48, borderRadius: radius.md, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 11 },
    navItemActive: { backgroundColor: colors.accentSoft },
    navText: { ...typography.bodyStrong, color: colors.textSecondary },
    navTextActive: { color: colors.accent },
    sidebarBottom: { marginTop: 'auto' as any, paddingTop: 20 },
    householdButton: { minHeight: 62, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: 10, flexDirection: 'row', alignItems: 'center', gap: 10 },
    householdName: { ...typography.bodyStrong, color: colors.text },
    mobileNav: { minHeight: 68, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, flexDirection: 'row' },
    mobileNavItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
    mobileNavText: { fontSize: 11, color: colors.textTertiary, fontWeight: '600' },
    mobileNavTextActive: { color: colors.accent },
    pageContent: { width: '100%', maxWidth: 1320, alignSelf: 'center', paddingHorizontal: 28, paddingTop: 30, paddingBottom: 48, gap: 22 },
    pageHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 18 },
    eyebrow: { ...typography.label, color: colors.accent, textTransform: 'uppercase' },
    pageTitle: { fontSize: 34, lineHeight: 40, fontWeight: '800', letterSpacing: -0.7, color: colors.text, marginTop: 4 },
    pageSubtitle: { ...typography.body, color: colors.textSecondary, maxWidth: 720, marginTop: 4 },
    webBrandShell: { backgroundColor: '#173F2C', alignItems: 'center', justifyContent: 'center' },
    webBrandAccent: { position: 'absolute', backgroundColor: '#BFE3A5' },
    webOverviewHero: { backgroundColor: colors.accent, borderRadius: radius.xl, padding: 24, gap: 16 }, webOverviewHeading: { flexDirection: 'row', alignItems: 'center', gap: 15 }, webOverviewEyebrow: { ...typography.label, color: colors.onAccent, opacity: 0.8 }, webOverviewTitle: { ...typography.h2, color: colors.onAccent, marginTop: 5 }, webOverviewTrack: { height: 7, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 4, overflow: 'hidden' }, webOverviewFill: { height: 7, backgroundColor: colors.onAccent, borderRadius: 4 },
    webOverviewDays: { flexDirection: 'row', gap: 7 }, webOverviewDay: { flex: 1, minHeight: 78, backgroundColor: 'rgba(255,255,255,0.13)', borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 5 }, webOverviewDayCurrent: { backgroundColor: colors.onAccent }, webOverviewDayText: { ...typography.caption, color: colors.onAccent }, webOverviewDayNumber: { ...typography.title, color: colors.onAccent }, webOverviewDayTextCurrent: { color: colors.accent }, webOverviewDots: { flexDirection: 'row', gap: 4 }, webOverviewDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)' }, webOverviewDotDone: { backgroundColor: colors.onAccent },
    webSectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }, webTodayMeals: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' }, webTodayMealCard: { flexGrow: 1, flexBasis: 290, padding: 24, minHeight: 175, gap: 12 }, webTodayMealSaskia: { backgroundColor: colors.accentSoft }, webTodayMealTop: { flexDirection: 'row', alignItems: 'center', gap: 10 }, webTodayMealTitle: { ...typography.h2, color: colors.text }, webTodayBottom: { flexDirection: 'row', gap: 16, flexWrap: 'wrap' }, webTodayPanel: { flexGrow: 1, flexBasis: 300, padding: 23, gap: 12 }, webTodaySubTitle: { ...typography.title, color: colors.text }, webTodayLink: { ...typography.caption, color: colors.accent, fontWeight: '800' }, webShoppingPreview: { flexDirection: 'row', gap: 10, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingVertical: 8 }, webShoppingName: { flex: 1, ...typography.body, color: colors.text }, webTodayBottomActions: { paddingTop: 10 },
    heroGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
    card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    heroCard: { flexGrow: 1, flexBasis: 420, minWidth: 280, padding: 22, gap: 10 },
    cardIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
    cardEyebrow: { ...typography.label, color: colors.accent },
    heroMeal: { fontSize: 25, lineHeight: 31, fontWeight: '800', color: colors.text },
    cardCopy: { ...typography.body, color: colors.textSecondary },
    todayWebHero: { padding: 22, gap: 18 },
    todayWebHeroTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    todayWebHeroTitle: { ...typography.h2, color: colors.text, marginTop: 3 },
    todayWebMealGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    todayWebMealBlock: { flexGrow: 1, flexBasis: 390, minWidth: 270, minHeight: 150, borderRadius: radius.lg, backgroundColor: colors.surfaceMuted, padding: 18, gap: 8 },
    todayWebMealBlockAccent: { backgroundColor: colors.accentSoft },
    todayWebActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    metricCard: { flexGrow: 1, flexBasis: 230, minWidth: 190, padding: 18, gap: 8 },
    metricValue: { fontSize: 27, lineHeight: 31, fontWeight: '800', color: colors.text },
    metricLabel: { ...typography.caption, color: colors.textSecondary },
    tomorrowWebCard: { padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
    tomorrowWebDate: { width: 58, height: 64, borderRadius: 18, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
    tomorrowWebDay: { fontSize: 24, lineHeight: 27, fontWeight: '800', color: colors.text },
    tomorrowWebMonth: { ...typography.caption, color: colors.accent, fontWeight: '800' },
    tomorrowWebMeal: { ...typography.title, color: colors.text, marginTop: 3 },
    weekTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    weekTab: { minWidth: 150, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 13 },
    weekTabActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
    weekTabTitle: { ...typography.bodyStrong, color: colors.textSecondary },
    weekTabTitleActive: { color: colors.accent },
    weekTabRange: { ...typography.caption, color: colors.textTertiary, marginTop: 3 },
    planGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
    dayCard: { flexGrow: 1, flexBasis: 320, minWidth: 280, padding: 16, gap: 10 },
    dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    dayWeekday: { ...typography.title, color: colors.text },
    dayDate: { ...typography.caption, color: colors.textSecondary },
    dayCount: { ...typography.caption, color: colors.accent, backgroundColor: colors.accentSoft, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 5, overflow: 'hidden' },
    mealSlot: { minHeight: 72, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, padding: 12, gap: 4 },
    saskiaSlot: { backgroundColor: colors.accentSoft },
    slotLabel: { ...typography.label, color: colors.textTertiary },
    slotLabelAccent: { ...typography.label, color: colors.accent },
    slotValue: { ...typography.bodyStrong, color: colors.text },
    slotEmpty: { color: colors.textTertiary },
    shoppingTopActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10 },
    shoppingGroups: { gap: 18 },
    shoppingGroup: { gap: 7 },
    groupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4 },
    groupTitle: { ...typography.bodyStrong, color: colors.textSecondary },
    groupCount: { ...typography.caption, color: colors.textTertiary },
    listCard: { overflow: 'hidden' },
    shoppingRow: { minHeight: 64, paddingHorizontal: 14, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    check: { width: 28, height: 28, borderRadius: 9, borderWidth: 1.5, borderColor: colors.textTertiary, alignItems: 'center', justifyContent: 'center' },
    checkDone: { backgroundColor: colors.accent, borderColor: colors.accent },
    shoppingName: { ...typography.bodyStrong, color: colors.text },
    shoppingMeta: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },
    doneText: { textDecorationLine: 'line-through', color: colors.textTertiary },
    rowActions: { flexDirection: 'row', gap: 5 },
    iconAction: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    iconActionDanger: { backgroundColor: colors.dangerSoft },
    completedBlock: { gap: 8 },
    completedToggle: { minHeight: 66, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    completedTitle: { ...typography.bodyStrong, color: colors.text },
    emptyCard: { padding: 34, alignItems: 'center', gap: 8 },
    emptyTitle: { ...typography.title, color: colors.text },
    button: { minHeight: 46, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
    buttonPrimary: { backgroundColor: colors.accent },
    buttonDanger: { backgroundColor: colors.dangerSoft },
    buttonText: { ...typography.bodyStrong, color: colors.text },
    buttonTextPrimary: { color: colors.onAccent },
    buttonTextDanger: { color: colors.danger },
    disabled: { opacity: 0.45 },
    pressed: { opacity: 0.72 },
    overlay: { flex: 1, backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center', padding: 20 },
    dialog: { width: '100%', maxWidth: 620, borderRadius: radius.xl, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, padding: 22, gap: 14 },
    dialogEyebrow: { ...typography.label, color: colors.accent },
    dialogTitle: { ...typography.h2, color: colors.text },
    input: { minHeight: 50, borderRadius: radius.md, backgroundColor: colors.background, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 14, ...typography.body, color: colors.text, outlineStyle: 'none' as any },
    dialogActions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 9 },
    formRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    unitRow: { gap: 6 },
    unitChip: { minHeight: 40, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    unitChipActive: { backgroundColor: colors.accent },
    unitText: { ...typography.caption, color: colors.textSecondary },
    unitTextActive: { color: colors.onAccent },
    shoppingModeRoot: { flex: 1, backgroundColor: colors.background },
    shoppingModeHeader: { minHeight: 76, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingHorizontal: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    shoppingModeContent: { width: '100%', maxWidth: 1000, alignSelf: 'center', padding: 26, gap: 20 },
    shoppingModeSummary: { padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 },
    shoppingModeSummaryIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
    shoppingModeSummaryTitle: { ...typography.title, color: colors.text },
    shoppingModeProgressTrack: { height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.surfaceMuted, marginTop: 10 },
    shoppingModeProgressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.accent },
    settingsDialog: { width: '100%', maxWidth: 760, maxHeight: '92%', borderRadius: radius.xl, backgroundColor: colors.background, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
    settingsHeader: { minHeight: 74, backgroundColor: colors.surface, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    settingsContent: { padding: 20, gap: 14 },
    settingsSection: { ...typography.label, color: colors.textTertiary, marginTop: 4 },
    settingsCard: { padding: 16, gap: 12 },
    settingLabel: { ...typography.bodyStrong, color: colors.text },
    settingHint: { ...typography.caption, color: colors.textSecondary },
    settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
    segmentRow: { flexDirection: 'row', gap: 7 },
    segment: { flex: 1, minHeight: 42, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
    segmentActive: { backgroundColor: colors.accentSoft },
    segmentText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
    segmentTextActive: { color: colors.accent },
    memberRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    avatar: { width: 38, height: 38, borderRadius: 13, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
    avatarText: { ...typography.bodyStrong, color: colors.accent },
    memberName: { ...typography.bodyStrong, color: colors.text },
    inviteCode: { fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: 3, color: colors.text, paddingVertical: 6 },
    authRoot: { flex: 1, minHeight: '100vh' as any, backgroundColor: colors.background, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch' },
    authLeft: { flexGrow: 1, flexBasis: 520, minWidth: 300, padding: 56, justifyContent: 'center', backgroundColor: colors.surfaceMuted },
    brandMark: { width: 58, height: 58, borderRadius: 19, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    authBrand: { ...typography.title, color: colors.accent, marginTop: 14 },
    authHero: { fontSize: 42, lineHeight: 48, fontWeight: '800', letterSpacing: -1, color: colors.text, maxWidth: 570, marginTop: 18 },
    authCopy: { ...typography.body, color: colors.textSecondary, maxWidth: 560, marginTop: 14 },
    authFeatureList: { marginTop: 28, gap: 10 },
    authFeature: { flexDirection: 'row', alignItems: 'center', gap: 9 },
    authFeatureText: { ...typography.bodyStrong, color: colors.text },
    authPanel: { flexGrow: 1, flexBasis: 460, maxWidth: 580, minWidth: 300, padding: 56, justifyContent: 'center', gap: 14 },
    authPanelEyebrow: { ...typography.label, color: colors.accent },
    authPanelTitle: { ...typography.h1, color: colors.text, marginBottom: 8 },
    authSubmit: { minHeight: 52, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
    authSubmitText: { ...typography.bodyStrong, color: colors.onAccent },
    authSwitch: { ...typography.caption, color: colors.accent, textAlign: 'center', paddingTop: 4 },
    errorText: { ...typography.caption, color: colors.danger },
    loadingRoot: { flex: 1, minHeight: '100vh' as any, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 30, gap: 12 },
    loadingTitle: { ...typography.h2, color: colors.text, textAlign: 'center', marginTop: 8 },
    loadingCopy: { ...typography.body, color: colors.textSecondary, textAlign: 'center', maxWidth: 520 },
    webLoadingTrack: { width: 260, height: 7, borderRadius: 4, backgroundColor: colors.surfaceMuted, overflow: 'hidden', marginTop: 8 },
    webLoadingFill: { width: '72%', height: '100%', borderRadius: 4, backgroundColor: colors.accent },
    webLoadingMeta: { ...typography.caption, color: colors.textTertiary },
  });
}

let styles = createStyles();
