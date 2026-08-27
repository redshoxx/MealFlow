import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  acceptHouseholdInvitation,
  addOwnRecipe,
  addShoppingItem,
  clearHouseholdCache,
  createHouseholdInvitation,
  deleteOwnRecipe,
  deleteShoppingItem,
  joinHouseholdByCode,
  loadHousehold,
  loadMealHistory,
  loadMealPlan,
  loadOwnRecipes,
  loadPendingHouseholdInvitations,
  loadShopping,
  recordCookedMeal,
  renameHousehold,
  saveMeal,
  setShoppingDone,
  updateMyDisplayName,
  type Household,
  type HouseholdInvitation,
  type MealHistoryEntry,
  type OwnRecipe,
  type ShoppingItem,
} from './src/lib/cloud';
import { getSeasonalQuickSearch, searchRecipes, type Recipe, type RecipeFilters } from './src/lib/recipes';
import { isCloudConfigured, supabase } from './src/lib/supabase';
import { ActionButton, EmptyState, IconButton, ScreenHeader, SectionTitle, SurfaceCard } from './src/ui/components';
import { colors, radius, shadow, spacing, typography } from './src/ui/theme';

const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const UNITS = ['Stk.', 'Pkg.', 'g', 'kg', 'ml', 'l', 'EL', 'TL', 'Bund', 'Dose'];
const AMOUNTS = Array.from({ length: 80 }, (_, index) => (index + 1) / 2);

type Tab = 'heute' | 'woche' | 'einkauf' | 'rezepte';
type RecipeSelection = { kind: 'recipe'; recipe: Recipe } | { kind: 'own'; recipe: OwnRecipe };
type SearchFilters = { maxMinutes: number | null; vegetarianOnly: boolean; ingredient: string; excludeThisWeek: boolean };

const DEFAULT_FILTERS: SearchFilters = { maxMinutes: null, vegetarianOnly: false, ingredient: '', excludeThisWeek: true };

function germanError(message?: string) {
  if (!message) return 'Etwas ist schiefgelaufen. Bitte versuche es erneut.';
  const text = message.toLowerCase();
  if (text.includes('invalid login credentials')) return 'E-Mail-Adresse oder Passwort ist nicht korrekt.';
  if (text.includes('user already registered')) return 'Für diese E-Mail-Adresse gibt es bereits ein Konto.';
  if (text.includes('password should be')) return 'Das Passwort erfüllt die Mindestanforderungen nicht.';
  if (text.includes('email not confirmed')) return 'Bitte bestätige zuerst deine E-Mail-Adresse.';
  if (text.includes('network')) return 'Keine Verbindung. Bitte prüfe deine Internetverbindung.';
  if (text.includes('invalid') && text.includes('code')) return 'Der Einladungscode ist ungültig oder abgelaufen.';
  return message;
}

function formatAmount(value: number) {
  return String(value).replace('.5', ',5');
}

function getCurrentDay() {
  const raw = new Date().toLocaleDateString('de-AT', { weekday: 'long' });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeTitle(value: string) {
  return value.toLocaleLowerCase('de-AT').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').trim();
}

function lastCookedLabel(entry?: MealHistoryEntry) {
  if (!entry) return null;
  const date = new Date(`${entry.cookedOn}T12:00:00`);
  const diff = Math.max(0, Math.round((Date.now() - date.getTime()) / 86400000));
  if (diff === 0) return 'Heute gekocht';
  if (diff === 1) return 'Gestern gekocht';
  if (diff < 14) return `Vor ${diff} Tagen gekocht`;
  return `Zuletzt am ${date.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' })}`;
}

function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!email.trim() || password.length < 6) {
      Alert.alert('Eingaben prüfen', 'Bitte gib eine gültige E-Mail-Adresse und ein Passwort mit mindestens 6 Zeichen ein.');
      return;
    }
    setBusy(true);
    try {
      const result = mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (mode === 'signup' && !result.data.session) {
        Alert.alert('Fast geschafft', 'Bitte bestätige deine E-Mail-Adresse und melde dich danach an.');
      }
    } catch (error: any) {
      Alert.alert(mode === 'signin' ? 'Anmeldung nicht möglich' : 'Konto konnte nicht erstellt werden', germanError(error?.message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.authRoot}>
      <StatusBar style="dark" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.authContent}>
        <View style={styles.brandMark}><MaterialCommunityIcons name="silverware-fork-knife" size={28} color="#FFFFFF" /></View>
        <Text style={styles.authBrand}>MealFlow</Text>
        <Text style={styles.authHero}>Gemeinsam planen. Gezielt einkaufen. Besser kochen.</Text>
        <Text style={styles.authSubtitle}>Wochenplan, Einkaufsliste und Rezepte für deinen Haushalt – synchron auf iPhone und Android.</Text>
        <SurfaceCard style={styles.authCard}>
          <View style={styles.segmentedControl}>
            <Pressable onPress={() => setMode('signin')} style={[styles.segmentButton, mode === 'signin' && styles.segmentButtonActive]}><Text style={[styles.segmentText, mode === 'signin' && styles.segmentTextActive]}>Anmelden</Text></Pressable>
            <Pressable onPress={() => setMode('signup')} style={[styles.segmentButton, mode === 'signup' && styles.segmentButtonActive]}><Text style={[styles.segmentText, mode === 'signup' && styles.segmentTextActive]}>Registrieren</Text></Pressable>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>E-Mail-Adresse</Text>
            <View style={styles.inputShell}>
              <MaterialCommunityIcons name="email-outline" size={20} color={colors.textTertiary} />
              <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" placeholder="name@beispiel.at" placeholderTextColor={colors.textTertiary} style={styles.textInput} />
            </View>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Passwort</Text>
            <View style={styles.inputShell}>
              <MaterialCommunityIcons name="lock-outline" size={20} color={colors.textTertiary} />
              <TextInput value={password} onChangeText={setPassword} secureTextEntry={!showPassword} autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} placeholder="Mindestens 6 Zeichen" placeholderTextColor={colors.textTertiary} style={styles.textInput} />
              <Pressable onPress={() => setShowPassword((value) => !value)} hitSlop={8}><MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} /></Pressable>
            </View>
          </View>
          <ActionButton label={mode === 'signin' ? 'Anmelden' : 'Konto erstellen'} onPress={submit} loading={busy} />
          <Text style={styles.authHint}>Nach der Registrierung erhältst du automatisch einen privaten Haushalt. Weitere Personen kannst du später per Code oder E-Mail einladen.</Text>
        </SurfaceCard>
      </ScrollView>
    </View>
  );
}

function QuantitySheet({ visible, amount, unit, onClose, onDone }: { visible: boolean; amount: number; unit: string; onClose: () => void; onDone: (amount: number, unit: string) => void }) {
  const [draftAmount, setDraftAmount] = useState(amount);
  const [draftUnit, setDraftUnit] = useState(unit);
  useEffect(() => { if (visible) { setDraftAmount(amount); setDraftUnit(unit); } }, [visible, amount, unit]);
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose} />
      <View style={styles.bottomSheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Pressable onPress={onClose}><Text style={styles.sheetCancel}>Abbrechen</Text></Pressable>
          <Text style={styles.sheetTitle}>Menge & Einheit</Text>
          <Pressable onPress={() => onDone(draftAmount, draftUnit)}><Text style={styles.sheetDone}>Übernehmen</Text></Pressable>
        </View>
        <View style={styles.pickerRow}>
          <Picker selectedValue={draftAmount} onValueChange={(value) => setDraftAmount(Number(value))} style={styles.picker} itemStyle={styles.pickerItem}>{AMOUNTS.map((value) => <Picker.Item key={value} label={formatAmount(value)} value={value} />)}</Picker>
          <Picker selectedValue={draftUnit} onValueChange={(value) => setDraftUnit(String(value))} style={styles.picker} itemStyle={styles.pickerItem}>{UNITS.map((value) => <Picker.Item key={value} label={value} value={value} />)}</Picker>
        </View>
      </View>
    </Modal>
  );
}

function HouseholdSheet({ visible, household, invitations, onClose, onChanged }: { visible: boolean; household: Household; invitations: HouseholdInvitation[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const [joinCode, setJoinCode] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [householdName, setHouseholdName] = useState(household.name);
  const [displayName, setDisplayName] = useState(household.myDisplayName);
  const [busy, setBusy] = useState(false);
  const canManage = household.role === 'owner' || household.role === 'admin';

  useEffect(() => {
    if (visible) {
      setHouseholdName(household.name);
      setDisplayName(household.myDisplayName);
      setJoinCode('');
      setInviteEmail('');
    }
  }, [visible, household.name, household.myDisplayName]);

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try { await work(); } catch (error: any) { Alert.alert('Haushalt', germanError(error?.message)); } finally { setBusy(false); }
  };

  const shareCode = () => Share.share({ message: `Komm in meinen MealFlow-Haushalt „${household.name}“. Einladungscode: ${household.inviteCode}` }).catch(() => undefined);

  const inviteByEmail = () => run(async () => {
    const email = inviteEmail.trim();
    if (!email.includes('@')) throw new Error('Bitte gib eine gültige E-Mail-Adresse ein.');
    const code = await createHouseholdInvitation(household.id, email);
    const subject = encodeURIComponent(`Einladung zu ${household.name} in MealFlow`);
    const body = encodeURIComponent(`Du wurdest zu meinem MealFlow-Haushalt „${household.name}“ eingeladen.\n\nÖffne MealFlow und verwende den Einladungscode: ${code}`);
    const url = `mailto:${encodeURIComponent(email)}?subject=${subject}&body=${body}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
    else await Share.share({ message: `MealFlow-Einladung für ${email}: ${code}` });
    setInviteEmail('');
    Alert.alert('Einladung erstellt', 'Die Einladung ist 14 Tage gültig. Die E-Mail wurde vorbereitet.');
  });

  const join = () => run(async () => {
    if (!joinCode.trim()) throw new Error('Bitte gib einen Einladungscode ein.');
    await joinHouseholdByCode(joinCode);
    await onChanged();
    setJoinCode('');
    Alert.alert('Haushalt gewechselt', 'Du siehst jetzt die gemeinsame Einkaufsliste und den gemeinsamen Wochenplan.');
  });

  const saveNames = () => run(async () => {
    if (canManage && householdName.trim() !== household.name) await renameHousehold(household.id, householdName);
    if (displayName.trim() !== household.myDisplayName) await updateMyDisplayName(displayName);
    await onChanged();
    Alert.alert('Gespeichert', 'Haushalt und Profil wurden aktualisiert.');
  });

  const accept = (invitation: HouseholdInvitation) => run(async () => {
    await acceptHouseholdInvitation(invitation.id);
    await onChanged();
    Alert.alert('Einladung angenommen', `Du bist jetzt Mitglied in „${invitation.householdName}“.`);
  });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <View style={styles.fullModal}>
          <View style={styles.fullModalHeader}><IconButton icon="arrow-left" onPress={onClose} accessibilityLabel="Zurück" /><Text style={styles.fullModalTitle}>Haushalt</Text><View style={styles.headerSpacer} /></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formContent}>
            <SurfaceCard style={styles.householdHero}>
              <View style={styles.householdIcon}><MaterialCommunityIcons name="home-heart" size={28} color={colors.accent} /></View>
              <View style={styles.flex1}><Text style={styles.householdHeroLabel}>AKTIVER HAUSHALT</Text><Text style={styles.householdHeroTitle}>{household.name}</Text><Text style={styles.householdHeroMeta}>{household.members.length} {household.members.length === 1 ? 'Mitglied' : 'Mitglieder'} · gemeinsame Daten in Echtzeit</Text></View>
            </SurfaceCard>

            {invitations.length ? <><SectionTitle title="Offene Einladungen" />{invitations.map((invite) => <SurfaceCard key={invite.id} style={styles.inviteCard}><View style={styles.flex1}><Text style={styles.memberName}>{invite.householdName}</Text><Text style={styles.memberMeta}>Einladung für {invite.email}</Text></View><ActionButton label="Annehmen" onPress={() => accept(invite)} style={styles.smallAction} /></SurfaceCard>)}</> : null}

            <SectionTitle title="Mitglieder" />
            <SurfaceCard style={styles.listCard}>{household.members.map((member) => <View key={member.userId} style={styles.memberRow}><View style={styles.avatar}><Text style={styles.avatarText}>{member.displayName.slice(0, 1).toUpperCase()}</Text></View><View style={styles.flex1}><Text style={styles.memberName}>{member.displayName}{member.displayName === household.myDisplayName ? ' · Du' : ''}</Text><Text style={styles.memberMeta}>{member.role === 'owner' ? 'Besitzer' : member.role === 'admin' ? 'Admin' : 'Mitglied'}</Text></View></View>)}</SurfaceCard>

            <SectionTitle title="Einladen" />
            <SurfaceCard style={styles.inviteCodeCard}>
              <Text style={styles.miniLabel}>HAUSHALTSCODE</Text><Text style={styles.inviteCode}>{household.inviteCode}</Text><Text style={styles.fieldHint}>Mit diesem Code kann eine Person direkt deinem Haushalt beitreten.</Text><ActionButton label="Code teilen" icon="share-variant-outline" variant="secondary" onPress={shareCode} />
            </SurfaceCard>
            {canManage ? <SurfaceCard style={styles.settingsBlock}><Text style={styles.fieldLabel}>Per E-Mail einladen</Text><TextInput value={inviteEmail} onChangeText={setInviteEmail} autoCapitalize="none" keyboardType="email-address" placeholder="name@beispiel.at" placeholderTextColor={colors.textTertiary} style={styles.formInput} /><ActionButton label="E-Mail-Einladung erstellen" icon="email-fast-outline" onPress={inviteByEmail} loading={busy} /></SurfaceCard> : null}

            <SectionTitle title="Beitreten" />
            <SurfaceCard style={styles.settingsBlock}><Text style={styles.fieldLabel}>Einladungscode verwenden</Text><TextInput value={joinCode} onChangeText={(value) => setJoinCode(value.toUpperCase())} autoCapitalize="characters" placeholder="CODE EINGEBEN" placeholderTextColor={colors.textTertiary} style={[styles.formInput, styles.codeInput]} /><ActionButton label="Haushalt beitreten" icon="home-plus-outline" variant="secondary" onPress={join} loading={busy} /></SurfaceCard>

            <SectionTitle title="Profil & Haushalt" />
            <SurfaceCard style={styles.settingsBlock}>
              <View style={styles.inputGroup}><Text style={styles.fieldLabel}>Dein Name im Haushalt</Text><TextInput value={displayName} onChangeText={setDisplayName} placeholder="Vorname" placeholderTextColor={colors.textTertiary} style={styles.formInput} /></View>
              {canManage ? <View style={styles.inputGroup}><Text style={styles.fieldLabel}>Name des Haushalts</Text><TextInput value={householdName} onChangeText={setHouseholdName} placeholder="Unser Haushalt" placeholderTextColor={colors.textTertiary} style={styles.formInput} /></View> : null}
              <ActionButton label="Änderungen speichern" icon="content-save-outline" onPress={saveNames} loading={busy} />
            </SurfaceCard>
          </ScrollView>
        </View>
      </SafeAreaProvider>
    </Modal>
  );
}

function SettingsSheet({ visible, email, household, pendingInvites, onClose, onHousehold }: { visible: boolean; email: string; household: Household; pendingInvites: number; onClose: () => void; onHousehold: () => void }) {
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose} />
      <View style={styles.settingsSheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Konto & Einstellungen</Text><IconButton icon="close" onPress={onClose} accessibilityLabel="Schließen" /></View>
        <Pressable onPress={onHousehold}><SurfaceCard style={styles.settingsCard}><View style={styles.settingsIcon}><MaterialCommunityIcons name="home-heart" size={22} color={colors.accent} /></View><View style={styles.flex1}><Text style={styles.settingsLabel}>Haushalt</Text><Text style={styles.settingsValue}>{household.name}</Text><Text style={styles.settingsMeta}>{household.members.length} Mitglieder · Code {household.inviteCode}{pendingInvites ? ` · ${pendingInvites} offene Einladung` : ''}</Text></View><MaterialCommunityIcons name="chevron-right" size={24} color={colors.textTertiary} /></SurfaceCard></Pressable>
        <SurfaceCard style={styles.settingsCard}><View style={styles.settingsIcon}><MaterialCommunityIcons name="account-outline" size={22} color={colors.accent} /></View><View style={styles.flex1}><Text style={styles.settingsLabel}>Angemeldet als</Text><Text style={styles.settingsValue}>{email || 'MealFlow-Konto'}</Text></View></SurfaceCard>
        <SurfaceCard style={styles.settingsCard}><View style={styles.settingsIcon}><MaterialCommunityIcons name="cloud-check-outline" size={22} color={colors.accent} /></View><View style={styles.flex1}><Text style={styles.settingsLabel}>Synchronisierung</Text><Text style={styles.settingsValue}>Supabase Realtime aktiv</Text><Text style={styles.settingsMeta}>Plan, Einkauf, Rezepte und Kochverlauf werden im aktiven Haushalt synchronisiert.</Text></View></SurfaceCard>
        <SurfaceCard style={styles.settingsCard}><View style={styles.settingsIcon}><MaterialCommunityIcons name="information-outline" size={22} color={colors.accent} /></View><View style={styles.flex1}><Text style={styles.settingsLabel}>App-Version</Text><Text style={styles.settingsValue}>MealFlow 2.1</Text></View></SurfaceCard>
        <ActionButton label="Abmelden" icon="logout" variant="danger" onPress={() => supabase.auth.signOut().catch(() => undefined)} />
      </View>
    </Modal>
  );
}

function HomeScreen({ household, meals, items, history, onNavigate, onSettings, onCooked }: { household: Household; meals: Record<string, string>; items: ShoppingItem[]; history: MealHistoryEntry[]; onNavigate: (tab: Tab) => void; onSettings: () => void; onCooked: (title: string) => Promise<void> }) {
  const currentDay = getCurrentDay();
  const tonight = meals[currentDay] || '';
  const planned = DAYS.filter((day) => Boolean(meals[day])).length;
  const openItems = items.filter((item) => !item.done).length;
  const cookedToday = tonight ? history.some((entry) => entry.cookedOn === todayIso() && normalizeTitle(entry.recipeTitle) === normalizeTitle(tonight)) : false;
  const dateLabel = new Date().toLocaleDateString('de-AT', { weekday: 'long', day: '2-digit', month: 'long' });
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.screenContent}>
      <ScreenHeader eyebrow={`${dateLabel} · ${household.name}`} title="Heute" subtitle={`Gemeinsam mit ${household.members.length} ${household.members.length === 1 ? 'Person' : 'Personen'} planen.`} action={<IconButton icon="account-circle-outline" onPress={onSettings} accessibilityLabel="Konto und Einstellungen" />} />
      <SurfaceCard style={styles.heroCard}>
        <View style={styles.heroIcon}><MaterialCommunityIcons name="silverware-fork-knife" size={25} color={colors.accent} /></View>
        <Text style={styles.heroLabel}>HEUTE ABEND</Text><Text style={styles.heroMeal}>{tonight || 'Noch nichts geplant'}</Text><Text style={styles.heroMeta}>{tonight ? cookedToday ? 'Als gekocht markiert – der Haushalt ist auf dem gleichen Stand.' : 'Dein Abendessen ist im gemeinsamen Wochenplan.' : 'Plane jetzt ein Abendessen für den Haushalt.'}</Text>
        <View style={styles.heroActions}><ActionButton label={tonight ? 'Wochenplan öffnen' : 'Abendessen planen'} icon="calendar-week-outline" onPress={() => onNavigate('woche')} variant="secondary" style={styles.flexButton} />{tonight && !cookedToday ? <ActionButton label="Gekocht" icon="check-circle-outline" onPress={() => onCooked(tonight)} style={styles.flexButton} /> : null}</View>
      </SurfaceCard>
      <View style={styles.metricsRow}><SurfaceCard style={styles.metricCard}><MaterialCommunityIcons name="calendar-check-outline" size={22} color={colors.accent} /><Text style={styles.metricNumber}>{planned}/7</Text><Text style={styles.metricLabel}>Abende geplant</Text></SurfaceCard><SurfaceCard style={styles.metricCard}><MaterialCommunityIcons name="cart-outline" size={22} color={colors.accent} /><Text style={styles.metricNumber}>{openItems}</Text><Text style={styles.metricLabel}>offene Einkäufe</Text></SurfaceCard></View>
      <SectionTitle title="Schnellzugriff" />
      <View style={styles.quickGrid}><Pressable style={styles.quickAction} onPress={() => onNavigate('woche')}><View style={styles.quickIcon}><MaterialCommunityIcons name="calendar-plus" size={22} color={colors.accent} /></View><Text style={styles.quickTitle}>Woche planen</Text><Text style={styles.quickText}>Abendessen gemeinsam festlegen.</Text></Pressable><Pressable style={styles.quickAction} onPress={() => onNavigate('einkauf')}><View style={styles.quickIcon}><MaterialCommunityIcons name="cart-plus" size={22} color={colors.accent} /></View><Text style={styles.quickTitle}>Einkauf ergänzen</Text><Text style={styles.quickText}>Jeder im Haushalt sieht Änderungen sofort.</Text></Pressable><Pressable style={styles.quickAction} onPress={() => onNavigate('rezepte')}><View style={styles.quickIcon}><MaterialCommunityIcons name="chef-hat" size={22} color={colors.accent} /></View><Text style={styles.quickTitle}>Rezept finden</Text><Text style={styles.quickText}>AT/DE-Ideen, Filter und Kochverlauf nutzen.</Text></Pressable></View>
    </ScrollView>
  );
}

function PlanScreen({ household, meals, setMeals, onSettings }: { household: Household; meals: Record<string, string>; setMeals: React.Dispatch<React.SetStateAction<Record<string, string>>>; onSettings: () => void }) {
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [mealText, setMealText] = useState('');
  const openEditor = (day: string) => { setEditingDay(day); setMealText(meals[day] ?? ''); Haptics.selectionAsync().catch(() => undefined); };
  const persist = async () => {
    if (!editingDay) return;
    const value = mealText.trim();
    setMeals((current) => ({ ...current, [editingDay]: value }));
    try { await saveMeal(editingDay, value || null); } catch (error: any) { Alert.alert('Speichern nicht möglich', germanError(error?.message)); }
    setEditingDay(null);
  };
  return <><ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.screenContent}><ScreenHeader title="Wochenplan" subtitle={`Gemeinsame Abendessen für „${household.name}“. Änderungen sind sofort auf allen Geräten sichtbar.`} action={<IconButton icon="account-circle-outline" onPress={onSettings} accessibilityLabel="Konto und Einstellungen" />} /><View style={styles.dayList}>{DAYS.map((day) => { const selected = Boolean(meals[day]); const isToday = getCurrentDay() === day; return <Pressable key={day} onPress={() => openEditor(day)} style={({ pressed }) => [styles.dayRow, isToday && styles.dayRowToday, { opacity: pressed ? 0.72 : 1 }]}><View style={[styles.dayBadge, isToday && styles.dayBadgeToday]}><Text style={[styles.dayBadgeText, isToday && styles.dayBadgeTextToday]}>{day.slice(0, 2)}</Text></View><View style={styles.flex1}><View style={styles.dayTitleRow}><Text style={styles.dayName}>{day}</Text>{isToday ? <Text style={styles.todayPill}>Heute</Text> : null}</View><Text style={[styles.dayMeal, !selected && styles.dayMealEmpty]} numberOfLines={1}>{meals[day] || 'Abendessen hinzufügen'}</Text></View><MaterialCommunityIcons name="chevron-right" size={24} color={colors.textTertiary} /></Pressable>; })}</View></ScrollView><Modal transparent visible={Boolean(editingDay)} animationType="slide" onRequestClose={() => setEditingDay(null)}><KeyboardAvoidingView style={styles.modalFlex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><Pressable style={styles.modalOverlay} onPress={() => setEditingDay(null)} /><View style={styles.editorSheet}><View style={styles.sheetHandle} /><Text style={styles.editorEyebrow}>ABENDESSEN</Text><Text style={styles.editorTitle}>{editingDay}</Text><Text style={styles.fieldLabel}>Gericht</Text><TextInput autoFocus value={mealText} onChangeText={setMealText} placeholder="z. B. Ofengemüse mit Feta" placeholderTextColor={colors.textTertiary} style={styles.largeInput} /><ActionButton label="Speichern" icon="check" onPress={persist} />{mealText ? <ActionButton label="Planung entfernen" variant="ghost" onPress={() => setMealText('')} /> : null}</View></KeyboardAvoidingView></Modal></>;
}

function ShoppingScreen({ household, items, setItems, onSettings }: { household: Household; items: ShoppingItem[]; setItems: React.Dispatch<React.SetStateAction<ShoppingItem[]>>; onSettings: () => void }) {
  const [name, setName] = useState(''); const [amount, setAmount] = useState(1); const [unit, setUnit] = useState('Stk.'); const [pickerOpen, setPickerOpen] = useState(false);
  const active = items.filter((item) => !item.done); const completed = items.filter((item) => item.done);
  const add = async () => { const cleanName = name.trim(); if (!cleanName) return; const temporary: ShoppingItem = { id: `local-${Date.now()}`, name: cleanName, amount, unit, done: false }; setItems((current) => [temporary, ...current]); setName(''); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined); try { const remote = await addShoppingItem({ name: cleanName, amount, unit }); setItems((current) => current.map((item) => item.id === temporary.id ? remote : item)); } catch (error: any) { setItems((current) => current.filter((item) => item.id !== temporary.id)); Alert.alert('Produkt konnte nicht gespeichert werden', germanError(error?.message)); } };
  const toggle = async (item: ShoppingItem) => { const nextDone = !item.done; setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, done: nextDone, completedByName: nextDone ? household.myDisplayName : null } : entry)); try { await setShoppingDone(item.id, nextDone); } catch (error: any) { Alert.alert('Änderung nicht gespeichert', germanError(error?.message)); } };
  const remove = async (item: ShoppingItem) => { setItems((current) => current.filter((entry) => entry.id !== item.id)); try { await deleteShoppingItem(item.id); } catch (error: any) { Alert.alert('Löschen nicht möglich', germanError(error?.message)); } };
  const renderItem = (item: ShoppingItem) => <View key={item.id} style={styles.shoppingRow}><Pressable accessibilityLabel={item.done ? `${item.name} als offen markieren` : `${item.name} als erledigt markieren`} onPress={() => toggle(item)} style={[styles.checkbox, item.done && styles.checkboxDone]}>{item.done ? <MaterialCommunityIcons name="check" size={17} color="#FFFFFF" /> : null}</Pressable><View style={styles.flex1}><Text style={[styles.shoppingName, item.done && styles.shoppingNameDone]}>{item.name}</Text><Text style={styles.shoppingMeta}>{formatAmount(item.amount)} {item.unit}{item.done && item.completedByName ? ` · erledigt von ${item.completedByName}` : ''}</Text></View><IconButton icon="trash-can-outline" tone="danger" onPress={() => remove(item)} accessibilityLabel={`${item.name} löschen`} /></View>;
  return <><ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.screenContent}><ScreenHeader title="Einkauf" subtitle={`${active.length} ${active.length === 1 ? 'Produkt' : 'Produkte'} offen · ${household.name}`} action={<IconButton icon="account-circle-outline" onPress={onSettings} accessibilityLabel="Konto und Einstellungen" />} /><SurfaceCard style={styles.addCard}><Text style={styles.inputLabel}>Produkt hinzufügen</Text><TextInput value={name} onChangeText={setName} onSubmitEditing={add} returnKeyType="done" placeholder="Was braucht ihr?" placeholderTextColor={colors.textTertiary} style={styles.productInput} /><View style={styles.addRow}><Pressable onPress={() => setPickerOpen(true)} style={styles.amountButton}><View><Text style={styles.miniLabel}>MENGE</Text><Text style={styles.amountText}>{formatAmount(amount)} {unit}</Text></View><MaterialCommunityIcons name="chevron-down" size={20} color={colors.textSecondary} /></Pressable><ActionButton label="Hinzufügen" icon="plus" onPress={add} style={styles.addButton} /></View></SurfaceCard><SectionTitle title="Offen" />{active.length ? <SurfaceCard style={styles.listCard}>{active.map(renderItem)}</SurfaceCard> : <SurfaceCard><EmptyState icon="cart-check" title="Alles erledigt" text="Die gemeinsame Einkaufsliste ist aktuell leer." /></SurfaceCard>}{completed.length ? <><SectionTitle title={`Erledigt · ${completed.length}`} /><SurfaceCard style={styles.listCard}>{completed.map(renderItem)}</SurfaceCard></> : null}</ScrollView><QuantitySheet visible={pickerOpen} amount={amount} unit={unit} onClose={() => setPickerOpen(false)} onDone={(nextAmount, nextUnit) => { setAmount(nextAmount); setUnit(nextUnit); setPickerOpen(false); }} /></>;
}

function OwnRecipeEditor({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: (recipe: OwnRecipe) => void }) {
  const [title, setTitle] = useState(''); const [ingredients, setIngredients] = useState(''); const [instructions, setInstructions] = useState(''); const [servings, setServings] = useState('2'); const [saving, setSaving] = useState(false);
  const save = async () => { const cleanTitle = title.trim(); const ingredientList = ingredients.split('\n').map((line) => line.trim()).filter(Boolean); if (!cleanTitle || ingredientList.length === 0) { Alert.alert('Rezept unvollständig', 'Bitte gib einen Namen und mindestens eine Zutat ein.'); return; } setSaving(true); try { const recipe = await addOwnRecipe({ title: cleanTitle, ingredients: ingredientList, instructions: instructions.trim(), servings: Math.max(1, Math.min(20, Number(servings) || 2)) }); onSaved(recipe); setTitle(''); setIngredients(''); setInstructions(''); setServings('2'); onClose(); } catch (error: any) { Alert.alert('Rezept konnte nicht gespeichert werden', germanError(error?.message)); } finally { setSaving(false); } };
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}><SafeAreaProvider><KeyboardAvoidingView style={styles.fullModal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}><View style={styles.fullModalHeader}><IconButton icon="arrow-left" onPress={onClose} accessibilityLabel="Zurück" /><Text style={styles.fullModalTitle}>Eigenes Rezept</Text><View style={styles.headerSpacer} /></View><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formContent}><View style={styles.inputGroup}><Text style={styles.fieldLabel}>Name des Rezepts</Text><TextInput value={title} onChangeText={setTitle} placeholder="z. B. Omas Kartoffelgulasch" placeholderTextColor={colors.textTertiary} style={styles.formInput} /></View><View style={styles.inputGroup}><Text style={styles.fieldLabel}>Zutaten</Text><Text style={styles.fieldHint}>Eine Zutat pro Zeile.</Text><TextInput value={ingredients} onChangeText={setIngredients} multiline textAlignVertical="top" placeholder={'500 g Kartoffeln\n1 Zwiebel\n2 EL Öl'} placeholderTextColor={colors.textTertiary} style={[styles.formInput, styles.multilineInput]} /></View><View style={styles.inputGroup}><Text style={styles.fieldLabel}>Zubereitung</Text><TextInput value={instructions} onChangeText={setInstructions} multiline textAlignVertical="top" placeholder="Beschreibe die Zubereitung Schritt für Schritt …" placeholderTextColor={colors.textTertiary} style={[styles.formInput, styles.multilineInput]} /></View><View style={styles.inputGroup}><Text style={styles.fieldLabel}>Portionen</Text><TextInput value={servings} onChangeText={setServings} keyboardType="number-pad" style={[styles.formInput, styles.servingsInput]} /></View><ActionButton label="Rezept im Haushalt speichern" icon="content-save-outline" onPress={save} loading={saving} /></ScrollView></KeyboardAvoidingView></SafeAreaProvider></Modal>;
}

function RecipeFilterSheet({ visible, filters, onClose, onApply }: { visible: boolean; filters: SearchFilters; onClose: () => void; onApply: (filters: SearchFilters) => void }) {
  const [draft, setDraft] = useState(filters);
  useEffect(() => { if (visible) setDraft(filters); }, [visible, filters]);
  return <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}><Pressable style={styles.modalOverlay} onPress={onClose} /><View style={styles.filterSheet}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Rezeptfilter</Text><Pressable onPress={() => { setDraft(DEFAULT_FILTERS); }}><Text style={styles.sheetDone}>Zurücksetzen</Text></Pressable></View><Text style={styles.fieldLabel}>Maximale Zeit</Text><View style={styles.timeRow}>{[null, 30, 45, 60].map((minutes) => <Pressable key={minutes ?? 'all'} onPress={() => setDraft((current) => ({ ...current, maxMinutes: minutes }))} style={[styles.filterChip, draft.maxMinutes === minutes && styles.filterChipActive]}><Text style={[styles.filterChipText, draft.maxMinutes === minutes && styles.filterChipTextActive]}>{minutes ? `${minutes} Min` : 'Alle'}</Text></Pressable>)}</View><View style={styles.switchRow}><View style={styles.flex1}><Text style={styles.fieldLabel}>Nur vegetarisch</Text><Text style={styles.fieldHint}>Zeigt nur eindeutig vegetarische Rezepte.</Text></View><Switch value={draft.vegetarianOnly} onValueChange={(value) => setDraft((current) => ({ ...current, vegetarianOnly: value }))} trackColor={{ true: colors.accentSoft }} thumbColor={draft.vegetarianOnly ? colors.accent : undefined} /></View><View style={styles.inputGroup}><Text style={styles.fieldLabel}>Zutat, die schon da ist</Text><TextInput value={draft.ingredient} onChangeText={(value) => setDraft((current) => ({ ...current, ingredient: value }))} placeholder="z. B. Kartoffeln oder Zucchini" placeholderTextColor={colors.textTertiary} style={styles.formInput} /></View><View style={styles.switchRow}><View style={styles.flex1}><Text style={styles.fieldLabel}>Nicht wieder diese Woche</Text><Text style={styles.fieldHint}>Gerichte aus dem aktuellen Wochenplan ausblenden.</Text></View><Switch value={draft.excludeThisWeek} onValueChange={(value) => setDraft((current) => ({ ...current, excludeThisWeek: value }))} trackColor={{ true: colors.accentSoft }} thumbColor={draft.excludeThisWeek ? colors.accent : undefined} /></View><ActionButton label="Filter anwenden" icon="tune-variant" onPress={() => { onApply(draft); onClose(); }} /></View></Modal>;
}

function RecipeDetail({ selection, history, onClose, onAddIngredients, onPlan, onDeleteOwn }: { selection: RecipeSelection | null; history: MealHistoryEntry[]; onClose: () => void; onAddIngredients: (selection: RecipeSelection) => void; onPlan: (selection: RecipeSelection) => void; onDeleteOwn: (recipe: OwnRecipe) => void }) {
  if (!selection) return null;
  const recipe = selection.kind === 'recipe' ? selection.recipe : null; const own = selection.kind === 'own' ? selection.recipe : null; const title = recipe?.title ?? own?.title ?? '';
  const ingredients = recipe ? recipe.ingredients.map((item) => `${item.name}${item.amount ? ` · ${item.amount}` : ''}${item.unit ? ` ${item.unit}` : ''}`) : own?.ingredients ?? [];
  const last = history.find((entry) => normalizeTitle(entry.recipeTitle) === normalizeTitle(title));
  return <Modal visible animationType="slide" onRequestClose={onClose}><SafeAreaProvider><ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.recipeDetailContent}><View style={styles.detailTopbar}><IconButton icon="arrow-left" onPress={onClose} accessibilityLabel="Zurück" />{own ? <IconButton icon="trash-can-outline" tone="danger" onPress={() => onDeleteOwn(own)} accessibilityLabel="Rezept löschen" /> : <View style={styles.headerSpacer} />}</View>{recipe?.image ? <Image source={{ uri: recipe.image }} style={styles.detailImage} resizeMode="cover" /> : <View style={styles.detailPlaceholder}><MaterialCommunityIcons name="chef-hat" size={42} color={colors.accent} /></View>}<Text style={styles.detailSource}>{own ? 'MEIN REZEPT' : recipe?.sourceKind === 'mealflow' ? 'MEALFLOW · AT/DE' : 'ONLINE-REZEPT'}</Text><Text style={styles.detailTitle}>{title}</Text><View style={styles.detailBadges}>{recipe?.minutes ? <Text style={styles.metaBadge}>{recipe.minutes} Min</Text> : null}{recipe?.vegetarian ? <Text style={styles.metaBadge}>Vegetarisch</Text> : null}{own ? <Text style={styles.metaBadge}>{own.servings} Portionen</Text> : null}{last ? <Text style={styles.metaBadge}>{lastCookedLabel(last)}</Text> : null}</View>{recipe?.description ? <Text style={styles.detailMeta}>{recipe.description}</Text> : null}<SectionTitle title="Zutaten" /><SurfaceCard style={styles.ingredientsCard}>{ingredients.map((ingredient, index) => <View key={`${ingredient}-${index}`} style={styles.ingredientRow}><View style={styles.ingredientDot} /><Text style={styles.ingredientText}>{ingredient}</Text></View>)}</SurfaceCard>{(own?.instructions || recipe?.instructions) ? <><SectionTitle title="Zubereitung" /><SurfaceCard style={styles.instructionsCard}><Text style={styles.instructionsText}>{own?.instructions || recipe?.instructions}</Text></SurfaceCard></> : null}<ActionButton label="Zutaten zur Einkaufsliste" icon="cart-plus" onPress={() => onAddIngredients(selection)} /><ActionButton label="Als Abendessen einplanen" icon="calendar-plus" variant="secondary" onPress={() => onPlan(selection)} />{recipe?.url ? <ActionButton label="Originalquelle öffnen" icon="open-in-new" variant="ghost" onPress={() => Linking.openURL(recipe.url!).catch(() => undefined)} /> : null}</ScrollView></SafeAreaProvider></Modal>;
}

function RecipesScreen({ ownRecipes, setOwnRecipes, history, meals, onAddIngredients, onPlan, onSettings }: { ownRecipes: OwnRecipe[]; setOwnRecipes: React.Dispatch<React.SetStateAction<OwnRecipe[]>>; history: MealHistoryEntry[]; meals: Record<string, string>; onAddIngredients: (selection: RecipeSelection) => void; onPlan: (selection: RecipeSelection) => void; onSettings: () => void }) {
  const [mode, setMode] = useState<'entdecken' | 'eigene'>('entdecken'); const [query, setQuery] = useState(''); const [loading, setLoading] = useState(false); const [recipes, setRecipes] = useState<Recipe[]>([]); const [selected, setSelected] = useState<RecipeSelection | null>(null); const [editorOpen, setEditorOpen] = useState(false); const [filterOpen, setFilterOpen] = useState(false); const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS);
  const quickSearch = useMemo(() => getSeasonalQuickSearch(), []);
  const activeFilterCount = Number(Boolean(filters.maxMinutes)) + Number(filters.vegetarianOnly) + Number(Boolean(filters.ingredient.trim())) + Number(filters.excludeThisWeek);
  const runSearch = async (term = query, nextFilters = filters) => { const clean = term.trim(); setQuery(clean); setLoading(true); try { const apiFilters: RecipeFilters = { maxMinutes: nextFilters.maxMinutes, vegetarianOnly: nextFilters.vegetarianOnly, ingredient: nextFilters.ingredient, excludeTitles: nextFilters.excludeThisWeek ? Object.values(meals).filter(Boolean) : [] }; const result = await searchRecipes(clean, apiFilters); setRecipes(result); if (!result.length) Alert.alert('Keine Treffer', 'Mit diesen Suchbegriffen und Filtern wurden keine passenden Rezepte gefunden.'); } catch (error: any) { Alert.alert('Rezeptsuche nicht möglich', germanError(error?.message)); } finally { setLoading(false); } };
  useEffect(() => { searchRecipes('', { excludeTitles: Object.values(meals).filter(Boolean) }).then(setRecipes).catch(() => undefined); }, []);
  const removeOwn = async (recipe: OwnRecipe) => { Alert.alert('Rezept löschen?', `„${recipe.title}“ wird für den ganzen Haushalt gelöscht.`, [{ text: 'Abbrechen', style: 'cancel' }, { text: 'Löschen', style: 'destructive', onPress: async () => { setSelected(null); setOwnRecipes((current) => current.filter((item) => item.id !== recipe.id)); try { await deleteOwnRecipe(recipe.id); } catch (error: any) { Alert.alert('Löschen nicht möglich', germanError(error?.message)); } } }]); };
  return <><ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.screenContent}><ScreenHeader title="Rezepte" subtitle="Österreichische Ideen, Online-Rezepte und eure eigenen Favoriten." action={<IconButton icon="account-circle-outline" onPress={onSettings} accessibilityLabel="Konto und Einstellungen" />} /><View style={styles.recipeSegments}><Pressable onPress={() => setMode('entdecken')} style={[styles.recipeSegment, mode === 'entdecken' && styles.recipeSegmentActive]}><Text style={[styles.recipeSegmentText, mode === 'entdecken' && styles.recipeSegmentTextActive]}>Entdecken</Text></Pressable><Pressable onPress={() => setMode('eigene')} style={[styles.recipeSegment, mode === 'eigene' && styles.recipeSegmentActive]}><Text style={[styles.recipeSegmentText, mode === 'eigene' && styles.recipeSegmentTextActive]}>Unsere Rezepte</Text></Pressable></View>{mode === 'entdecken' ? <><View style={styles.searchRow}><View style={styles.searchShell}><MaterialCommunityIcons name="magnify" size={22} color={colors.textTertiary} /><TextInput value={query} onChangeText={setQuery} onSubmitEditing={() => runSearch()} returnKeyType="search" placeholder="Gericht oder Zutat suchen …" placeholderTextColor={colors.textTertiary} style={styles.searchInput} />{query ? <Pressable onPress={() => setQuery('')}><MaterialCommunityIcons name="close-circle" size={19} color={colors.textTertiary} /></Pressable> : null}</View><Pressable onPress={() => setFilterOpen(true)} style={styles.filterButton}><MaterialCommunityIcons name="tune-variant" size={22} color={colors.accent} />{activeFilterCount ? <View style={styles.filterBadge}><Text style={styles.filterBadgeText}>{activeFilterCount}</Text></View> : null}</Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>{quickSearch.map((term) => <Pressable key={term} onPress={() => runSearch(term)} style={styles.chip}><Text style={styles.chipText}>{term}</Text></Pressable>)}</ScrollView>{loading ? <View style={styles.loadingBox}><ActivityIndicator color={colors.accent} /><Text style={styles.loadingText}>Passende Rezepte werden gesucht …</Text></View> : null}<View style={styles.sourceHint}><MaterialCommunityIcons name="database-search-outline" size={18} color={colors.accent} /><Text style={styles.sourceHintText}>MealFlow AT/DE + TheMealDB · Filter nach Zeit, vegetarisch und vorhandener Zutat</Text></View><View style={styles.recipeGrid}>{!loading && recipes.map((recipe) => { const last = history.find((entry) => normalizeTitle(entry.recipeTitle) === normalizeTitle(recipe.title)); return <Pressable key={recipe.id} onPress={() => setSelected({ kind: 'recipe', recipe })} style={({ pressed }) => [styles.recipeCard, { opacity: pressed ? 0.8 : 1 }]}>{recipe.image ? <Image source={{ uri: recipe.image }} style={styles.recipeImage} resizeMode="cover" /> : <View style={styles.recipeImagePlaceholder}><MaterialCommunityIcons name={recipe.sourceKind === 'mealflow' ? 'silverware-fork-knife' : 'chef-hat'} size={28} color={colors.accent} /></View>}<View style={styles.recipeCardBody}><Text style={styles.recipeSource}>{recipe.sourceKind === 'mealflow' ? 'AT/DE' : 'ONLINE'}</Text><Text style={styles.recipeCardTitle} numberOfLines={2}>{recipe.title}</Text><Text style={styles.recipeCardMeta}>{[recipe.minutes ? `${recipe.minutes} Min` : null, recipe.vegetarian ? 'Vegetarisch' : null, last ? lastCookedLabel(last) : null].filter(Boolean).join(' · ') || `${recipe.ingredients.length} Zutaten`}</Text></View></Pressable>; })}</View>{!loading && !recipes.length ? <SurfaceCard><EmptyState icon="chef-hat" title="Keine Rezepte gefunden" text="Passe Suchbegriff oder Filter an." /></SurfaceCard> : null}</> : <><ActionButton label="Eigenes Rezept hinzufügen" icon="plus" onPress={() => setEditorOpen(true)} />{ownRecipes.length === 0 ? <SurfaceCard><EmptyState icon="book-open-page-variant-outline" title="Noch keine gemeinsamen Rezepte" text="Speichert Familienrezepte und Lieblingsgerichte für den ganzen Haushalt." actionLabel="Erstes Rezept anlegen" onAction={() => setEditorOpen(true)} /></SurfaceCard> : <View style={styles.ownRecipeList}>{ownRecipes.map((recipe) => <Pressable key={recipe.id} onPress={() => setSelected({ kind: 'own', recipe })} style={({ pressed }) => [styles.ownRecipeRow, { opacity: pressed ? 0.75 : 1 }]}><View style={styles.ownRecipeIcon}><MaterialCommunityIcons name="book-open-page-variant-outline" size={22} color={colors.accent} /></View><View style={styles.flex1}><Text style={styles.ownRecipeTitle}>{recipe.title}</Text><Text style={styles.ownRecipeMeta}>{recipe.ingredients.length} Zutaten · {recipe.servings} Portionen</Text></View><MaterialCommunityIcons name="chevron-right" size={24} color={colors.textTertiary} /></Pressable>)}</View>}</>}</ScrollView><RecipeFilterSheet visible={filterOpen} filters={filters} onClose={() => setFilterOpen(false)} onApply={(next) => { setFilters(next); runSearch(query, next); }} /><OwnRecipeEditor visible={editorOpen} onClose={() => setEditorOpen(false)} onSaved={(recipe) => setOwnRecipes((current) => [recipe, ...current])} /><RecipeDetail selection={selected} history={history} onClose={() => setSelected(null)} onAddIngredients={(selection) => { onAddIngredients(selection); setSelected(null); }} onPlan={(selection) => { onPlan(selection); setSelected(null); }} onDeleteOwn={removeOwn} /></>;
}

function DayPicker({ selection, onClose, onSelect }: { selection: RecipeSelection | null; onClose: () => void; onSelect: (day: string) => void }) {
  const title = selection?.recipe.title ?? '';
  return <Modal transparent visible={Boolean(selection)} animationType="slide" onRequestClose={onClose}><Pressable style={styles.modalOverlay} onPress={onClose} /><View style={styles.dayPickerSheet}><View style={styles.sheetHandle} /><Text style={styles.editorEyebrow}>ABENDESSEN EINPLANEN</Text><Text style={styles.dayPickerTitle}>{title}</Text><View style={styles.dayPickerGrid}>{DAYS.map((day) => <Pressable key={day} onPress={() => onSelect(day)} style={styles.dayPickerButton}><Text style={styles.dayPickerButtonText}>{day}</Text></Pressable>)}</View></View></Modal>;
}

function TabBar({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const tabs: { key: Tab; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; active: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }[] = [{ key: 'heute', label: 'Heute', icon: 'home-variant-outline', active: 'home-variant' }, { key: 'woche', label: 'Woche', icon: 'calendar-week-outline', active: 'calendar-week' }, { key: 'einkauf', label: 'Einkauf', icon: 'cart-outline', active: 'cart' }, { key: 'rezepte', label: 'Rezepte', icon: 'silverware-fork-knife', active: 'silverware-fork-knife' }];
  return <View style={styles.tabBar}>{tabs.map((item) => { const active = tab === item.key; return <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => onChange(item.key)} style={styles.tabItem}><MaterialCommunityIcons name={active ? item.active : item.icon} size={23} color={active ? colors.accent : colors.textTertiary} /><Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{item.label}</Text></Pressable>; })}</View>;
}

function MainApp() {
  const insets = useSafeAreaInsets(); const [tab, setTab] = useState<Tab>('heute'); const [items, setItems] = useState<ShoppingItem[]>([]); const [meals, setMeals] = useState<Record<string, string>>({}); const [ownRecipes, setOwnRecipes] = useState<OwnRecipe[]>([]); const [history, setHistory] = useState<MealHistoryEntry[]>([]); const [household, setHousehold] = useState<Household | null>(null); const [invitations, setInvitations] = useState<HouseholdInvitation[]>([]); const [ready, setReady] = useState(false); const [settingsOpen, setSettingsOpen] = useState(false); const [householdOpen, setHouseholdOpen] = useState(false); const [email, setEmail] = useState(''); const [recipeToPlan, setRecipeToPlan] = useState<RecipeSelection | null>(null);

  const reloadAll = async () => {
    clearHouseholdCache();
    const nextHousehold = await loadHousehold();
    const [shopping, plan, customRecipes, cookedHistory, pending, userResult] = await Promise.all([loadShopping(), loadMealPlan(), loadOwnRecipes(), loadMealHistory(), loadPendingHouseholdInvitations(), supabase.auth.getUser()]);
    setHousehold(nextHousehold); setItems(shopping); setMeals(Object.fromEntries(plan.map((entry) => [entry.day, entry.meal ?? '']))); setOwnRecipes(customRecipes); setHistory(cookedHistory); setInvitations(pending); setEmail(userResult.data.user?.email ?? '');
  };

  useEffect(() => { reloadAll().catch((error) => Alert.alert('Daten konnten nicht geladen werden', germanError(error?.message))).finally(() => setReady(true)); }, []);

  useEffect(() => {
    if (!household?.id) return;
    const filter = `household_id=eq.${household.id}`;
    const channel = supabase.channel(`mealflow-household-${household.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items', filter }, () => loadShopping().then(setItems).catch(() => undefined))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_plan', filter }, () => loadMealPlan().then((plan) => setMeals(Object.fromEntries(plan.map((entry) => [entry.day, entry.meal ?? ''])))).catch(() => undefined))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'custom_recipes', filter }, () => loadOwnRecipes().then(setOwnRecipes).catch(() => undefined))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_history', filter }, () => loadMealHistory().then(setHistory).catch(() => undefined))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'household_members', filter }, () => loadHousehold().then(setHousehold).catch(() => undefined))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [household?.id]);

  const changeTab = (next: Tab) => { setTab(next); Haptics.selectionAsync().catch(() => undefined); };
  const addRecipeIngredients = (selection: RecipeSelection) => { const rawIngredients = selection.kind === 'recipe' ? selection.recipe.ingredients.map((ingredient) => ({ name: ingredient.name, amount: ingredient.amount ?? 1, unit: UNITS.includes(ingredient.unit ?? '') ? ingredient.unit! : 'Stk.' })) : selection.recipe.ingredients.map((ingredient) => ({ name: ingredient, amount: 1, unit: 'Stk.' })); const temporary = rawIngredients.slice(0, 30).map((ingredient, index) => ({ id: `recipe-${Date.now()}-${index}`, done: false, ...ingredient })); setItems((current) => [...temporary, ...current]); temporary.forEach((item) => addShoppingItem({ name: item.name, amount: item.amount, unit: item.unit }).catch(() => undefined)); changeTab('einkauf'); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined); };
  const planRecipe = async (day: string) => { if (!recipeToPlan) return; const title = recipeToPlan.recipe.title; setMeals((current) => ({ ...current, [day]: title })); setRecipeToPlan(null); changeTab('woche'); try { await saveMeal(day, title); } catch (error: any) { Alert.alert('Planung nicht gespeichert', germanError(error?.message)); } };
  const markCooked = async (title: string) => { try { await recordCookedMeal(title); setHistory(await loadMealHistory()); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined); } catch (error: any) { Alert.alert('Kochverlauf', germanError(error?.message)); } };

  if (!ready || !household) return <View style={styles.loadingScreen}><View style={styles.brandMark}><MaterialCommunityIcons name="silverware-fork-knife" size={28} color="#FFFFFF" /></View><ActivityIndicator color={colors.accent} /><Text style={styles.loadingText}>Euer Haushalt wird synchronisiert …</Text></View>;
  return <View style={[styles.appRoot, { paddingTop: insets.top }]}><StatusBar style="dark" /><View style={styles.screenArea}>{tab === 'heute' ? <HomeScreen household={household} meals={meals} items={items} history={history} onNavigate={changeTab} onSettings={() => setSettingsOpen(true)} onCooked={markCooked} /> : null}{tab === 'woche' ? <PlanScreen household={household} meals={meals} setMeals={setMeals} onSettings={() => setSettingsOpen(true)} /> : null}{tab === 'einkauf' ? <ShoppingScreen household={household} items={items} setItems={setItems} onSettings={() => setSettingsOpen(true)} /> : null}{tab === 'rezepte' ? <RecipesScreen ownRecipes={ownRecipes} setOwnRecipes={setOwnRecipes} history={history} meals={meals} onAddIngredients={addRecipeIngredients} onPlan={setRecipeToPlan} onSettings={() => setSettingsOpen(true)} /> : null}</View><View style={{ paddingBottom: Math.max(insets.bottom, 8), backgroundColor: colors.surface }}><TabBar tab={tab} onChange={changeTab} /></View><SettingsSheet visible={settingsOpen} email={email} household={household} pendingInvites={invitations.length} onClose={() => setSettingsOpen(false)} onHousehold={() => { setSettingsOpen(false); setHouseholdOpen(true); }} /><HouseholdSheet visible={householdOpen} household={household} invitations={invitations} onClose={() => setHouseholdOpen(false)} onChanged={reloadAll} /><DayPicker selection={recipeToPlan} onClose={() => setRecipeToPlan(null)} onSelect={planRecipe} /></View>;
}

function Root() {
  const [authenticated, setAuthenticated] = useState(false); const [checking, setChecking] = useState(true);
  useEffect(() => { if (!isCloudConfigured) { setChecking(false); return; } supabase.auth.getSession().then(({ data }) => { setAuthenticated(Boolean(data.session)); setChecking(false); }); const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { if (!session) clearHouseholdCache(); setAuthenticated(Boolean(session)); }); return () => listener.subscription.unsubscribe(); }, []);
  if (checking) return <View style={styles.loadingScreen}><ActivityIndicator color={colors.accent} /></View>;
  if (!isCloudConfigured) return <View style={styles.loadingScreen}><Text style={styles.configurationTitle}>Cloud-Verbindung fehlt</Text><Text style={styles.configurationText}>MealFlow benötigt die Supabase-Konfiguration, damit dein Haushalt sicher synchronisiert werden kann.</Text></View>;
  return authenticated ? <MainApp /> : <AuthScreen />;
}

export default function App() { return <SafeAreaProvider><Root /></SafeAreaProvider>; }

const styles = StyleSheet.create({
  appRoot: { flex: 1, backgroundColor: colors.background }, screenArea: { flex: 1 }, screenContent: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 30, gap: 18 }, flex1: { flex: 1 }, flexButton: { flex: 1 }, modalFlex: { flex: 1, justifyContent: 'flex-end' }, fullModal: { flex: 1, backgroundColor: colors.background }, headerSpacer: { width: 44, height: 44 },
  authRoot: { flex: 1, backgroundColor: colors.background }, authContent: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12 }, brandMark: { width: 58, height: 58, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', ...shadow }, authBrand: { ...typography.title, color: colors.accent, marginTop: 6 }, authHero: { ...typography.hero, color: colors.text, maxWidth: 380 }, authSubtitle: { ...typography.body, color: colors.textSecondary, maxWidth: 370, marginBottom: 12 }, authCard: { padding: 18, gap: 16 }, segmentedControl: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: 4 }, segmentButton: { flex: 1, minHeight: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, segmentButtonActive: { backgroundColor: colors.surface, ...shadow }, segmentText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' }, segmentTextActive: { color: colors.text }, inputGroup: { gap: 7 }, inputLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' }, inputShell: { minHeight: 52, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.background, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.md }, textInput: { flex: 1, ...typography.body, color: colors.text, paddingVertical: 12 }, authHint: { ...typography.caption, color: colors.textTertiary, textAlign: 'center' },
  heroCard: { padding: 20, gap: 10 }, heroIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, heroLabel: { ...typography.label, color: colors.accent, marginTop: 4 }, heroMeal: { ...typography.h2, color: colors.text }, heroMeta: { ...typography.body, color: colors.textSecondary, marginBottom: 4 }, heroActions: { flexDirection: 'row', gap: 10 }, metricsRow: { flexDirection: 'row', gap: 12 }, metricCard: { flex: 1, padding: 16, gap: 7 }, metricNumber: { fontSize: 26, lineHeight: 31, fontWeight: '800', color: colors.text }, metricLabel: { ...typography.caption, color: colors.textSecondary }, quickGrid: { gap: 10 }, quickAction: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.lg, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow }, quickIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, quickTitle: { ...typography.bodyStrong, color: colors.text, minWidth: 95 }, quickText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  dayList: { gap: 9 }, dayRow: { minHeight: 76, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.lg }, dayRowToday: { borderColor: '#BBD1C1', backgroundColor: '#FBFDFB' }, dayBadge: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }, dayBadgeToday: { backgroundColor: colors.accentSoft }, dayBadgeText: { ...typography.bodyStrong, color: colors.textSecondary }, dayBadgeTextToday: { color: colors.accent }, dayTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 }, dayName: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' }, todayPill: { ...typography.caption, color: colors.accent, backgroundColor: colors.accentSoft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, overflow: 'hidden' }, dayMeal: { ...typography.bodyStrong, color: colors.text, marginTop: 2 }, dayMealEmpty: { color: colors.textTertiary, fontWeight: '400' },
  modalOverlay: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay }, bottomSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 18, paddingBottom: 26, position: 'absolute', left: 0, right: 0, bottom: 0 }, settingsSheet: { backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 18, paddingBottom: 30, position: 'absolute', left: 0, right: 0, bottom: 0, gap: 12 }, editorSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 18, paddingBottom: 30, gap: 12 }, dayPickerSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 18, paddingBottom: 30, position: 'absolute', left: 0, right: 0, bottom: 0, gap: 12 }, filterSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 18, paddingBottom: 30, position: 'absolute', left: 0, right: 0, bottom: 0, gap: 16 }, sheetHandle: { width: 38, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginVertical: 10 }, sheetHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, sheetCancel: { ...typography.body, color: colors.textSecondary }, sheetTitle: { ...typography.title, color: colors.text }, sheetDone: { ...typography.bodyStrong, color: colors.accent }, pickerRow: { flexDirection: 'row', minHeight: 210 }, picker: { flex: 1 }, pickerItem: { color: colors.text, fontSize: 19 },
  settingsCard: { padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 }, settingsIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, settingsLabel: { ...typography.caption, color: colors.textSecondary }, settingsValue: { ...typography.bodyStrong, color: colors.text, marginTop: 2 }, settingsMeta: { ...typography.caption, color: colors.textTertiary, marginTop: 4 }, editorEyebrow: { ...typography.label, color: colors.accent }, editorTitle: { ...typography.h2, color: colors.text, marginBottom: 2 }, fieldLabel: { ...typography.bodyStrong, color: colors.text }, fieldHint: { ...typography.caption, color: colors.textSecondary }, largeInput: { minHeight: 54, borderRadius: radius.md, backgroundColor: colors.background, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 14, ...typography.body, color: colors.text },
  householdHero: { padding: 18, flexDirection: 'row', gap: 14, alignItems: 'center' }, householdIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, householdHeroLabel: { ...typography.label, color: colors.accent }, householdHeroTitle: { ...typography.h2, color: colors.text, marginTop: 2 }, householdHeroMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 4 }, memberRow: { minHeight: 66, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, avatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, avatarText: { ...typography.bodyStrong, color: colors.accent }, memberName: { ...typography.bodyStrong, color: colors.text }, memberMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 }, inviteCodeCard: { padding: 18, gap: 10 }, inviteCode: { fontSize: 30, letterSpacing: 4, fontWeight: '800', color: colors.text }, inviteCard: { padding: 14, flexDirection: 'row', gap: 10, alignItems: 'center' }, smallAction: { minWidth: 102 }, settingsBlock: { padding: 16, gap: 13 }, codeInput: { letterSpacing: 2, fontWeight: '700' },
  addCard: { padding: 15, gap: 10 }, productInput: { minHeight: 52, backgroundColor: colors.background, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, ...typography.body, color: colors.text }, addRow: { flexDirection: 'row', gap: 10 }, amountButton: { flex: 1, minHeight: 52, paddingHorizontal: 13, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, miniLabel: { ...typography.label, color: colors.textTertiary }, amountText: { ...typography.bodyStrong, color: colors.text }, addButton: { flex: 1 }, listCard: { overflow: 'hidden' }, shoppingRow: { minHeight: 70, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, checkbox: { width: 28, height: 28, borderRadius: 10, borderWidth: 1.5, borderColor: '#A7AFA5', alignItems: 'center', justifyContent: 'center' }, checkboxDone: { backgroundColor: colors.accent, borderColor: colors.accent }, shoppingName: { ...typography.bodyStrong, color: colors.text }, shoppingNameDone: { color: colors.textTertiary, textDecorationLine: 'line-through' }, shoppingMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  recipeSegments: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, padding: 4, borderRadius: radius.md }, recipeSegment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, recipeSegmentActive: { backgroundColor: colors.surface, ...shadow }, recipeSegmentText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' }, recipeSegmentTextActive: { color: colors.text }, searchRow: { flexDirection: 'row', gap: 9 }, searchShell: { flex: 1, minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, searchInput: { flex: 1, ...typography.body, color: colors.text }, filterButton: { width: 54, height: 54, borderRadius: radius.md, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, filterBadge: { position: 'absolute', right: 5, top: 5, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }, filterBadgeText: { fontSize: 10, color: '#FFFFFF', fontWeight: '800' }, chipsRow: { gap: 8, paddingRight: 12 }, chip: { paddingHorizontal: 13, paddingVertical: 9, backgroundColor: colors.accentSoft, borderRadius: radius.pill }, chipText: { ...typography.caption, color: colors.accent, fontWeight: '700' }, sourceHint: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 4 }, sourceHintText: { ...typography.caption, color: colors.textSecondary, flex: 1 }, loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24, gap: 10 }, loadingText: { ...typography.caption, color: colors.textSecondary }, recipeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, recipeCard: { width: '48.5%', backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...shadow }, recipeImage: { width: '100%', height: 130, backgroundColor: colors.surfaceMuted }, recipeImagePlaceholder: { width: '100%', height: 130, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, recipeCardBody: { padding: 12, gap: 4 }, recipeSource: { ...typography.label, color: colors.accent }, recipeCardTitle: { ...typography.bodyStrong, color: colors.text }, recipeCardMeta: { ...typography.caption, color: colors.textSecondary }, ownRecipeList: { gap: 9 }, ownRecipeRow: { minHeight: 72, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.lg }, ownRecipeIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, ownRecipeTitle: { ...typography.bodyStrong, color: colors.text }, ownRecipeMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  timeRow: { flexDirection: 'row', gap: 8 }, filterChip: { flex: 1, minHeight: 42, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }, filterChipActive: { backgroundColor: colors.accent }, filterChipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' }, filterChipTextActive: { color: '#FFFFFF' }, switchRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12 },
  fullModalHeader: { paddingHorizontal: 18, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, fullModalTitle: { ...typography.title, color: colors.text }, formContent: { padding: 18, paddingBottom: 40, gap: 18 }, formInput: { minHeight: 52, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, ...typography.body, color: colors.text }, multilineInput: { minHeight: 130 }, servingsInput: { maxWidth: 110 }, recipeDetailContent: { minHeight: '100%', backgroundColor: colors.background, padding: 18, paddingBottom: 44, gap: 16 }, detailTopbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, detailImage: { width: '100%', height: 250, borderRadius: radius.xl, backgroundColor: colors.surfaceMuted }, detailPlaceholder: { width: '100%', height: 190, borderRadius: radius.xl, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, detailSource: { ...typography.label, color: colors.accent }, detailTitle: { ...typography.h1, color: colors.text }, detailMeta: { ...typography.body, color: colors.textSecondary }, detailBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, metaBadge: { ...typography.caption, color: colors.accent, backgroundColor: colors.accentSoft, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill, overflow: 'hidden' }, ingredientsCard: { padding: 15, gap: 12 }, ingredientRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, ingredientDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent, marginTop: 8 }, ingredientText: { ...typography.body, color: colors.text, flex: 1 }, instructionsCard: { padding: 16 }, instructionsText: { ...typography.body, color: colors.textSecondary }, dayPickerTitle: { ...typography.h2, color: colors.text, marginBottom: 4 }, dayPickerGrid: { gap: 8 }, dayPickerButton: { minHeight: 48, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, justifyContent: 'center', paddingHorizontal: 15 }, dayPickerButtonText: { ...typography.bodyStrong, color: colors.text },
  tabBar: { height: 64, flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingHorizontal: 6 }, tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 }, tabLabel: { fontSize: 11, lineHeight: 14, fontWeight: '600', color: colors.textTertiary }, tabLabelActive: { color: colors.accent }, loadingScreen: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 }, configurationTitle: { ...typography.h2, color: colors.text, textAlign: 'center' }, configurationText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
