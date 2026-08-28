import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Appearance,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  PanResponder,
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
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  acceptHouseholdInvitation,
  addOwnRecipe,
  addShoppingItem,
  clearHouseholdCache,
  createHouseholdInvitation,
  createHouseholdJoinCode,
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
  removeHouseholdMember,
  saveMeal,
  saveSaskiaMeal,
  setShoppingDone,
  setHouseholdInvitePermission,
  updateMyDisplayName,
  type Household,
  type HouseholdInvitation,
  type MealHistoryEntry,
  type OwnRecipe,
  type ShoppingItem,
} from './src/lib/cloud';
import { getSeasonalQuickSearch, searchRecipePage, searchRecipes, type Recipe, type RecipeFilters } from './src/lib/recipes';
import { isCloudConfigured, supabase } from './src/lib/supabase';
import { ActionButton, EmptyState, IconButton, refreshUiComponentStyles, ScreenHeader, SectionTitle, SurfaceCard } from './src/ui/components';
import { colors, getShadow, radius, setThemePalette, spacing, typography } from './src/ui/theme';
import { DEFAULT_PREFERENCES, loadPreferences, savePreferences, type AppPreferences, type StartTab, type ThemeMode } from './src/lib/preferences';
import { InventoryScreen, refreshInventoryStyles } from './src/screens/InventoryScreen';
import { loadPantry, type PantryItem } from './src/lib/inventory';
import { getUrgentPantry, syncExpiryNotifications } from './src/lib/expiryNotifications';
import { checkAndPromptAndroidUpdate } from './src/lib/androidUpdater';
import appConfig from './app.json';

const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const UNITS = ['Stk.', 'Pkg.', 'g', 'kg', 'ml', 'l', 'EL', 'TL', 'Bund', 'Dose'];
const AMOUNTS = Array.from({ length: 80 }, (_, index) => (index + 1) / 2);
const APP_VERSION = appConfig.expo.version;
const GROCERY_SUGGESTIONS = [
  'Milch', 'Butter', 'Eier', 'Brot', 'Semmeln', 'Joghurt', 'Käse', 'Schinken',
  'Äpfel', 'Bananen', 'Tomaten', 'Gurke', 'Paprika', 'Kartoffeln', 'Zwiebeln',
  'Knoblauch', 'Nudeln', 'Reis', 'Mehl', 'Zucker', 'Mineralwasser', 'Kaffee',
  'Hühnerfleisch', 'Hackfleisch', 'Lachs', 'Salat', 'Zucchini', 'Karotten'
];

type Tab = StartTab;
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

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`${label} dauert zu lange. Bitte prüfe deine Verbindung.`)), timeoutMs);
    promise.then(
      (value) => { clearTimeout(timeout); resolve(value); },
      (error) => { clearTimeout(timeout); reject(error); },
    );
  });
}

function formatAmount(value: number) {
  return String(value).replace('.5', ',5');
}

function parseSpokenShopping(value: string) {
  const clean = value.trim().replace(/\s+/g, ' ');
  if (!clean) return { name: '' } as { name: string; amount?: number; unit?: string };
  const numberWords: Record<string, number> = { ein: 1, eine: 1, einen: 1, eins: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, halb: 0.5 };
  const firstMatch = clean.match(/^([^ ]+)\s+(.+)$/);
  if (!firstMatch) return { name: clean };
  const amountToken = (firstMatch[1] ?? '').toLocaleLowerCase('de-AT');
  const numeric = Number(amountToken.replace(',', '.'));
  const parsedAmount = Number.isFinite(numeric) ? numeric : (numberWords[amountToken] ?? 0);
  if (!(parsedAmount > 0)) return { name: clean };
  const remainder = firstMatch[2] ?? '';
  const units: Array<[RegExp, string]> = [
    [/^(liter|litern|l)\b\s*/i, 'l'], [/^(milliliter|millilitern|ml)\b\s*/i, 'ml'],
    [/^(kilogramm|kilo|kg)\b\s*/i, 'kg'], [/^(gramm|gram|g)\b\s*/i, 'g'],
    [/^(packung|packungen|pkg)\b\s*/i, 'Pkg.'], [/^(stück|stueck|stk)\b\s*/i, 'Stk.'],
    [/^(dose|dosen)\b\s*/i, 'Dose'], [/^(bund)\b\s*/i, 'Bund'],
  ];
  for (const [pattern, unit] of units) {
    if (!pattern.test(remainder)) continue;
    const name = remainder.replace(pattern, '').trim();
    if (!name) return { name: clean };
    return { name: name.charAt(0).toLocaleUpperCase('de-AT') + name.slice(1), amount: parsedAmount, unit };
  }
  return { name: clean };
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

function dateIso(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getWeekDays(weekOffset = 0) {
  const base = new Date();
  base.setHours(12, 0, 0, 0);
  const monday = new Date(base);
  monday.setDate(base.getDate() - ((base.getDay() + 6) % 7) + (weekOffset * 7));
  return DAYS.map((day, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    const iso = dateIso(date);
    return {
      day,
      date,
      iso,
      dayNumber: date.toLocaleDateString('de-AT', { day: '2-digit' }),
      monthShort: date.toLocaleDateString('de-AT', { month: 'short' }).replace('.', ''),
      isToday: iso === todayIso(),
    };
  });
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


function useIosSwipeBack(onBack: () => void, enabled = true) {
  return useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => (
      Platform.OS === 'ios'
      && enabled
      && gesture.x0 <= 34
      && gesture.dx > 14
      && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.25
    ),
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dx > 78 && gesture.vx > 0.15) onBack();
    },
  }), [enabled, onBack]);
}

function useSwipeDownToClose(onClose: () => void, enabled = true) {
  return useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => (
      enabled
      && gesture.dy > 8
      && Math.abs(gesture.dy) > Math.abs(gesture.dx) * 1.3
    ),
    onPanResponderRelease: (_event, gesture) => {
      if (gesture.dy > 54 || gesture.vy > 0.72) onClose();
    },
  }), [enabled, onClose]);
}

function SheetDismissHandle({ onClose }: { onClose: () => void }) {
  const dismiss = useSwipeDownToClose(onClose);
  return <View {...dismiss.panHandlers} style={styles.sheetDismissZone}><View style={styles.sheetHandle} /></View>;
}

function LoadingScreen({ message = 'MealFlow wird vorbereitet …', progress = 0 }: { message?: string; progress?: number }) {
  const safeProgress = Math.max(0, Math.min(100, Math.round(progress)));
  return <View style={styles.loadingScreen}><View style={styles.loadingLogo}><MaterialCommunityIcons name="silverware-fork-knife" size={30} color="#FFFFFF" /></View><Text style={styles.loadingBrand}>MealFlow</Text><Text style={styles.loadingMessage}>{message}</Text><View style={styles.loadingProgress}><View style={[styles.loadingProgressFill, { width: `${safeProgress}%` as `${number}%` }]} /></View><Text style={styles.loadingPercent}>{safeProgress}%</Text><Text style={styles.loadingHint}>Haushalt · Einkauf · Woche · Vorrat</Text></View>;
}

function StartupErrorScreen({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <View style={styles.loadingScreen}><View style={styles.loadingLogo}><MaterialCommunityIcons name="cloud-alert-outline" size={30} color="#FFFFFF" /></View><Text style={styles.loadingBrand}>MealFlow</Text><Text style={styles.configurationTitle}>Start konnte nicht abgeschlossen werden</Text><Text style={styles.configurationText}>{message}</Text><ActionButton label="Erneut laden" icon="refresh" onPress={onRetry} style={{ minWidth: 190 }} /><Text style={styles.loadingHint}>Die App bleibt nicht mehr im Ladebildschirm hängen.</Text></View>;
}

function RecipeArtwork({ recipe, variant }: { recipe: Recipe; variant: 'card' | 'detail' }) {
  const [uri, setUri] = useState(recipe.image);
  useEffect(() => { setUri(recipe.image); }, [recipe.image, recipe.imageFallback]);

  const handleError = () => {
    if (uri && recipe.imageFallback && uri !== recipe.imageFallback) {
      setUri(recipe.imageFallback);
      return;
    }
    setUri(undefined);
  };

  const imageStyle = variant === 'detail' ? styles.detailImage : styles.recipeImage;
  const placeholderStyle = variant === 'detail' ? styles.detailPlaceholder : styles.recipeImagePlaceholder;
  const iconSize = variant === 'detail' ? 42 : 28;

  if (!uri) {
    return <View style={placeholderStyle}><MaterialCommunityIcons name={'chef-hat'} size={iconSize} color={colors.accent} /></View>;
  }

  return <Image source={{ uri }} style={imageStyle} resizeMode="cover" onError={handleError} accessibilityLabel={`Bild zu ${recipe.title}`} />;
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
      <StatusBar style={colors.background === '#0F1210' ? 'light' : 'dark'} />
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
  const insets = useSafeAreaInsets();
  const [draftAmount, setDraftAmount] = useState(amount);
  const [draftUnit, setDraftUnit] = useState(unit);
  useEffect(() => { if (visible) { setDraftAmount(amount); setDraftUnit(unit); } }, [visible, amount, unit]);
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose} />
      <View style={[styles.bottomSheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
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
  const insets = useSafeAreaInsets();
  const [joinCode, setJoinCode] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [householdName, setHouseholdName] = useState(household.name);
  const [displayName, setDisplayName] = useState(household.myDisplayName);
  const [busy, setBusy] = useState(false);
  const canManage = household.role === 'owner' || household.role === 'admin';
  const isOwner = household.role === 'owner';
  const canInvite = household.canInvite;
  const swipeBack = useIosSwipeBack(onClose, visible);

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

  const shareCode = () => run(async () => {
    const code = await createHouseholdJoinCode(household.id);
    await Share.share({ message: `Komm in meinen MealFlow-Haushalt „${household.name}“. Einladungscode: ${code}\n\nDer Code ist 14 Tage gültig und kann einmal verwendet werden.` });
  });

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
    Alert.alert('Haushalt gewechselt', 'Du siehst jetzt die gemeinsamen Daten dieses Haushalts.');
  });

  const saveNames = () => run(async () => {
    if (canManage && householdName.trim() !== household.name) await renameHousehold(household.id, householdName);
    if (displayName.trim() !== household.myDisplayName) await updateMyDisplayName(displayName);
    await onChanged();
    Alert.alert('Gespeichert', 'Haushalt und Profil wurden aktualisiert.');
  });

  const changeInvitePermission = (member: Household['members'][number], allowed: boolean) => run(async () => {
    await setHouseholdInvitePermission(household.id, member.userId, allowed);
    await onChanged();
  });

  const confirmRemoveMember = (member: Household['members'][number]) => {
    Alert.alert(
      'Mitglied entfernen',
      `Soll ${member.displayName} wirklich aus „${household.name}“ entfernt werden?`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Entfernen',
          style: 'destructive',
          onPress: () => {
            void run(async () => {
              await removeHouseholdMember(household.id, member.userId);
              await onChanged();
            });
          },
        },
      ],
    );
  };

  const accept = (invitation: HouseholdInvitation) => run(async () => {
    await acceptHouseholdInvitation(invitation.id);
    await onChanged();
    Alert.alert('Einladung angenommen', `Du bist jetzt Mitglied in „${invitation.householdName}“.`);
  });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent={false} onRequestClose={onClose}>
      <SafeAreaView style={[styles.fullModal, { paddingTop: Math.max(insets.top + 6, Platform.OS === 'ios' ? 54 : 30) }]} edges={['bottom']} {...swipeBack.panHandlers}>
        <View style={styles.fullModalHeader}><IconButton icon="arrow-left" onPress={onClose} accessibilityLabel="Zurück" /><Text style={styles.fullModalTitle}>Haushalt</Text><View style={styles.headerSpacer} /></View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formContent}>
          <SurfaceCard style={styles.householdHero}>
            <View style={styles.householdIcon}><MaterialCommunityIcons name="home-heart" size={28} color={colors.accent} /></View>
            <View style={styles.flex1}><Text style={styles.householdHeroLabel}>AKTIVER HAUSHALT</Text><Text style={styles.householdHeroTitle}>{household.name}</Text><Text style={styles.householdHeroMeta}>{household.members.length} {household.members.length === 1 ? 'Mitglied' : 'Mitglieder'} · gemeinsame Daten in Echtzeit</Text></View>
          </SurfaceCard>

          {invitations.length ? <><SectionTitle title="Offene Einladungen" />{invitations.map((invite) => <SurfaceCard key={invite.id} style={styles.inviteCard}><View style={styles.flex1}><Text style={styles.memberName}>{invite.householdName}</Text><Text style={styles.memberMeta}>Einladung für {invite.email}</Text></View><ActionButton label="Annehmen" onPress={() => accept(invite)} style={styles.smallAction} /></SurfaceCard>)}</> : null}

          <SectionTitle title="Mitglieder" />
          <SurfaceCard style={styles.listCard}>{household.members.map((member) => <View key={member.userId} style={styles.memberPermissionBlock}>
            <View style={styles.memberRow}><View style={styles.avatar}><Text style={styles.avatarText}>{member.displayName.slice(0, 1).toUpperCase()}</Text></View><View style={styles.flex1}><Text style={styles.memberName}>{member.displayName}{member.displayName === household.myDisplayName ? ' · Du' : ''}</Text><Text style={styles.memberMeta}>{member.role === 'owner' ? 'Ersteller · darf immer einladen' : member.role === 'admin' ? 'Admin' : 'Mitglied'}{member.role !== 'owner' && member.canInvite ? ' · darf einladen' : ''}</Text></View>{isOwner && member.role !== 'owner' ? <IconButton icon="account-remove-outline" tone="danger" onPress={() => confirmRemoveMember(member)} accessibilityLabel={`${member.displayName} aus Haushalt entfernen`} /> : null}</View>
            {isOwner && member.role !== 'owner' ? <View style={styles.memberInvitePermissionRow}><View style={styles.flex1}><Text style={styles.fieldLabel}>Neue Personen einladen</Text><Text style={styles.fieldHint}>Dieses Recht kann nur der Haushaltsersteller vergeben.</Text></View><Switch value={member.canInvite} disabled={busy} onValueChange={(allowed) => changeInvitePermission(member, allowed)} trackColor={{ true: colors.accentSoft }} thumbColor={member.canInvite ? colors.accent : undefined} /></View> : null}
          </View>)}</SurfaceCard>

          <SectionTitle title="Einladen" />
          {canInvite ? <>
            <SurfaceCard style={styles.inviteCodeCard}>
              <Text style={styles.fieldLabel}>Einladungscode erstellen</Text><Text style={styles.fieldHint}>MealFlow erzeugt einen neuen, 14 Tage gültigen Einmal-Code. Der alte permanente Haushaltscode wird aus Sicherheitsgründen nicht mehr verwendet.</Text><ActionButton label="Einladungscode teilen" icon="share-variant-outline" variant="secondary" onPress={shareCode} loading={busy} />
            </SurfaceCard>
            <SurfaceCard style={styles.settingsBlock}><Text style={styles.fieldLabel}>Per E-Mail einladen</Text><TextInput value={inviteEmail} onChangeText={setInviteEmail} autoCapitalize="none" keyboardType="email-address" placeholder="name@beispiel.at" placeholderTextColor={colors.textTertiary} style={styles.formInput} /><ActionButton label="E-Mail-Einladung erstellen" icon="email-fast-outline" onPress={inviteByEmail} loading={busy} /></SurfaceCard>
          </> : <SurfaceCard style={styles.settingsBlock}><Text style={styles.fieldLabel}>Einladen ist eingeschränkt</Text><Text style={styles.fieldHint}>Standardmäßig kann nur der Haushaltsersteller neue Personen einladen. Er kann dir dieses Recht in der Mitgliederliste freigeben.</Text></SurfaceCard>}

          <SectionTitle title="Beitreten" />
          <SurfaceCard style={styles.settingsBlock}><Text style={styles.fieldLabel}>Einladungscode verwenden</Text><TextInput value={joinCode} onChangeText={(value) => setJoinCode(value.toUpperCase())} autoCapitalize="characters" placeholder="CODE EINGEBEN" placeholderTextColor={colors.textTertiary} style={[styles.formInput, styles.codeInput]} /><ActionButton label="Haushalt beitreten" icon="home-plus-outline" variant="secondary" onPress={join} loading={busy} /></SurfaceCard>

          <SectionTitle title="Profil & Haushalt" />
          <SurfaceCard style={styles.settingsBlock}>
            <View style={styles.inputGroup}><Text style={styles.fieldLabel}>Dein Name im Haushalt</Text><TextInput value={displayName} onChangeText={setDisplayName} placeholder="Vorname" placeholderTextColor={colors.textTertiary} style={styles.formInput} /></View>
            {canManage ? <View style={styles.inputGroup}><Text style={styles.fieldLabel}>Name des Haushalts</Text><TextInput value={householdName} onChangeText={setHouseholdName} placeholder="Unser Haushalt" placeholderTextColor={colors.textTertiary} style={styles.formInput} /></View> : null}
            <ActionButton label="Änderungen speichern" icon="content-save-outline" onPress={saveNames} loading={busy} />
          </SurfaceCard>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function SettingsSheet({
  visible,
  email,
  household,
  pendingInvites,
  preferences,
  darkMode,
  onClose,
  onHousehold,
  onPreferencesChange,
}: {
  visible: boolean;
  email: string;
  household: Household;
  pendingInvites: number;
  preferences: AppPreferences;
  darkMode: boolean;
  onClose: () => void;
  onHousehold: () => void;
  onPreferencesChange: (preferences: AppPreferences) => void;
}) {
  const insets = useSafeAreaInsets();
  const [updateBusy, setUpdateBusy] = useState(false);
  const update = (patch: Partial<AppPreferences>) => onPreferencesChange({ ...preferences, ...patch });
  const checkAndroidUpdate = async () => {
    setUpdateBusy(true);
    try { await checkAndPromptAndroidUpdate(true); } finally { setUpdateBusy(false); }
  };
  const themeOptions: { key: ThemeMode; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }[] = [
    { key: 'system', label: 'System', icon: 'cellphone-cog' },
    { key: 'light', label: 'Hell', icon: 'white-balance-sunny' },
    { key: 'dark', label: 'Dunkel', icon: 'weather-night' },
  ];
  const startOptions: { key: StartTab; label: string }[] = [
    { key: 'heute', label: 'Heute' },
    { key: 'woche', label: 'Woche' },
    { key: 'einkauf', label: 'Einkauf' },
    { key: 'vorrat', label: 'Vorrat' },
  ];

  return (
    <Modal transparent visible={visible} animationType="fade" presentationStyle="overFullScreen" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose} />
      <View style={[styles.settingsSheetV214, { paddingTop: Math.max(insets.top, 10), paddingBottom: Math.max(insets.bottom, 18) }]} renderToHardwareTextureAndroid>
        <SheetDismissHandle onClose={onClose} />
        <View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Einstellungen</Text><IconButton icon="close" onPress={onClose} accessibilityLabel="Schließen" /></View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.settingsScrollContent}>
          <Pressable onPress={onHousehold}><SurfaceCard style={styles.settingsCard}><View style={styles.settingsIcon}><MaterialCommunityIcons name="home-heart" size={22} color={colors.accent} /></View><View style={styles.flex1}><Text style={styles.settingsLabel}>Haushalt</Text><Text style={styles.settingsValue}>{household.name}</Text><Text style={styles.settingsMeta}>{household.members.length} Mitglieder{household.canInvite ? ' · Einladen erlaubt' : ''}{pendingInvites ? ` · ${pendingInvites} offene Einladung` : ''}</Text></View><MaterialCommunityIcons name="chevron-right" size={24} color={colors.textTertiary} /></SurfaceCard></Pressable>

          <Text style={styles.settingsSectionTitle}>Darstellung</Text>
          <SurfaceCard style={styles.settingsBlock}>
            <Text style={styles.fieldLabel}>Erscheinungsbild</Text>
            <View style={styles.themeSegmentRow}>{themeOptions.map((option) => { const active = preferences.themeMode === option.key; return <Pressable key={option.key} onPress={() => update({ themeMode: option.key })} style={[styles.themeSegment, active && styles.themeSegmentActive]}><MaterialCommunityIcons name={option.icon} size={19} color={active ? colors.accent : colors.textSecondary} /><Text style={[styles.themeSegmentText, active && styles.themeSegmentTextActive]}>{option.label}</Text></Pressable>; })}</View>
            <Text style={styles.fieldHint}>{preferences.themeMode === 'system' ? `Folgt aktuell dem ${darkMode ? 'dunklen' : 'hellen'} Systemdesign.` : `MealFlow verwendet immer den ${preferences.themeMode === 'dark' ? 'dunklen' : 'hellen'} Modus.`}</Text>
  <View style={styles.preferenceDivider} />
  <View style={styles.preferenceRow}><View style={styles.flex1}><View style={styles.cozyTitleRow}><MaterialCommunityIcons name="weather-sunset" size={19} color={colors.accent} /><Text style={styles.fieldLabel}>Cozy Mode</Text></View><Text style={styles.fieldHint}>Wärmere Farben und eine ruhigere, wohnlichere MealFlow-Atmosphäre.</Text></View><Switch value={preferences.cozyMode} onValueChange={(value) => update({ cozyMode: value })} trackColor={{ true: colors.accentSoft }} thumbColor={preferences.cozyMode ? colors.accent : undefined} /></View>
          </SurfaceCard>

          <Text style={styles.settingsSectionTitle}>Einkaufsliste</Text>
          <SurfaceCard style={styles.settingsBlock}>
            <View style={styles.preferenceRow}><View style={styles.flex1}><Text style={styles.fieldLabel}>Kompakte Liste</Text><Text style={styles.fieldHint}>Mehr Produkte gleichzeitig sehen.</Text></View><Switch value={preferences.compactShopping} onValueChange={(value) => update({ compactShopping: value })} trackColor={{ true: colors.accentSoft }} thumbColor={preferences.compactShopping ? colors.accent : undefined} /></View>
            <View style={styles.preferenceDivider} />
            <View style={styles.preferenceRow}><View style={styles.flex1}><Text style={styles.fieldLabel}>Erledigte Produkte anzeigen</Text><Text style={styles.fieldHint}>Abgehakte Artikel unter der offenen Liste behalten.</Text></View><Switch value={preferences.showCompletedShopping} onValueChange={(value) => update({ showCompletedShopping: value })} trackColor={{ true: colors.accentSoft }} thumbColor={preferences.showCompletedShopping ? colors.accent : undefined} /></View>
          </SurfaceCard>

          <Text style={styles.settingsSectionTitle}>Persönlich</Text>
          <SurfaceCard style={styles.settingsBlock}>
            <Text style={styles.fieldLabel}>Startseite beim Öffnen</Text>
            <View style={styles.startTabRow}>{startOptions.map((option) => <Pressable key={option.key} onPress={() => update({ startTab: option.key })} style={[styles.startTabChip, preferences.startTab === option.key && styles.startTabChipActive]}><Text style={[styles.startTabChipText, preferences.startTab === option.key && styles.startTabChipTextActive]}>{option.label}</Text></Pressable>)}</View>
            <View style={styles.preferenceDivider} />
            <View style={styles.preferenceRow}><View style={styles.flex1}><Text style={styles.fieldLabel}>Haptisches Feedback</Text><Text style={styles.fieldHint}>Kurze Rückmeldung bei wichtigen Aktionen.</Text></View><Switch value={preferences.hapticsEnabled} onValueChange={(value) => update({ hapticsEnabled: value })} trackColor={{ true: colors.accentSoft }} thumbColor={preferences.hapticsEnabled ? colors.accent : undefined} /></View>
          </SurfaceCard>

          {Platform.OS === 'android' ? <><Text style={styles.settingsSectionTitle}>Updates</Text><SurfaceCard style={styles.settingsBlock}><View style={styles.preferenceRow}><View style={styles.flex1}><Text style={styles.fieldLabel}>Android Auto-Updater</Text><Text style={styles.fieldHint}>MealFlow prüft beim Start automatisch auf eine neue APK. Die Installation benötigt nur noch die Android-Sicherheitsbestätigung.</Text></View><MaterialCommunityIcons name="update" size={24} color={colors.accent} /></View><ActionButton label="Nach Updates suchen" icon="download-outline" variant="secondary" onPress={checkAndroidUpdate} loading={updateBusy} /></SurfaceCard></> : null}
          <SurfaceCard style={styles.settingsCard}><View style={styles.settingsIcon}><MaterialCommunityIcons name="account-outline" size={22} color={colors.accent} /></View><View style={styles.flex1}><Text style={styles.settingsLabel}>Angemeldet als</Text><Text style={styles.settingsValue}>{email || 'MealFlow-Konto'}</Text></View></SurfaceCard>
          <SurfaceCard style={styles.settingsCard}><View style={styles.settingsIcon}><MaterialCommunityIcons name="information-outline" size={22} color={colors.accent} /></View><View style={styles.flex1}><Text style={styles.settingsLabel}>App-Version</Text><Text style={styles.settingsValue}>MealFlow {APP_VERSION}</Text><Text style={styles.settingsMeta}>Version wird direkt aus der App-Konfiguration gelesen.</Text></View></SurfaceCard>
          <ActionButton label="Abmelden" icon="logout" variant="danger" onPress={() => supabase.auth.signOut().catch(() => undefined)} />
        </ScrollView>
      </View>
    </Modal>
  );
}



function HomeScreen({ household, meals, items, history, pantryItems, onNavigate, onSettings, onCooked }: { household: Household; meals: Record<string, string>; items: ShoppingItem[]; history: MealHistoryEntry[]; pantryItems: PantryItem[]; onNavigate: (tab: Tab) => void; onSettings: () => void; onCooked: (title: string) => Promise<void> }) {
  const tonight = meals[todayIso()] || '';
  const planned = getWeekDays(1).filter((entry) => Boolean(meals[entry.iso])).length;
  const openItems = items.filter((item) => !item.done).length;
  const cookedToday = tonight ? history.some((entry) => entry.cookedOn === todayIso() && normalizeTitle(entry.recipeTitle) === normalizeTitle(tonight)) : false;
  const dateLabel = new Date().toLocaleDateString('de-AT', { weekday: 'long', day: '2-digit', month: 'long' });
  const expiring = getUrgentPantry(pantryItems, 3).slice(0, 3);
  return <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.screenContent}>
    <ScreenHeader eyebrow={`${dateLabel} · ${household.name}`} title="Heute" subtitle={`Gemeinsam mit ${household.members.length} ${household.members.length === 1 ? 'Person' : 'Personen'} planen.`} action={<IconButton icon="account-circle-outline" onPress={onSettings} accessibilityLabel="Konto und Einstellungen" />} />
    <SurfaceCard style={styles.heroCard}><View style={styles.heroIcon}><MaterialCommunityIcons name="silverware-fork-knife" size={25} color={colors.accent} /></View><Text style={styles.heroLabel}>HEUTE ABEND</Text><Text style={styles.heroMeal}>{tonight || 'Noch nichts geplant'}</Text><Text style={styles.heroMeta}>{tonight ? cookedToday ? 'Als gekocht markiert – der Haushalt ist auf dem gleichen Stand.' : 'Dein Abendessen ist im gemeinsamen Wochenplan.' : 'Plane jetzt ein Abendessen für den Haushalt.'}</Text><View style={styles.heroActions}><ActionButton label={tonight ? 'Wochenplan öffnen' : 'Abendessen planen'} icon="calendar-week-outline" onPress={() => onNavigate('woche')} variant="secondary" style={styles.flexButton} />{tonight && !cookedToday ? <ActionButton label="Gekocht" icon="check-circle-outline" onPress={() => onCooked(tonight)} style={styles.flexButton} /> : null}</View></SurfaceCard>
    <View style={styles.metricsRow}><SurfaceCard style={styles.metricCard}><MaterialCommunityIcons name="calendar-check-outline" size={22} color={colors.accent} /><Text style={styles.metricNumber}>{planned}/7</Text><Text style={styles.metricLabel}>nächste Woche geplant</Text></SurfaceCard><SurfaceCard style={styles.metricCard}><MaterialCommunityIcons name="cart-outline" size={22} color={colors.accent} /><Text style={styles.metricNumber}>{openItems}</Text><Text style={styles.metricLabel}>offene Einkäufe</Text></SurfaceCard></View>
    {expiring.length ? <><SectionTitle title="Bald aufbrauchen" /><SurfaceCard style={styles.homeExpiryCard}>{expiring.map(({ item, info }) => <Pressable key={item.id} onPress={() => onNavigate('vorrat')} style={styles.homeExpiryRow}><MaterialCommunityIcons name={info.tone === 'today' || info.tone === 'expired' ? 'alert-circle' : 'clock-alert-outline'} size={19} color={info.tone === 'today' || info.tone === 'expired' ? colors.danger : colors.accent} /><Text style={styles.homeExpiryName} numberOfLines={1}>{item.productName}</Text><Text style={[styles.homeExpiryStatus, (info.tone === 'today' || info.tone === 'expired') && styles.homeExpiryStatusDanger]}>{info.label}</Text></Pressable>)}</SurfaceCard></> : null}
    <SectionTitle title="Schnellzugriff" /><View style={styles.quickGrid}><Pressable style={styles.quickAction} onPress={() => onNavigate('woche')}><View style={styles.quickIcon}><MaterialCommunityIcons name="calendar-plus" size={22} color={colors.accent} /></View><Text style={styles.quickTitle}>Woche planen</Text><Text style={styles.quickText}>Abendessen gemeinsam festlegen.</Text></Pressable><Pressable style={styles.quickAction} onPress={() => onNavigate('einkauf')}><View style={styles.quickIcon}><MaterialCommunityIcons name="cart-plus" size={22} color={colors.accent} /></View><Text style={styles.quickTitle}>Einkauf ergänzen</Text><Text style={styles.quickText}>Jeder im Haushalt sieht Änderungen sofort.</Text></Pressable><Pressable style={styles.quickAction} onPress={() => onNavigate('vorrat')}><View style={styles.quickIcon}><MaterialCommunityIcons name="archive-outline" size={22} color={colors.accent} /></View><Text style={styles.quickTitle}>Vorrat</Text><Text style={styles.quickText}>Gekaufte Produkte scannen, Mengen und MHD verwalten.</Text></Pressable></View>
  </ScrollView>;
}

function PlanScreen({ household, meals, saskiaMeals, setMeals, setSaskiaMeals, onSettings }: { household: Household; meals: Record<string, string>; saskiaMeals: Record<string, string>; setMeals: React.Dispatch<React.SetStateAction<Record<string, string>>>; setSaskiaMeals: React.Dispatch<React.SetStateAction<Record<string, string>>>; onSettings: () => void }) {
  const insets = useSafeAreaInsets();
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [editingSlot, setEditingSlot] = useState<'main' | 'saskia'>('main');
  const [mealText, setMealText] = useState('');
  const weekDays = getWeekDays(1).map((entry) => ({
    ...entry,
    meal: meals[entry.iso]?.trim() ?? '',
    saskiaMeal: saskiaMeals[entry.iso]?.trim() ?? '',
  }));
  const plannedSlots = weekDays.reduce((count, entry) => count + (entry.meal ? 1 : 0) + (entry.saskiaMeal ? 1 : 0), 0);
  const remainingSlots = 14 - plannedSlots;
  const startDate = weekDays[0]!.date;
  const endDate = weekDays[6]!.date;
  const rangeLabel = `${startDate.toLocaleDateString('de-AT', { day: '2-digit', month: 'short' })} – ${endDate.toLocaleDateString('de-AT', { day: '2-digit', month: 'short' })}`;

  const closeEditor = () => {
    setEditingDay(null);
    setEditingDate(null);
    setEditingSlot('main');
    setMealText('');
  };

  const openEditor = (day: string, plannedDate: string, slot: 'main' | 'saskia') => {
    setEditingDay(day);
    setEditingDate(plannedDate);
    setEditingSlot(slot);
    setMealText(slot === 'saskia' ? (saskiaMeals[plannedDate] ?? '') : (meals[plannedDate] ?? ''));
    Haptics.selectionAsync().catch(() => undefined);
  };

  const persist = async () => {
    if (!editingDate) return;
    const value = mealText.trim();
    const plannedDate = editingDate;
    const slot = editingSlot;
    if (slot === 'saskia') setSaskiaMeals((current) => ({ ...current, [plannedDate]: value }));
    else setMeals((current) => ({ ...current, [plannedDate]: value }));
    closeEditor();
    try {
      if (slot === 'saskia') await saveSaskiaMeal(plannedDate, value || null);
      else await saveMeal(plannedDate, value || null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (error: any) {
      Alert.alert('Speichern nicht möglich', germanError(error?.message));
    }
  };

  const removePlan = async () => {
    if (!editingDate) return;
    const plannedDate = editingDate;
    const slot = editingSlot;
    if (slot === 'saskia') setSaskiaMeals((current) => ({ ...current, [plannedDate]: '' }));
    else setMeals((current) => ({ ...current, [plannedDate]: '' }));
    closeEditor();
    try {
      if (slot === 'saskia') await saveSaskiaMeal(plannedDate, null);
      else await saveMeal(plannedDate, null);
      Haptics.selectionAsync().catch(() => undefined);
    } catch (error: any) {
      Alert.alert('Planung konnte nicht entfernt werden', germanError(error?.message));
    }
  };

  return <>
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.screenContent}>
      <ScreenHeader eyebrow={`${rangeLabel} · ${household.name}`} title="Wochenplan" subtitle="Pro Tag zwei Gerichte planen – ein gemeinsames Abendessen und eines für Saskia." action={<IconButton icon="account-circle-outline" onPress={onSettings} accessibilityLabel="Konto und Einstellungen" />} />
      <SurfaceCard style={styles.weekOverviewCard}>
        <View style={styles.weekOverviewTop}><View><Text style={styles.weekOverviewLabel}>NÄCHSTE WOCHE</Text><Text style={styles.weekOverviewTitle}>{plannedSlots} von 14 Gerichten geplant</Text></View><View style={styles.weekOverviewBadge}><MaterialCommunityIcons name={remainingSlots === 0 ? 'check-all' : 'calendar-edit'} size={20} color={colors.accent} /><Text style={styles.weekOverviewBadgeText}>{remainingSlots === 0 ? 'Fertig' : `${remainingSlots} offen`}</Text></View></View>
        <View style={styles.weekProgressTrack}><View style={[styles.weekProgressFill, { width: `${Math.round((plannedSlots / 14) * 100)}%` as `${number}%` }]} /></View>
        <View style={styles.weekStrip}>{weekDays.map((entry) => <View key={entry.iso} style={styles.weekStripDay}><Text style={styles.weekStripDow}>{entry.day.slice(0, 2).toUpperCase()}</Text><Text style={styles.weekStripDate}>{entry.dayNumber}</Text><View style={styles.weekStripDots}><View style={[styles.weekStripDot, entry.meal ? styles.weekStripDotPlanned : styles.weekStripDotOpen]} /><View style={[styles.weekStripDot, entry.saskiaMeal ? styles.weekStripDotSaskia : styles.weekStripDotOpen]} /></View></View>)}</View>
      </SurfaceCard>

      <View style={styles.weekSectionHeader}><View><Text style={styles.weekSectionTitle}>Abendessen</Text><Text style={styles.weekSectionHint}>Zwei getrennte Gerichte pro Tag</Text></View><MaterialCommunityIcons name="silverware-fork-knife" size={22} color={colors.accent} /></View>

      <View style={styles.dayList}>{weekDays.map((entry) => {
        const dayPlanned = (entry.meal ? 1 : 0) + (entry.saskiaMeal ? 1 : 0);
        return <View key={entry.iso} style={styles.dayCard}>
          <View style={styles.dayDateBlock}><Text style={styles.dayDateDow}>{entry.day.slice(0, 2).toUpperCase()}</Text><Text style={styles.dayDateNumber}>{entry.dayNumber}</Text><Text style={styles.dayDateMonth}>{entry.monthShort}</Text></View>
          <View style={styles.dayCardContent}>
            <View style={styles.dayTitleRow}><Text style={styles.dayName}>{entry.day}</Text><Text style={[styles.dayStatusPill, dayPlanned === 2 ? styles.dayStatusPlanned : styles.dayStatusOpen]}>{dayPlanned}/2 geplant</Text></View>
            <View style={styles.dayMealSlots}>
              <Pressable onPress={() => openEditor(entry.day, entry.iso, 'main')} style={({ pressed }) => [styles.dayMealSlot, { opacity: pressed ? 0.72 : 1 }]}>
                <View style={styles.dayMealSlotHeader}><Text style={styles.dayMealSlotLabel}>ABENDESSEN</Text><MaterialCommunityIcons name={entry.meal ? 'pencil-outline' : 'plus'} size={16} color={colors.textSecondary} /></View>
                <Text style={[styles.dayMealSlotValue, !entry.meal && styles.dayMealSlotEmpty]} numberOfLines={2}>{entry.meal || 'Noch kein Gericht geplant'}</Text>
              </Pressable>
              <Pressable onPress={() => openEditor(entry.day, entry.iso, 'saskia')} style={({ pressed }) => [styles.dayMealSlot, styles.dayMealSlotSaskia, { opacity: pressed ? 0.72 : 1 }]}>
                <View style={styles.dayMealSlotHeader}><View style={styles.saskiaLabelRow}><MaterialCommunityIcons name="account-heart-outline" size={14} color={colors.accent} /><Text style={styles.dayMealSlotLabelSaskia}>FÜR SASKIA</Text></View><MaterialCommunityIcons name={entry.saskiaMeal ? 'pencil-outline' : 'plus'} size={16} color={colors.accent} /></View>
                <Text style={[styles.dayMealSlotValue, !entry.saskiaMeal && styles.dayMealSlotEmpty]} numberOfLines={2}>{entry.saskiaMeal || 'Noch kein Gericht für Saskia'}</Text>
              </Pressable>
            </View>
          </View>
        </View>;
      })}</View>
    </ScrollView>

    <Modal transparent visible={Boolean(editingDay)} animationType="fade" presentationStyle="overFullScreen" onRequestClose={closeEditor}>
      <KeyboardAvoidingView style={styles.modalFlex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.modalOverlay} onPress={closeEditor} />
        <View style={[styles.editorSheet, { paddingBottom: Math.max(insets.bottom, 18) }]}>
          <SheetDismissHandle onClose={closeEditor} />
          <Text style={styles.editorEyebrow}>{editingSlot === 'saskia' ? 'FÜR SASKIA' : 'ABENDESSEN'}</Text>
          <Text style={styles.editorTitle}>{editingDay}</Text>
          <Text style={styles.fieldHint}>{editingDate ? new Date(`${editingDate}T12:00:00`).toLocaleDateString('de-AT', { weekday: 'long', day: '2-digit', month: 'long' }) : ''}</Text>
          <Text style={styles.fieldLabel}>{editingSlot === 'saskia' ? 'Gericht für Saskia' : 'Gericht'}</Text>
          <TextInput autoFocus value={mealText} onChangeText={setMealText} placeholder={editingSlot === 'saskia' ? 'z. B. Pasta für Saskia' : 'z. B. Ofengemüse mit Feta'} placeholderTextColor={colors.textTertiary} style={styles.largeInput} returnKeyType="done" onSubmitEditing={persist} />
          <ActionButton label="Gericht speichern" icon="check" onPress={persist} />
          {editingDate && (editingSlot === 'saskia' ? saskiaMeals[editingDate] : meals[editingDate]) ? <ActionButton label={editingSlot === 'saskia' ? 'Gericht für Saskia entfernen' : 'Abendessen entfernen'} icon="calendar-remove-outline" variant="ghost" onPress={removePlan} /> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </>;
}

function ShoppingProductRow({ item, compact, onToggle, onDelete }: { item: ShoppingItem; compact: boolean; onToggle: (item: ShoppingItem) => void; onDelete: (item: ShoppingItem) => void }) {
  const meta = [`${formatAmount(item.amount)} ${item.unit}`, item.addedByName ? `von ${item.addedByName}` : null, item.done && item.completedByName ? `erledigt von ${item.completedByName}` : null].filter(Boolean).join(' · ');
  return (
    <View style={[styles.shoppingRowV214, compact && styles.shoppingRowCompact]}>
      <Pressable accessibilityLabel={item.done ? `${item.name} als offen markieren` : `${item.name} als erledigt markieren`} onPress={() => onToggle(item)} style={[styles.checkbox, item.done && styles.checkboxDone]}>
        {item.done ? <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" /> : null}
      </Pressable>
      <View style={styles.flex1}>
        <Text style={[styles.shoppingName, item.done && styles.shoppingNameDone]} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.shoppingMetaTiny} numberOfLines={1}>{meta}</Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.name} löschen`}
        hitSlop={8}
        onPress={() => onDelete(item)}
        style={({ pressed }) => ({
          width: 34,
          height: 34,
          borderRadius: 11,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? colors.dangerSoft : colors.surfaceMuted,
          opacity: pressed ? 0.72 : 1,
        })}
      >
        <MaterialCommunityIcons name="trash-can-outline" size={18} color={colors.danger} />
      </Pressable>
    </View>
  );
}

function ShoppingScreen({
  household,
  items,
  setItems,
  onSettings,
  preferences,
}: {
  household: Household;
  items: ShoppingItem[];
  setItems: React.Dispatch<React.SetStateAction<ShoppingItem[]>>;
  onSettings: () => void;
  preferences: AppPreferences;
}) {
  const insets = useSafeAreaInsets();
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState('Stk.');
  const [recognizing, setRecognizing] = useState(false);
  const [undoItem, setUndoItem] = useState<ShoppingItem | null>(null);

  useSpeechRecognitionEvent('start', () => setRecognizing(true));
  useSpeechRecognitionEvent('end', () => setRecognizing(false));
  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results[0]?.transcript?.trim();
    if (!transcript) return;
    const parsed = parseSpokenShopping(transcript);
    setName(parsed.name);
    if (parsed.amount) setAmount(parsed.amount);
    if (parsed.unit) setUnit(parsed.unit);
  });
  useSpeechRecognitionEvent('error', () => setRecognizing(false));

  const active = useMemo(() => items.filter((item) => !item.done), [items]);
  const completed = useMemo(() => items.filter((item) => item.done), [items]);
  const suggestions = useMemo(() => {
    const needle = normalizeTitle(name);
    if (needle.length < 2) return [];
    const source = Array.from(new Set([...items.map((item) => item.name), ...GROCERY_SUGGESTIONS]));
    return source.filter((entry) => normalizeTitle(entry).startsWith(needle) && normalizeTitle(entry) !== needle).slice(0, 5);
  }, [items, name]);

  useEffect(() => {
    if (!undoItem) return;
    const timer = setTimeout(() => setUndoItem(null), 5200);
    return () => clearTimeout(timer);
  }, [undoItem]);

  const feedback = () => {
    if (preferences.hapticsEnabled) Haptics.selectionAsync().catch(() => undefined);
  };

  const openAdd = () => {
    setName('');
    setAmount(1);
    setUnit('Stk.');
    setAddOpen(true);
    feedback();
  };

  const add = async (overrideName?: string) => {
    const cleanName = (overrideName ?? name).trim();
    if (!cleanName) return;
    const temporary: ShoppingItem = {
      id: `local-${Date.now()}`,
      name: cleanName,
      amount,
      unit,
      done: false,
      addedByName: household.myDisplayName,
    };
    setItems((current) => [temporary, ...current]);
    setAddOpen(false);
    setName('');
    if (preferences.hapticsEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    try {
      const remote = await addShoppingItem({ name: cleanName, amount, unit });
      setItems((current) => current.map((item) => item.id === temporary.id ? remote : item));
    } catch (error: any) {
      setItems((current) => current.filter((item) => item.id !== temporary.id));
      Alert.alert('Produkt konnte nicht gespeichert werden', germanError(error?.message));
    }
  };

  const toggle = async (item: ShoppingItem) => {
    const nextDone = !item.done;
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, done: nextDone, completedByName: nextDone ? household.myDisplayName : null } : entry));
    feedback();
    try { await setShoppingDone(item.id, nextDone); }
    catch (error: any) { Alert.alert('Änderung nicht gespeichert', germanError(error?.message)); }
  };

  const remove = async (item: ShoppingItem) => {
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    setUndoItem(item);
    if (preferences.hapticsEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => undefined);
    try { await deleteShoppingItem(item.id); }
    catch (error: any) {
      setUndoItem(null);
      setItems((current) => [item, ...current]);
      Alert.alert('Löschen nicht möglich', germanError(error?.message));
    }
  };

  const undoDelete = async () => {
    const item = undoItem;
    if (!item) return;
    setUndoItem(null);
    const temporary: ShoppingItem = { ...item, id: `undo-${Date.now()}`, done: false, completedBy: null, completedByName: null, completedAt: null, addedByName: household.myDisplayName };
    setItems((current) => [temporary, ...current]);
    try {
      const remote = await addShoppingItem({ name: item.name, amount: item.amount, unit: item.unit });
      setItems((current) => current.map((entry) => entry.id === temporary.id ? remote : entry));
    } catch (error: any) {
      setItems((current) => current.filter((entry) => entry.id !== temporary.id));
      Alert.alert('Rückgängig nicht möglich', germanError(error?.message));
    }
  };

  const startVoice = async () => {
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Mikrofon nicht freigegeben', 'Aktiviere Mikrofon und Spracherkennung in den iPhone-Einstellungen, um Produkte einzusprechen.');
        return;
      }
      ExpoSpeechRecognitionModule.start({ lang: 'de-AT', interimResults: true, continuous: false, maxAlternatives: 1 });
    } catch (error: any) {
      Alert.alert('Spracherkennung nicht verfügbar', germanError(error?.message));
    }
  };

  const changeAmount = (delta: number) => setAmount((current) => Math.max(0.5, Math.min(40, current + delta)));

  return <>
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={[styles.screenContent, styles.shoppingScreenContent]}>
      <ScreenHeader title="Einkauf" subtitle={`${active.length} ${active.length === 1 ? 'Produkt' : 'Produkte'} offen · ${household.name}`} action={<IconButton icon="account-circle-outline" onPress={onSettings} accessibilityLabel="Konto und Einstellungen" />} />
      <View style={styles.shoppingToolbar}><View><Text style={styles.shoppingToolbarLabel}>GEMEINSAME LISTE</Text><Text style={styles.shoppingToolbarTitle}>{active.length ? `${active.length} noch zu besorgen` : 'Alles erledigt'}</Text></View></View>

      <SectionTitle title="Offen" />
      {active.length ? <SurfaceCard style={styles.listCard}>{active.map((item) => <ShoppingProductRow key={item.id} item={item} compact={preferences.compactShopping} onToggle={toggle} onDelete={remove} />)}</SurfaceCard> : <SurfaceCard><EmptyState icon="cart-check" title="Alles erledigt" text="Eure gemeinsame Einkaufsliste ist aktuell leer." actionLabel="Produkt hinzufügen" onAction={openAdd} /></SurfaceCard>}

      {preferences.showCompletedShopping && completed.length ? <><SectionTitle title={`Erledigt · ${completed.length}`} /><SurfaceCard style={styles.listCard}>{completed.map((item) => <ShoppingProductRow key={item.id} item={item} compact={preferences.compactShopping} onToggle={toggle} onDelete={remove} />)}</SurfaceCard></> : null}
      <Text style={styles.swipeHint}>Zum Löschen den kleinen Papierkorb beim Produkt verwenden.</Text>
    </ScrollView>

    <Pressable accessibilityRole="button" accessibilityLabel="Produkt hinzufügen" onPress={openAdd} style={({ pressed }) => [styles.shoppingFab, pressed && styles.shoppingFabPressed]}>
      <MaterialCommunityIcons name="plus" size={31} color="#FFFFFF" />
    </Pressable>

    <Modal transparent visible={addOpen} animationType="fade" presentationStyle="overFullScreen" onRequestClose={() => setAddOpen(false)}>
      <KeyboardAvoidingView style={styles.modalFlex} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={styles.modalOverlay} onPress={() => setAddOpen(false)} />
        <View style={[styles.shoppingAddSheet, { paddingBottom: Math.max(insets.bottom, 18) }]} renderToHardwareTextureAndroid>
          <SheetDismissHandle onClose={() => setAddOpen(false)} />
          <View style={styles.shoppingSheetHeader}><View><Text style={styles.editorEyebrow}>EINKAUF</Text><Text style={styles.editorTitle}>Produkt hinzufügen</Text></View><IconButton icon="close" onPress={() => setAddOpen(false)} accessibilityLabel="Schließen" /></View>
          <View style={styles.voiceInputShell}><MaterialCommunityIcons name="cart-outline" size={21} color={colors.textTertiary} /><TextInput autoFocus value={name} onChangeText={setName} onSubmitEditing={() => add()} returnKeyType="done" placeholder="z. B. Milch" placeholderTextColor={colors.textTertiary} style={styles.voiceProductInput} /><Pressable onPress={recognizing ? () => ExpoSpeechRecognitionModule.stop() : startVoice} style={[styles.micButton, recognizing && styles.micButtonActive]}><MaterialCommunityIcons name={recognizing ? 'stop' : 'microphone-outline'} size={22} color={recognizing ? '#FFFFFF' : colors.accent} /></Pressable></View>
          {recognizing ? <Text style={styles.listeningText}>Ich höre zu … z. B. „2 Liter Milch“.</Text> : null}
          {suggestions.length ? <View style={styles.suggestionBox}>{suggestions.map((suggestion) => <Pressable key={suggestion} onPress={() => setName(suggestion)} style={styles.suggestionRow}><MaterialCommunityIcons name="magnify" size={17} color={colors.textTertiary} /><Text style={styles.suggestionText}>{suggestion}</Text></Pressable>)}</View> : null}
          <View style={styles.quantityControlRow}><View><Text style={styles.miniLabel}>MENGE</Text><Text style={styles.quantityValue}>{formatAmount(amount)}</Text></View><View style={styles.quantityButtons}><Pressable onPress={() => changeAmount(-0.5)} style={styles.quantityRoundButton}><MaterialCommunityIcons name="minus" size={20} color={colors.text} /></Pressable><Pressable onPress={() => changeAmount(0.5)} style={styles.quantityRoundButton}><MaterialCommunityIcons name="plus" size={20} color={colors.text} /></Pressable></View></View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.unitChips}>{UNITS.map((value) => <Pressable key={value} onPress={() => setUnit(value)} style={[styles.unitChip, unit === value && styles.unitChipActive]}><Text style={[styles.unitChipText, unit === value && styles.unitChipTextActive]}>{value}</Text></Pressable>)}</ScrollView>
          <ActionButton label="Zur Einkaufsliste hinzufügen" icon="plus" onPress={() => add()} disabled={!name.trim()} />
        </View>
      </KeyboardAvoidingView>
    </Modal>

    {undoItem ? <View style={styles.undoBar}><Text style={styles.undoText}>„{undoItem.name}“ gelöscht</Text><Pressable onPress={undoDelete}><Text style={styles.undoAction}>Rückgängig</Text></Pressable></View> : null}
  </>;
}



function OwnRecipeEditor({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: (recipe: OwnRecipe) => void }) {
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState('');
  const [servings, setServings] = useState('2');
  const [ingredientInput, setIngredientInput] = useState('');
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setStep(0); setTitle(''); setServings('2'); setIngredientInput(''); setIngredients([]); setInstructions('');
  }, [visible]);

  const goBack = () => {
    if (step > 0) setStep((current) => current - 1);
    else onClose();
  };
  const swipeBack = useIosSwipeBack(goBack, visible);

  const addIngredient = (value = ingredientInput) => {
    const clean = value.trim();
    if (!clean) return;
    setIngredients((current) => current.some((entry) => normalizeTitle(entry) === normalizeTitle(clean)) ? current : [...current, clean]);
    setIngredientInput('');
  };

  const next = () => {
    if (step === 0 && !title.trim()) { Alert.alert('Name fehlt', 'Gib deinem Rezept zuerst einen Namen.'); return; }
    if (step === 1 && ingredients.length === 0) { Alert.alert('Zutaten fehlen', 'Füge mindestens eine Zutat hinzu.'); return; }
    setStep((current) => Math.min(2, current + 1));
  };

  const save = async () => {
    if (!title.trim() || ingredients.length === 0) return;
    setSaving(true);
    try {
      const recipe = await addOwnRecipe({
        title: title.trim(),
        ingredients,
        instructions: instructions.trim(),
        servings: Math.max(1, Math.min(20, Number(servings) || 2)),
      });
      onSaved(recipe);
      onClose();
    } catch (error: any) {
      Alert.alert('Rezept konnte nicht gespeichert werden', germanError(error?.message));
    } finally {
      setSaving(false);
    }
  };

  const quickIngredients = GROCERY_SUGGESTIONS.filter((entry) => !ingredients.some((item) => normalizeTitle(item) === normalizeTitle(entry))).slice(0, 6);

  return (
    <Modal visible={visible} animationType="fade" presentationStyle="fullScreen" statusBarTranslucent={false} onRequestClose={goBack}>
      <SafeAreaView style={styles.fullModal} edges={['top', 'bottom']}>
        <KeyboardAvoidingView style={styles.fullModal} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} {...swipeBack.panHandlers}>
          <View style={styles.fullModalHeader}><IconButton icon="arrow-left" onPress={goBack} accessibilityLabel="Zurück" /><View style={styles.recipeWizardHeaderText}><Text style={styles.fullModalTitle}>Unser Rezept</Text><Text style={styles.recipeWizardStep}>Schritt {step + 1} von 3</Text></View><IconButton icon="close" onPress={onClose} accessibilityLabel="Schließen" /></View>
          <View style={styles.recipeWizardProgress}>{[0, 1, 2].map((index) => <View key={index} style={[styles.recipeWizardProgressPart, index <= step && styles.recipeWizardProgressPartActive]} />)}</View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.recipeWizardContent}>
            {step === 0 ? <>
              <View><Text style={styles.recipeWizardEyebrow}>GRUNDLAGEN</Text><Text style={styles.recipeWizardTitle}>Wie heißt euer Rezept?</Text><Text style={styles.recipeWizardSubtitle}>Nur die wichtigsten Angaben – Details kommen danach.</Text></View>
              <View style={styles.inputGroup}><Text style={styles.fieldLabel}>Rezeptname</Text><TextInput autoFocus value={title} onChangeText={setTitle} placeholder="z. B. Cremige Hendl-Pasta" placeholderTextColor={colors.textTertiary} style={styles.formInput} /></View>
              <View style={styles.inputGroup}><Text style={styles.fieldLabel}>Portionen</Text><View style={styles.servingSelector}><Pressable onPress={() => setServings(String(Math.max(1, (Number(servings) || 2) - 1)))} style={styles.quantityRoundButton}><MaterialCommunityIcons name="minus" size={20} color={colors.text} /></Pressable><Text style={styles.servingValue}>{Math.max(1, Number(servings) || 2)}</Text><Pressable onPress={() => setServings(String(Math.min(20, (Number(servings) || 2) + 1)))} style={styles.quantityRoundButton}><MaterialCommunityIcons name="plus" size={20} color={colors.text} /></Pressable></View></View>
            </> : null}

            {step === 1 ? <>
              <View><Text style={styles.recipeWizardEyebrow}>ZUTATEN</Text><Text style={styles.recipeWizardTitle}>Was kommt hinein?</Text><Text style={styles.recipeWizardSubtitle}>Zutaten einzeln hinzufügen – dadurch bleibt die Liste sauber und gut lesbar.</Text></View>
              <View style={styles.ingredientAddRow}><TextInput autoFocus value={ingredientInput} onChangeText={setIngredientInput} onSubmitEditing={() => addIngredient()} returnKeyType="done" placeholder="z. B. 500 g Kartoffeln" placeholderTextColor={colors.textTertiary} style={styles.ingredientAddInput} /><Pressable onPress={() => addIngredient()} style={styles.ingredientAddButton}><MaterialCommunityIcons name="plus" size={22} color="#FFFFFF" /></Pressable></View>
              {ingredientInput.length < 2 ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.ingredientQuickRow}>{quickIngredients.map((entry) => <Pressable key={entry} onPress={() => addIngredient(entry)} style={styles.ingredientQuickChip}><Text style={styles.ingredientQuickText}>{entry}</Text></Pressable>)}</ScrollView> : null}
              <SurfaceCard style={styles.ingredientEditorCard}>{ingredients.length ? ingredients.map((ingredient, index) => <View key={`${ingredient}-${index}`} style={styles.ingredientEditorRow}><View style={styles.ingredientNumber}><Text style={styles.ingredientNumberText}>{index + 1}</Text></View><Text style={styles.ingredientEditorText}>{ingredient}</Text><IconButton icon="close" onPress={() => setIngredients((current) => current.filter((_, itemIndex) => itemIndex !== index))} accessibilityLabel={`${ingredient} entfernen`} /></View>) : <EmptyState icon="format-list-bulleted" title="Noch keine Zutaten" text="Tippe eine Zutat ein oder wähle einen Vorschlag." />}</SurfaceCard>
            </> : null}

            {step === 2 ? <>
              <View><Text style={styles.recipeWizardEyebrow}>ZUBEREITUNG</Text><Text style={styles.recipeWizardTitle}>Wie wird es gemacht?</Text><Text style={styles.recipeWizardSubtitle}>{ingredients.length} Zutaten · {Math.max(1, Number(servings) || 2)} Portionen</Text></View>
              <View style={styles.inputGroup}><Text style={styles.fieldLabel}>Zubereitung</Text><TextInput autoFocus value={instructions} onChangeText={setInstructions} multiline textAlignVertical="top" placeholder="Beschreibe die Zubereitung möglichst einfach und Schritt für Schritt …" placeholderTextColor={colors.textTertiary} style={[styles.formInput, styles.recipeInstructionsInput]} /></View>
              <SurfaceCard style={styles.recipeSummaryCard}><MaterialCommunityIcons name="check-circle-outline" size={22} color={colors.accent} /><View style={styles.flex1}><Text style={styles.fieldLabel}>{title}</Text><Text style={styles.fieldHint}>Bereit zum Speichern im gemeinsamen Haushalt.</Text></View></SurfaceCard>
            </> : null}
          </ScrollView>
          <View style={styles.recipeWizardFooter}>{step > 0 ? <ActionButton label="Zurück" variant="secondary" onPress={() => setStep((current) => current - 1)} style={styles.flexButton} /> : null}<ActionButton label={step === 2 ? 'Rezept speichern' : 'Weiter'} icon={step === 2 ? 'content-save-outline' : 'arrow-right'} onPress={step === 2 ? save : next} loading={saving} style={styles.flexButton} /></View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}



function RecipeFilterSheet({ visible, filters, onClose, onApply }: { visible: boolean; filters: SearchFilters; onClose: () => void; onApply: (filters: SearchFilters) => void }) {
  const [draft, setDraft] = useState(filters);
  useEffect(() => { if (visible) setDraft(filters); }, [visible, filters]);
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}><Pressable style={styles.modalOverlay} onPress={onClose} /><View style={styles.filterSheet}><SheetDismissHandle onClose={onClose} /><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>Rezeptfilter</Text><Pressable onPress={() => { setDraft(DEFAULT_FILTERS); }}><Text style={styles.sheetDone}>Zurücksetzen</Text></Pressable></View><Text style={styles.fieldLabel}>Maximale Zeit</Text><View style={styles.timeRow}>{[null, 30, 45, 60].map((minutes) => <Pressable key={minutes ?? 'all'} onPress={() => setDraft((current) => ({ ...current, maxMinutes: minutes }))} style={[styles.filterChip, draft.maxMinutes === minutes && styles.filterChipActive]}><Text style={[styles.filterChipText, draft.maxMinutes === minutes && styles.filterChipTextActive]}>{minutes ? `${minutes} Min` : 'Alle'}</Text></Pressable>)}</View><View style={styles.switchRow}><View style={styles.flex1}><Text style={styles.fieldLabel}>Nur vegetarisch</Text><Text style={styles.fieldHint}>Zeigt nur eindeutig vegetarische Rezepte.</Text></View><Switch value={draft.vegetarianOnly} onValueChange={(value) => setDraft((current) => ({ ...current, vegetarianOnly: value }))} trackColor={{ true: colors.accentSoft }} thumbColor={draft.vegetarianOnly ? colors.accent : undefined} /></View><View style={styles.inputGroup}><Text style={styles.fieldLabel}>Zutat, die schon da ist</Text><TextInput value={draft.ingredient} onChangeText={(value) => setDraft((current) => ({ ...current, ingredient: value }))} placeholder="z. B. Kartoffeln oder Zucchini" placeholderTextColor={colors.textTertiary} style={styles.formInput} /></View><View style={styles.switchRow}><View style={styles.flex1}><Text style={styles.fieldLabel}>Nicht wieder diese Woche</Text><Text style={styles.fieldHint}>Gerichte aus dem aktuellen Wochenplan ausblenden.</Text></View><Switch value={draft.excludeThisWeek} onValueChange={(value) => setDraft((current) => ({ ...current, excludeThisWeek: value }))} trackColor={{ true: colors.accentSoft }} thumbColor={draft.excludeThisWeek ? colors.accent : undefined} /></View><ActionButton label="Filter anwenden" icon="tune-variant" onPress={() => { onApply(draft); onClose(); }} /></View></Modal>;
}

function RecipeDetail({ selection, history, onClose, onAddIngredients, onPlan, onDeleteOwn }: { selection: RecipeSelection | null; history: MealHistoryEntry[]; onClose: () => void; onAddIngredients: (selection: RecipeSelection) => void; onPlan: (selection: RecipeSelection) => void; onDeleteOwn: (recipe: OwnRecipe) => void }) {
  const swipeBack = useIosSwipeBack(onClose, Boolean(selection));
  if (!selection) return null;
  const recipe = selection.kind === 'recipe' ? selection.recipe : null; const own = selection.kind === 'own' ? selection.recipe : null; const title = recipe?.title ?? own?.title ?? '';
  const ingredients = recipe ? recipe.ingredients.map((item) => `${item.name}${item.amount ? ` · ${item.amount}` : ''}${item.unit ? ` ${item.unit}` : ''}`) : own?.ingredients ?? [];
  const last = history.find((entry) => normalizeTitle(entry.recipeTitle) === normalizeTitle(title));
  return <Modal visible animationType="fade" presentationStyle="fullScreen" statusBarTranslucent={false} onRequestClose={onClose}><SafeAreaView style={styles.fullModal} edges={['top', 'bottom']}><ScrollView {...swipeBack.panHandlers} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.recipeDetailContent}><View style={styles.detailTopbar}><IconButton icon="arrow-left" onPress={onClose} accessibilityLabel="Zurück" />{own ? <IconButton icon="trash-can-outline" tone="danger" onPress={() => onDeleteOwn(own)} accessibilityLabel="Rezept löschen" /> : <View style={styles.headerSpacer} />}</View>{recipe ? <RecipeArtwork recipe={recipe} variant="detail" /> : <View style={styles.detailPlaceholder}><MaterialCommunityIcons name="chef-hat" size={42} color={colors.accent} /></View>}<Text style={styles.detailSource}>{own ? 'UNSER REZEPT' : recipe?.sourceKind === 'web' ? `WEB · ${recipe.source || 'REZEPTQUELLE'}` : 'ONLINE-REZEPT'}</Text><Text style={styles.detailTitle}>{title}</Text><View style={styles.detailBadges}>{recipe?.minutes ? <Text style={styles.metaBadge}>{recipe.minutes} Min</Text> : null}{recipe?.vegetarian ? <Text style={styles.metaBadge}>Vegetarisch</Text> : null}{own ? <Text style={styles.metaBadge}>{own.servings} Portionen</Text> : null}{last ? <Text style={styles.metaBadge}>{lastCookedLabel(last)}</Text> : null}</View>{recipe?.description ? <Text style={styles.detailMeta}>{recipe.description}</Text> : null}{ingredients.length ? <><SectionTitle title="Zutaten" /><SurfaceCard style={styles.ingredientsCard}>{ingredients.map((ingredient, index) => <View key={`${ingredient}-${index}`} style={styles.ingredientRow}><View style={styles.ingredientDot} /><Text style={styles.ingredientText}>{ingredient}</Text></View>)}</SurfaceCard></> : recipe?.sourceKind === 'web' ? <SurfaceCard style={styles.instructionsCard}><Text style={styles.instructionsText}>Dieses Rezept stammt aus der Web-Suche. Öffne die Originalseite für Zutaten, Mengen und die vollständige Zubereitung.</Text></SurfaceCard> : null}{(own?.instructions || recipe?.instructions) ? <><SectionTitle title="Zubereitung" /><SurfaceCard style={styles.instructionsCard}><Text style={styles.instructionsText}>{own?.instructions || recipe?.instructions}</Text></SurfaceCard></> : null}{ingredients.length ? <ActionButton label="Zutaten zur Einkaufsliste" icon="cart-plus" onPress={() => onAddIngredients(selection)} /> : null}<ActionButton label="Als Abendessen einplanen" icon="calendar-plus" variant="secondary" onPress={() => onPlan(selection)} />{recipe?.url ? <ActionButton label={recipe.sourceKind === 'web' ? 'Rezept auf Website ansehen' : 'Originalquelle öffnen'} icon="open-in-new" variant={recipe.sourceKind === 'web' ? 'primary' : 'ghost'} onPress={() => Linking.openURL(recipe.url!).catch(() => undefined)} /> : null}</ScrollView></SafeAreaView></Modal>;
}

function RecipesScreen({ ownRecipes, setOwnRecipes, history, meals, onAddIngredients, onPlan, onSettings }: { ownRecipes: OwnRecipe[]; setOwnRecipes: React.Dispatch<React.SetStateAction<OwnRecipe[]>>; history: MealHistoryEntry[]; meals: Record<string, string>; onAddIngredients: (selection: RecipeSelection) => void; onPlan: (selection: RecipeSelection) => void; onSettings: () => void }) {
  const [mode, setMode] = useState<'entdecken' | 'eigene'>('entdecken'); const [query, setQuery] = useState(''); const [loading, setLoading] = useState(false); const [loadingMore, setLoadingMore] = useState(false); const [recipes, setRecipes] = useState<Recipe[]>([]); const [selected, setSelected] = useState<RecipeSelection | null>(null); const [editorOpen, setEditorOpen] = useState(false); const [filterOpen, setFilterOpen] = useState(false); const [filters, setFilters] = useState<SearchFilters>(DEFAULT_FILTERS); const [page, setPage] = useState(0); const [hasMore, setHasMore] = useState(false); const [webConfigured, setWebConfigured] = useState(true);
  const quickSearch = useMemo(() => getSeasonalQuickSearch(), []);
  const activeFilterCount = Number(Boolean(filters.maxMinutes)) + Number(filters.vegetarianOnly) + Number(Boolean(filters.ingredient.trim())) + Number(filters.excludeThisWeek);
  const makeApiFilters = (nextFilters = filters): RecipeFilters => ({ maxMinutes: nextFilters.maxMinutes, vegetarianOnly: nextFilters.vegetarianOnly, ingredient: nextFilters.ingredient, excludeTitles: nextFilters.excludeThisWeek ? Object.values(meals).filter(Boolean) : [] });
  const runSearch = async (term = query, nextFilters = filters) => { const clean = term.trim(); setQuery(clean); setLoading(true); setPage(0); try { const result = await searchRecipePage(clean, makeApiFilters(nextFilters), 0); setRecipes(result.recipes); setHasMore(result.hasMore); setWebConfigured(result.webConfigured); if (!result.recipes.length) Alert.alert('Keine Treffer', 'Mit diesen Suchbegriffen und Filtern wurden keine passenden Rezepte gefunden.'); } catch (error: any) { Alert.alert('Rezeptsuche nicht möglich', germanError(error?.message)); } finally { setLoading(false); } };
  const loadMore = async () => { if (!hasMore || loading || loadingMore) return; const nextPage = page + 1; setLoadingMore(true); try { const result = await searchRecipePage(query, makeApiFilters(), nextPage); setRecipes((current) => { const seen = new Set(current.map((recipe) => recipe.url || recipe.id)); return [...current, ...result.recipes.filter((recipe) => !seen.has(recipe.url || recipe.id))]; }); setPage(nextPage); setHasMore(result.hasMore); setWebConfigured(result.webConfigured); } catch (error: any) { Alert.alert('Weitere Rezepte konnten nicht geladen werden', germanError(error?.message)); setHasMore(false); } finally { setLoadingMore(false); } };
  useEffect(() => { searchRecipePage('', { excludeTitles: Object.values(meals).filter(Boolean) }, 0).then((result) => { setRecipes(result.recipes); setHasMore(result.hasMore); setWebConfigured(result.webConfigured); }).catch(() => undefined); }, []);
  const removeOwn = async (recipe: OwnRecipe) => { Alert.alert('Rezept löschen?', `„${recipe.title}“ wird für den ganzen Haushalt gelöscht.`, [{ text: 'Abbrechen', style: 'cancel' }, { text: 'Löschen', style: 'destructive', onPress: async () => { setSelected(null); setOwnRecipes((current) => current.filter((item) => item.id !== recipe.id)); try { await deleteOwnRecipe(recipe.id); } catch (error: any) { Alert.alert('Löschen nicht möglich', germanError(error?.message)); } } }]); };
  return <><ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.screenContent} onScroll={({ nativeEvent }) => { const nearBottom = nativeEvent.layoutMeasurement.height + nativeEvent.contentOffset.y >= nativeEvent.contentSize.height - 320; if (nearBottom) loadMore(); }} scrollEventThrottle={300}><ScreenHeader title="Rezepte" subtitle="Beliebte Rezepte aus dem Internet entdecken, durchsuchen und direkt einplanen." action={<IconButton icon="account-circle-outline" onPress={onSettings} accessibilityLabel="Konto und Einstellungen" />} /><View style={styles.recipeSegments}><Pressable onPress={() => setMode('entdecken')} style={[styles.recipeSegment, mode === 'entdecken' && styles.recipeSegmentActive]}><Text style={[styles.recipeSegmentText, mode === 'entdecken' && styles.recipeSegmentTextActive]}>Entdecken</Text></Pressable><Pressable onPress={() => setMode('eigene')} style={[styles.recipeSegment, mode === 'eigene' && styles.recipeSegmentActive]}><Text style={[styles.recipeSegmentText, mode === 'eigene' && styles.recipeSegmentTextActive]}>Unsere Rezepte</Text></Pressable></View>{mode === 'entdecken' ? <><View style={styles.searchRow}><View style={styles.searchShell}><MaterialCommunityIcons name="magnify" size={22} color={colors.textTertiary} /><TextInput value={query} onChangeText={setQuery} onSubmitEditing={() => runSearch()} returnKeyType="search" placeholder="Gericht oder Zutat suchen …" placeholderTextColor={colors.textTertiary} style={styles.searchInput} />{query ? <Pressable onPress={() => setQuery('')}><MaterialCommunityIcons name="close-circle" size={19} color={colors.textTertiary} /></Pressable> : null}</View><Pressable onPress={() => setFilterOpen(true)} style={styles.filterButton}><MaterialCommunityIcons name="tune-variant" size={22} color={colors.accent} />{activeFilterCount ? <View style={styles.filterBadge}><Text style={styles.filterBadgeText}>{activeFilterCount}</Text></View> : null}</Pressable></View><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>{quickSearch.map((term) => <Pressable key={term} onPress={() => runSearch(term)} style={styles.chip}><Text style={styles.chipText}>{term}</Text></Pressable>)}</ScrollView>{loading ? <View style={styles.loadingBox}><ActivityIndicator color={colors.accent} /><Text style={styles.loadingText}>Passende Rezepte werden gesucht …</Text></View> : null}<View style={styles.sourceHint}><MaterialCommunityIcons name="web" size={18} color={colors.accent} /><Text style={styles.sourceHintText}>{webConfigured ? 'Beliebte Web-Rezepte mit Originalbildern · beim Scrollen werden weitere Treffer geladen' : 'Web-Rezeptsuche ist noch nicht aktiviert · Online-Fallback bleibt verfügbar'}</Text></View><View style={styles.recipeGrid}>{!loading && recipes.map((recipe) => { const last = history.find((entry) => normalizeTitle(entry.recipeTitle) === normalizeTitle(recipe.title)); return <Pressable key={recipe.id} onPress={() => setSelected({ kind: 'recipe', recipe })} style={({ pressed }) => [styles.recipeCard, { opacity: pressed ? 0.8 : 1 }]}><RecipeArtwork recipe={recipe} variant="card" /><View style={styles.recipeCardBody}><Text style={styles.recipeSource}>{recipe.sourceKind === 'web' ? (recipe.source || 'WEB') : 'ONLINE'}</Text><Text style={styles.recipeCardTitle} numberOfLines={2}>{recipe.title}</Text><Text style={styles.recipeCardMeta} numberOfLines={3}>{recipe.sourceKind === 'web' ? (recipe.description || 'Web-Rezept öffnen und ansehen') : ([recipe.minutes ? `${recipe.minutes} Min` : null, recipe.vegetarian ? 'Vegetarisch' : null, last ? lastCookedLabel(last) : null].filter(Boolean).join(' · ') || `${recipe.ingredients.length} Zutaten`)}</Text></View></Pressable>; })}</View>{loadingMore ? <View style={styles.loadingBox}><ActivityIndicator color={colors.accent} /><Text style={styles.loadingText}>Weitere Rezepte werden geladen …</Text></View> : null}{!loading && !loadingMore && hasMore ? <Text style={styles.loadingText}>Weiter scrollen für mehr Treffer</Text> : null}{!loading && !recipes.length ? <SurfaceCard><EmptyState icon="chef-hat" title="Keine Rezepte gefunden" text="Passe Suchbegriff oder Filter an." /></SurfaceCard> : null}</> : <><ActionButton label="Unser Rezept anlegen" icon="plus" onPress={() => setEditorOpen(true)} />{ownRecipes.length === 0 ? <SurfaceCard><EmptyState icon="book-open-page-variant-outline" title="Noch keine gemeinsamen Rezepte" text="Speichert Familienrezepte und Lieblingsgerichte für den ganzen Haushalt." actionLabel="Erstes Rezept anlegen" onAction={() => setEditorOpen(true)} /></SurfaceCard> : <View style={styles.ownRecipeList}>{ownRecipes.map((recipe) => <Pressable key={recipe.id} onPress={() => setSelected({ kind: 'own', recipe })} style={({ pressed }) => [styles.ownRecipeRow, { opacity: pressed ? 0.75 : 1 }]}><View style={styles.ownRecipeIcon}><MaterialCommunityIcons name="book-open-page-variant-outline" size={22} color={colors.accent} /></View><View style={styles.flex1}><Text style={styles.ownRecipeTitle}>{recipe.title}</Text><Text style={styles.ownRecipeMeta}>{recipe.ingredients.length} Zutaten · {recipe.servings} Portionen</Text></View><MaterialCommunityIcons name="chevron-right" size={24} color={colors.textTertiary} /></Pressable>)}</View>}</>}</ScrollView><RecipeFilterSheet visible={filterOpen} filters={filters} onClose={() => setFilterOpen(false)} onApply={(next) => { setFilters(next); runSearch(query, next); }} /><OwnRecipeEditor visible={editorOpen} onClose={() => setEditorOpen(false)} onSaved={(recipe) => setOwnRecipes((current) => [recipe, ...current])} /><RecipeDetail selection={selected} history={history} onClose={() => setSelected(null)} onAddIngredients={(selection) => { onAddIngredients(selection); setSelected(null); }} onPlan={(selection) => { onPlan(selection); setSelected(null); }} onDeleteOwn={removeOwn} /></>;
}

function DayPicker({ selection, onClose, onSelect }: { selection: RecipeSelection | null; onClose: () => void; onSelect: (plannedDate: string) => void }) {
  const title = selection?.recipe.title ?? '';
  const weekDays = getWeekDays(1);
  return <Modal transparent visible={Boolean(selection)} animationType="fade" presentationStyle="overFullScreen" onRequestClose={onClose}><Pressable style={styles.modalOverlay} onPress={onClose} /><View style={styles.dayPickerSheet}><SheetDismissHandle onClose={onClose} /><Text style={styles.editorEyebrow}>NÄCHSTE WOCHE EINPLANEN</Text><Text style={styles.dayPickerTitle}>{title}</Text><View style={styles.dayPickerGrid}>{weekDays.map((entry) => <Pressable key={entry.iso} onPress={() => onSelect(entry.iso)} style={styles.dayPickerButton}><View><Text style={styles.dayPickerButtonText}>{entry.day}</Text><Text style={styles.dayPickerDate}>{entry.date.toLocaleDateString('de-AT', { day: '2-digit', month: 'long' })}</Text></View><MaterialCommunityIcons name="chevron-right" size={21} color={colors.textTertiary} /></Pressable>)}</View></View></Modal>;
}

function TabBar({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const tabs: { key: Tab; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; active: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }[] = [
    { key: 'heute', label: 'Heute', icon: 'home-variant-outline', active: 'home-variant' },
    { key: 'woche', label: 'Woche', icon: 'calendar-week-outline', active: 'calendar-week' },
    { key: 'einkauf', label: 'Einkauf', icon: 'cart-outline', active: 'cart' },
    { key: 'vorrat', label: 'Vorrat', icon: 'archive-outline', active: 'archive' },
  ];
  return <View style={styles.tabBar}>{tabs.map((item) => { const active = tab === item.key; return <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => onChange(item.key)} style={styles.tabItem}><MaterialCommunityIcons name={active ? item.active : item.icon} size={23} color={active ? colors.accent : colors.textTertiary} /><Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{item.label}</Text></Pressable>; })}</View>;
}

function MainApp() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('heute');
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [meals, setMeals] = useState<Record<string, string>>({});
  const [saskiaMeals, setSaskiaMeals] = useState<Record<string, string>>({});
  const [ownRecipes, setOwnRecipes] = useState<OwnRecipe[]>([]);
  const [history, setHistory] = useState<MealHistoryEntry[]>([]);
  const [pantryItems, setPantryItems] = useState<PantryItem[]>([]);
  const [household, setHousehold] = useState<Household | null>(null);
  const [invitations, setInvitations] = useState<HouseholdInvitation[]>([]);
  const [ready, setReady] = useState(false);
  const [startupProgress, setStartupProgress] = useState(0);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [householdOpen, setHouseholdOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [recipeToPlan, setRecipeToPlan] = useState<RecipeSelection | null>(null);
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [darkMode, setDarkMode] = useState(false);
  const loadGeneration = useRef(0);

  const applyAppearance = (mode: ThemeMode, cozy = preferences.cozyMode) => {
    const nextDark = mode === 'dark' || (mode === 'system' && Appearance.getColorScheme() === 'dark');
    setThemePalette(nextDark ? 'dark' : 'light', cozy);
    refreshAppStyles();
    setDarkMode(nextDark);
  };

  const updatePreferences = (next: AppPreferences) => {
    setPreferences(next);
    applyAppearance(next.themeMode, next.cozyMode);
    savePreferences(next).catch(() => undefined);
  };

  const loadSecondaryData = async (generation: number) => {
    const [recipesResult, historyResult, invitesResult, userResult] = await Promise.allSettled([
      withTimeout(loadOwnRecipes(), 8000, 'Rezepte'),
      withTimeout(loadMealHistory(), 8000, 'Verlauf'),
      withTimeout(loadPendingHouseholdInvitations(), 8000, 'Einladungen'),
      withTimeout(supabase.auth.getUser(), 8000, 'Benutzerprofil'),
    ]);
    if (generation !== loadGeneration.current) return;
    if (recipesResult.status === 'fulfilled') setOwnRecipes(recipesResult.value);
    if (historyResult.status === 'fulfilled') setHistory(historyResult.value);
    if (invitesResult.status === 'fulfilled') setInvitations(invitesResult.value);
    if (userResult.status === 'fulfilled') setEmail(userResult.value.data.user?.email ?? '');
  };

  const reloadAll = async (startup = false) => {
    const startedAt = Date.now();
    const generation = ++loadGeneration.current;
    if (startup) {
      setStartupError(null);
      setReady(false);
      setStartupProgress(0);
    }
    clearHouseholdCache();
    if (startup) setStartupProgress(10);

    const nextHousehold = await withTimeout(loadHousehold(), 10000, 'Haushalt');
    if (generation !== loadGeneration.current) return;
    setHousehold(nextHousehold);
    if (startup) setStartupProgress(32);

    const [shoppingResult, planResult, pantryResult] = await Promise.allSettled([
      withTimeout(loadShopping(), 9000, 'Einkaufsliste'),
      withTimeout(loadMealPlan(), 9000, 'Wochenplan'),
      withTimeout(loadPantry(), 9000, 'Vorrat'),
    ]);
    if (generation !== loadGeneration.current) return;

    if (shoppingResult.status === 'fulfilled') setItems(shoppingResult.value);
    if (planResult.status === 'fulfilled') {
      const plan = planResult.value;
      setMeals(Object.fromEntries(plan.map((entry) => [entry.plannedDate, entry.meal ?? ''])));
      setSaskiaMeals(Object.fromEntries(plan.map((entry) => [entry.plannedDate, entry.mealSaskia ?? ''])));
    }
    if (pantryResult.status === 'fulfilled') {
      setPantryItems(pantryResult.value);
      syncExpiryNotifications(pantryResult.value).catch(() => undefined);
    }

    if (startup) {
      setStartupProgress(78);
      const minimumVisible = 650 - (Date.now() - startedAt);
      if (minimumVisible > 0) await new Promise((resolve) => setTimeout(resolve, minimumVisible));
      if (generation !== loadGeneration.current) return;
      setStartupProgress(100);
      setReady(true);
      void loadSecondaryData(generation);

      const failedCore = [shoppingResult, planResult, pantryResult].filter((result) => result.status === 'rejected').length;
      if (failedCore > 0) {
        setTimeout(() => Alert.alert('Teilweise geladen', 'MealFlow ist gestartet. Einige Daten konnten noch nicht geladen werden und werden beim nächsten Aktualisieren erneut versucht.'), 250);
      }
      return;
    }

    await loadSecondaryData(generation);
    if (generation !== loadGeneration.current) return;
    setReady(true);
  };

  const startApplication = () => {
    setStartupError(null);
    setStartupProgress(0);
    void reloadAll(true).catch((error: any) => {
      if (loadGeneration.current < 1) return;
      setStartupProgress(100);
      setReady(false);
      setStartupError(germanError(error?.message));
    });
  };

  useEffect(() => {
    loadPreferences().then((loaded) => { setPreferences(loaded); setTab(loaded.startTab); applyAppearance(loaded.themeMode, loaded.cozyMode); }).catch(() => undefined);
    startApplication();
  }, []);

  useEffect(() => {
    if (!ready || Platform.OS !== 'android') return;
    const timer = setTimeout(() => { checkAndPromptAndroidUpdate(false).catch(() => undefined); }, 1400);
    return () => clearTimeout(timer);
  }, [ready]);

  useEffect(() => {
    if (preferences.themeMode !== 'system') return;
    const subscription = Appearance.addChangeListener(({ colorScheme }) => {
      setThemePalette(colorScheme === 'dark' ? 'dark' : 'light', preferences.cozyMode);
      refreshAppStyles();
      setDarkMode(colorScheme === 'dark');
    });
    return () => subscription.remove();
  }, [preferences.themeMode, preferences.cozyMode]);

  useEffect(() => {
    if (!household?.id) return;
    const filter = `household_id=eq.${household.id}`;
    const channel = supabase.channel(`mealflow-household-${household.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items', filter }, () => loadShopping().then(setItems).catch(() => undefined))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pantry_items', filter }, () => loadPantry().then((next) => { setPantryItems(next); syncExpiryNotifications(next).catch(() => undefined); }).catch(() => undefined))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_plan_entries', filter }, () => loadMealPlan().then((plan) => { setMeals(Object.fromEntries(plan.map((entry) => [entry.plannedDate, entry.meal ?? '']))); setSaskiaMeals(Object.fromEntries(plan.map((entry) => [entry.plannedDate, entry.mealSaskia ?? '']))); }).catch(() => undefined))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'custom_recipes', filter }, () => loadOwnRecipes().then(setOwnRecipes).catch(() => undefined))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_history', filter }, () => loadMealHistory().then(setHistory).catch(() => undefined))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'household_members', filter }, () => loadHousehold().then(setHousehold).catch(() => undefined))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [household?.id]);

  const changeTab = (next: Tab) => {
    setTab(next);
    if (preferences.hapticsEnabled) Haptics.selectionAsync().catch(() => undefined);
  };

  const addRecipeIngredients = (selection: RecipeSelection) => {
    const rawIngredients = selection.kind === 'recipe'
      ? selection.recipe.ingredients.map((ingredient) => ({ name: ingredient.name, amount: ingredient.amount ?? 1, unit: UNITS.includes(ingredient.unit ?? '') ? ingredient.unit! : 'Stk.' }))
      : selection.recipe.ingredients.map((ingredient) => ({ name: ingredient, amount: 1, unit: 'Stk.' }));
    const temporary: ShoppingItem[] = rawIngredients.slice(0, 30).map((ingredient, index) => ({ id: `recipe-${Date.now()}-${index}`, done: false, addedByName: household?.myDisplayName, ...ingredient }));
    setItems((current) => [...temporary, ...current]);
    temporary.forEach((item) => addShoppingItem({ name: item.name, amount: item.amount, unit: item.unit }).catch(() => undefined));
    changeTab('einkauf');
    if (preferences.hapticsEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  };

  const planRecipe = async (plannedDate: string) => {
    if (!recipeToPlan) return;
    const title = recipeToPlan.recipe.title;
    setMeals((current) => ({ ...current, [plannedDate]: title }));
    setRecipeToPlan(null);
    changeTab('woche');
    try { await saveMeal(plannedDate, title); }
    catch (error: any) { Alert.alert('Planung nicht gespeichert', germanError(error?.message)); }
  };

  const markCooked = async (title: string) => {
    try {
      await recordCookedMeal(title);
      setHistory(await loadMealHistory());
      if (preferences.hapticsEnabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (error: any) {
      Alert.alert('Kochverlauf', germanError(error?.message));
    }
  };

  if (startupError && !household) return <StartupErrorScreen message={startupError} onRetry={startApplication} />;
  if (!ready || !household) return <LoadingScreen message="Deine Daten werden sicher geladen …" progress={startupProgress} />;

  return (
    <View style={[styles.appRoot, { paddingTop: insets.top }]}>
      <StatusBar style={darkMode ? 'light' : 'dark'} />
      <View style={styles.screenArea}>
        {tab === 'heute' ? <HomeScreen household={household} meals={meals} items={items} history={history} pantryItems={pantryItems} onNavigate={changeTab} onSettings={() => setSettingsOpen(true)} onCooked={markCooked} /> : null}
        {tab === 'woche' ? <PlanScreen household={household} meals={meals} saskiaMeals={saskiaMeals} setMeals={setMeals} setSaskiaMeals={setSaskiaMeals} onSettings={() => setSettingsOpen(true)} /> : null}
        {tab === 'einkauf' ? <ShoppingScreen household={household} items={items} setItems={setItems} preferences={preferences} onSettings={() => setSettingsOpen(true)} /> : null}
        {tab === 'vorrat' ? <InventoryScreen onSettings={() => setSettingsOpen(true)} hapticsEnabled={preferences.hapticsEnabled} /> : null}
      </View>
      <View style={{ paddingBottom: Math.max(insets.bottom, 8), backgroundColor: colors.surface }}><TabBar tab={tab} onChange={changeTab} /></View>
      <SettingsSheet visible={settingsOpen} email={email} household={household} pendingInvites={invitations.length} preferences={preferences} darkMode={darkMode} onPreferencesChange={updatePreferences} onClose={() => setSettingsOpen(false)} onHousehold={() => { setSettingsOpen(false); setHouseholdOpen(true); }} />
      <HouseholdSheet visible={householdOpen} household={household} invitations={invitations} onClose={() => setHouseholdOpen(false)} onChanged={reloadAll} />
      <DayPicker selection={recipeToPlan} onClose={() => setRecipeToPlan(null)} onSelect={planRecipe} />
    </View>
  );
}



function Root() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    let active = true;
    if (!isCloudConfigured) { setChecking(false); return; }
    withTimeout(supabase.auth.getSession(), 7000, 'Anmeldung').then(({ data }) => {
      if (!active) return;
      setAuthenticated(Boolean(data.session));
      setChecking(false);
    }).catch(() => {
      if (!active) return;
      setAuthenticated(false);
      setChecking(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) clearHouseholdCache();
      setAuthenticated(Boolean(session));
      setChecking(false);
    });
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  if (checking) return <LoadingScreen message="Anmeldung wird geprüft …" progress={8} />;
  if (!isCloudConfigured) return <View style={styles.loadingScreen}><Text style={styles.configurationTitle}>Cloud-Verbindung fehlt</Text><Text style={styles.configurationText}>MealFlow benötigt die Supabase-Konfiguration, damit dein Haushalt sicher synchronisiert werden kann.</Text></View>;
  return authenticated ? <MainApp /> : <AuthScreen />;
}

export default function App() { return <SafeAreaProvider><Root /></SafeAreaProvider>; }

function createStyles() {
  return StyleSheet.create({
  appRoot: { flex: 1, backgroundColor: colors.background }, screenArea: { flex: 1 }, screenContent: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 30, gap: 18 }, flex1: { flex: 1 }, flexButton: { flex: 1 }, modalFlex: { flex: 1, justifyContent: 'flex-end' }, fullModal: { flex: 1, backgroundColor: colors.background }, headerSpacer: { width: 44, height: 44 },
  authRoot: { flex: 1, backgroundColor: colors.background }, authContent: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12 }, brandMark: { width: 58, height: 58, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', ...getShadow() }, authBrand: { ...typography.title, color: colors.accent, marginTop: 6 }, authHero: { ...typography.hero, color: colors.text, maxWidth: 380 }, authSubtitle: { ...typography.body, color: colors.textSecondary, maxWidth: 370, marginBottom: 12 }, authCard: { padding: 18, gap: 16 }, segmentedControl: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: 4 }, segmentButton: { flex: 1, minHeight: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' }, segmentButtonActive: { backgroundColor: colors.surface, ...getShadow() }, segmentText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' }, segmentTextActive: { color: colors.text }, inputGroup: { gap: 7 }, inputLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' }, inputShell: { minHeight: 52, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.background, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.md }, textInput: { flex: 1, ...typography.body, color: colors.text, paddingVertical: 12 }, authHint: { ...typography.caption, color: colors.textTertiary, textAlign: 'center' },
  homeExpiryCard: { paddingHorizontal: 14, overflow: 'hidden' }, homeExpiryRow: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, homeExpiryName: { ...typography.caption, color: colors.text, fontWeight: '800', flex: 1 }, homeExpiryStatus: { fontSize: 11, lineHeight: 14, color: colors.accent, fontWeight: '800' }, homeExpiryStatusDanger: { color: colors.danger },
  heroCard: { padding: 20, gap: 10 }, heroIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, heroLabel: { ...typography.label, color: colors.accent, marginTop: 4 }, heroMeal: { ...typography.h2, color: colors.text }, heroMeta: { ...typography.body, color: colors.textSecondary, marginBottom: 4 }, heroActions: { flexDirection: 'row', gap: 10 }, metricsRow: { flexDirection: 'row', gap: 12 }, metricCard: { flex: 1, padding: 16, gap: 7 }, metricNumber: { fontSize: 26, lineHeight: 31, fontWeight: '800', color: colors.text }, metricLabel: { ...typography.caption, color: colors.textSecondary }, quickGrid: { gap: 10 }, quickAction: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.lg, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, ...getShadow() }, quickIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, quickTitle: { ...typography.bodyStrong, color: colors.text, minWidth: 95 }, quickText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  weekOverviewCard: { padding: 18, gap: 14 }, weekOverviewTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }, weekOverviewLabel: { ...typography.label, color: colors.accent }, weekOverviewTitle: { ...typography.title, color: colors.text, marginTop: 3 }, weekOverviewBadge: { minHeight: 38, paddingHorizontal: 11, borderRadius: radius.pill, backgroundColor: colors.accentSoft, flexDirection: 'row', alignItems: 'center', gap: 6 }, weekOverviewBadgeText: { ...typography.caption, color: colors.accent, fontWeight: '800' }, weekProgressTrack: { height: 8, borderRadius: 5, backgroundColor: colors.surfaceMuted, overflow: 'hidden' }, weekProgressFill: { height: '100%', borderRadius: 5, backgroundColor: colors.accent }, weekStrip: { flexDirection: 'row', gap: 5 }, weekStripDay: { flex: 1, minHeight: 68, borderRadius: 15, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', gap: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: 'transparent' }, weekStripDayToday: { backgroundColor: colors.accentSoft, borderColor: '#AFC8B6' }, weekStripDow: { fontSize: 10, lineHeight: 12, fontWeight: '800', color: colors.textTertiary }, weekStripDowToday: { color: colors.accent }, weekStripDate: { fontSize: 17, lineHeight: 20, fontWeight: '800', color: colors.text }, weekStripDateToday: { color: colors.accent }, weekStripDot: { width: 6, height: 6, borderRadius: 3 }, weekStripDotPlanned: { backgroundColor: colors.accent }, weekStripDotOpen: { backgroundColor: colors.border }, weekStripDots: { flexDirection: 'row', gap: 3 }, weekStripDotSaskia: { backgroundColor: colors.accent, borderWidth: 1, borderColor: colors.surface }, weekSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2 }, weekSectionTitle: { ...typography.title, color: colors.text }, weekSectionHint: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  dayList: { gap: 12 }, dayCard: { minHeight: 174, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.lg, ...getShadow() }, dayCardToday: { borderColor: '#AFC8B6', backgroundColor: colors.surface }, dayDateBlock: { width: 58, height: 76, borderRadius: 18, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }, dayDateBlockToday: { backgroundColor: colors.accent }, dayDateDow: { fontSize: 10, lineHeight: 12, fontWeight: '800', color: colors.textTertiary }, dayDateDowToday: { color: '#DCEADF' }, dayDateNumber: { fontSize: 24, lineHeight: 28, fontWeight: '800', color: colors.text }, dayDateNumberToday: { color: '#FFFFFF' }, dayDateMonth: { fontSize: 10, lineHeight: 12, fontWeight: '700', color: colors.textTertiary, textTransform: 'uppercase' }, dayDateMonthToday: { color: '#DCEADF' }, dayCardContent: { flex: 1, gap: 5 }, dayTitleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }, dayName: { ...typography.caption, color: colors.textSecondary, fontWeight: '800' }, todayPill: { ...typography.caption, color: colors.accent, backgroundColor: colors.accentSoft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, overflow: 'hidden', fontWeight: '800' }, dayStatusPill: { fontSize: 10, lineHeight: 12, fontWeight: '800', paddingHorizontal: 7, paddingVertical: 3, borderRadius: radius.pill, overflow: 'hidden' }, dayStatusPlanned: { color: colors.accent, backgroundColor: colors.accentSoft }, dayStatusOpen: { color: colors.textTertiary, backgroundColor: colors.surfaceMuted }, dayMeal: { fontSize: 19, lineHeight: 24, fontWeight: '800', color: colors.text }, dayMealEmpty: { color: colors.textTertiary, fontWeight: '700' }, dayMeta: { ...typography.caption, color: colors.textSecondary }, dayAction: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }, dayActionPlanned: { backgroundColor: colors.accentSoft }, dayMealSlots: { gap: 7 }, dayMealSlot: { minHeight: 58, borderRadius: 13, paddingHorizontal: 11, paddingVertical: 8, backgroundColor: colors.surfaceMuted, gap: 3 }, dayMealSlotSaskia: { backgroundColor: colors.accentSoft, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, dayMealSlotHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, dayMealSlotLabel: { fontSize: 9, lineHeight: 11, fontWeight: '900', letterSpacing: 0.7, color: colors.textTertiary }, dayMealSlotLabelSaskia: { fontSize: 9, lineHeight: 11, fontWeight: '900', letterSpacing: 0.7, color: colors.accent }, saskiaLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 }, dayMealSlotValue: { fontSize: 15, lineHeight: 19, fontWeight: '800', color: colors.text }, dayMealSlotEmpty: { color: colors.textTertiary, fontWeight: '700' },
  modalOverlay: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay }, bottomSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 18, paddingBottom: 26, position: 'absolute', left: 0, right: 0, bottom: 0 }, settingsSheet: { backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 18, paddingBottom: 30, position: 'absolute', left: 0, right: 0, bottom: 0, gap: 12 }, editorSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 18, paddingBottom: 30, gap: 12 }, dayPickerSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 18, paddingBottom: 30, position: 'absolute', left: 0, right: 0, bottom: 0, gap: 12 }, filterSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 18, paddingBottom: 30, position: 'absolute', left: 0, right: 0, bottom: 0, gap: 16 }, sheetDismissZone: { minHeight: 28, alignItems: 'center', justifyContent: 'center', marginTop: 1 }, sheetHandle: { width: 38, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center' }, sheetHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }, sheetCancel: { ...typography.body, color: colors.textSecondary }, sheetTitle: { ...typography.title, color: colors.text }, sheetDone: { ...typography.bodyStrong, color: colors.accent }, pickerRow: { flexDirection: 'row', minHeight: 210 }, picker: { flex: 1 }, pickerItem: { color: colors.text, fontSize: 19 },
  settingsCard: { padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 }, settingsIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, settingsLabel: { ...typography.caption, color: colors.textSecondary }, settingsValue: { ...typography.bodyStrong, color: colors.text, marginTop: 2 }, settingsMeta: { ...typography.caption, color: colors.textTertiary, marginTop: 4 }, editorEyebrow: { ...typography.label, color: colors.accent }, editorTitle: { ...typography.h2, color: colors.text, marginBottom: 2 }, fieldLabel: { ...typography.bodyStrong, color: colors.text }, fieldHint: { ...typography.caption, color: colors.textSecondary }, largeInput: { minHeight: 54, borderRadius: radius.md, backgroundColor: colors.background, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 14, ...typography.body, color: colors.text },
  householdHero: { padding: 18, flexDirection: 'row', gap: 14, alignItems: 'center' }, householdIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, householdHeroLabel: { ...typography.label, color: colors.accent }, householdHeroTitle: { ...typography.h2, color: colors.text, marginTop: 2 }, householdHeroMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 4 }, memberRow: { minHeight: 66, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, avatar: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, avatarText: { ...typography.bodyStrong, color: colors.accent }, memberName: { ...typography.bodyStrong, color: colors.text }, memberMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 }, memberPermissionBlock: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, memberInvitePermissionRow: { minHeight: 68, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surfaceMuted }, inviteCodeCard: { padding: 18, gap: 10 }, inviteCode: { fontSize: 30, letterSpacing: 4, fontWeight: '800', color: colors.text }, inviteCard: { padding: 14, flexDirection: 'row', gap: 10, alignItems: 'center' }, smallAction: { minWidth: 102 }, settingsBlock: { padding: 16, gap: 13 }, codeInput: { letterSpacing: 2, fontWeight: '700' },
  addCard: { padding: 15, gap: 10 }, productInput: { minHeight: 52, backgroundColor: colors.background, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, ...typography.body, color: colors.text }, addRow: { flexDirection: 'row', gap: 10 }, amountButton: { flex: 1, minHeight: 52, paddingHorizontal: 13, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, miniLabel: { ...typography.label, color: colors.textTertiary }, amountText: { ...typography.bodyStrong, color: colors.text }, addButton: { flex: 1 }, listCard: { overflow: 'hidden' }, shoppingRow: { minHeight: 70, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border }, checkbox: { width: 28, height: 28, borderRadius: 10, borderWidth: 1.5, borderColor: '#A7AFA5', alignItems: 'center', justifyContent: 'center' }, checkboxDone: { backgroundColor: colors.accent, borderColor: colors.accent }, shoppingName: { ...typography.bodyStrong, color: colors.text }, shoppingNameDone: { color: colors.textTertiary, textDecorationLine: 'line-through' }, shoppingMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  recipeSegments: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, padding: 4, borderRadius: radius.md }, recipeSegment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 }, recipeSegmentActive: { backgroundColor: colors.surface, ...getShadow() }, recipeSegmentText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' }, recipeSegmentTextActive: { color: colors.text }, searchRow: { flexDirection: 'row', gap: 9 }, searchShell: { flex: 1, minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border }, searchInput: { flex: 1, ...typography.body, color: colors.text }, filterButton: { width: 54, height: 54, borderRadius: radius.md, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, filterBadge: { position: 'absolute', right: 5, top: 5, minWidth: 17, height: 17, borderRadius: 9, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 }, filterBadgeText: { fontSize: 10, color: '#FFFFFF', fontWeight: '800' }, chipsRow: { gap: 8, paddingRight: 12 }, chip: { paddingHorizontal: 13, paddingVertical: 9, backgroundColor: colors.accentSoft, borderRadius: radius.pill }, chipText: { ...typography.caption, color: colors.accent, fontWeight: '700' }, sourceHint: { flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 4 }, sourceHintText: { ...typography.caption, color: colors.textSecondary, flex: 1 }, loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24, gap: 10 }, loadingText: { ...typography.caption, color: colors.textSecondary }, recipeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 }, recipeCard: { width: '48.5%', backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...getShadow() }, recipeImage: { width: '100%', height: 130, backgroundColor: colors.surfaceMuted }, recipeImagePlaceholder: { width: '100%', height: 130, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, recipeCardBody: { padding: 12, gap: 4 }, recipeSource: { ...typography.label, color: colors.accent }, recipeCardTitle: { ...typography.bodyStrong, color: colors.text }, recipeCardMeta: { ...typography.caption, color: colors.textSecondary }, ownRecipeList: { gap: 9 }, ownRecipeRow: { minHeight: 72, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.lg }, ownRecipeIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, ownRecipeTitle: { ...typography.bodyStrong, color: colors.text }, ownRecipeMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  timeRow: { flexDirection: 'row', gap: 8 }, filterChip: { flex: 1, minHeight: 42, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' }, filterChipActive: { backgroundColor: colors.accent }, filterChipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' }, filterChipTextActive: { color: '#FFFFFF' }, switchRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12 },
  fullModalHeader: { paddingHorizontal: 18, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, fullModalTitle: { ...typography.title, color: colors.text }, formContent: { padding: 18, paddingBottom: 40, gap: 18 }, formInput: { minHeight: 52, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, ...typography.body, color: colors.text }, multilineInput: { minHeight: 130 }, servingsInput: { maxWidth: 110 }, recipeDetailContent: { minHeight: '100%', backgroundColor: colors.background, padding: 18, paddingBottom: 44, gap: 16 }, detailTopbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, detailImage: { width: '100%', height: 250, borderRadius: radius.xl, backgroundColor: colors.surfaceMuted }, detailPlaceholder: { width: '100%', height: 190, borderRadius: radius.xl, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' }, detailSource: { ...typography.label, color: colors.accent }, detailTitle: { ...typography.h1, color: colors.text }, detailMeta: { ...typography.body, color: colors.textSecondary }, detailBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 }, metaBadge: { ...typography.caption, color: colors.accent, backgroundColor: colors.accentSoft, paddingHorizontal: 9, paddingVertical: 5, borderRadius: radius.pill, overflow: 'hidden' }, ingredientsCard: { padding: 15, gap: 12 }, ingredientRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 }, ingredientDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent, marginTop: 8 }, ingredientText: { ...typography.body, color: colors.text, flex: 1 }, instructionsCard: { padding: 16 }, instructionsText: { ...typography.body, color: colors.textSecondary }, dayPickerTitle: { ...typography.h2, color: colors.text, marginBottom: 4 }, dayPickerGrid: { gap: 8 }, dayPickerButton: { minHeight: 58, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, justifyContent: 'space-between', alignItems: 'center', flexDirection: 'row', paddingHorizontal: 15 }, dayPickerButtonText: { ...typography.bodyStrong, color: colors.text }, dayPickerDate: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  tabBar: { height: 64, flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingHorizontal: 6 }, tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 }, tabLabel: { fontSize: 11, lineHeight: 14, fontWeight: '600', color: colors.textTertiary }, tabLabelActive: { color: colors.accent }, loadingScreen: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34, gap: 10 }, loadingLogo: { width: 68, height: 68, borderRadius: 23, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', marginBottom: 5 }, loadingBrand: { ...typography.h2, color: colors.text }, loadingMessage: { ...typography.body, color: colors.textSecondary, textAlign: 'center' }, loadingProgress: { width: 156, height: 5, borderRadius: 3, overflow: 'hidden', backgroundColor: colors.surfaceMuted, marginTop: 8 }, loadingProgressFill: { height: '100%', borderRadius: 3, backgroundColor: colors.accent }, loadingPercent: { ...typography.caption, color: colors.accent, fontWeight: '800', minWidth: 38, textAlign: 'center' }, loadingHint: { ...typography.caption, color: colors.textTertiary, marginTop: 2 },

  settingsSheetV214: { backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 18, paddingBottom: 18, position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '90%', gap: 10, overflow: 'hidden' },
  settingsScrollContent: { gap: 12, paddingBottom: 18 },
  settingsSectionTitle: { ...typography.label, color: colors.textTertiary, marginTop: 8 },
  themeSegmentRow: { flexDirection: 'row', gap: 8 },
  themeSegment: { flex: 1, minHeight: 58, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  themeSegmentActive: { backgroundColor: colors.accentSoft, borderColor: colors.accent },
  themeSegmentText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  themeSegmentTextActive: { color: colors.accent },
  preferenceRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 }, cozyTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  preferenceDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  startTabRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  startTabChip: { minHeight: 38, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  startTabChipActive: { backgroundColor: colors.accent },
  startTabChipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  startTabChipTextActive: { color: '#FFFFFF' },

  shoppingScreenContent: { paddingBottom: 112 },
  shoppingToolbar: { minHeight: 68, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  shoppingFab: { position: 'absolute', right: 18, bottom: 18, width: 58, height: 58, borderRadius: 29, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', ...getShadow() },
  shoppingFabPressed: { opacity: 0.84, transform: [{ scale: 0.96 }] },
  shoppingToolbarLabel: { ...typography.label, color: colors.textTertiary },
  shoppingToolbarTitle: { ...typography.title, color: colors.text, marginTop: 2 },
  shoppingAddButton: { minHeight: 46, paddingHorizontal: 15, borderRadius: radius.md, backgroundColor: colors.accent, flexDirection: 'row', alignItems: 'center', gap: 6 },
  shoppingAddButtonText: { ...typography.bodyStrong, color: '#FFFFFF' },
  shoppingRowV214: { minHeight: 64, paddingHorizontal: 13, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  shoppingRowCompact: { minHeight: 54, paddingVertical: 6 },
  shoppingMetaTiny: { fontSize: 11, lineHeight: 15, color: colors.textTertiary, marginTop: 1 },
  swipeRowClip: { position: 'relative', overflow: 'hidden', backgroundColor: colors.danger },
  swipeDeleteBack: { ...StyleSheet.absoluteFill, paddingRight: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, backgroundColor: colors.danger },
  swipeDeleteText: { ...typography.caption, color: '#FFFFFF', fontWeight: '800' },
  swipeHint: { ...typography.caption, color: colors.textTertiary, textAlign: 'center', marginTop: -4 },
  shoppingAddSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 18, paddingBottom: 22, gap: 13, width: '100%', maxHeight: '72%', overflow: 'hidden' },
  shoppingSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  voiceInputShell: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radius.md, backgroundColor: colors.background, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingLeft: 14, paddingRight: 8 },
  voiceProductInput: { flex: 1, ...typography.body, color: colors.text, paddingVertical: 12 },
  micButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  micButtonActive: { backgroundColor: colors.accent },
  listeningText: { ...typography.caption, color: colors.accent, marginTop: -7 },
  suggestionBox: { borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, overflow: 'hidden' },
  suggestionRow: { minHeight: 39, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: colors.surfaceMuted, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  suggestionText: { ...typography.body, color: colors.text },
  quantityControlRow: { minHeight: 58, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  quantityValue: { ...typography.h2, color: colors.text, marginTop: 1 },
  quantityButtons: { flexDirection: 'row', gap: 8 },
  quantityRoundButton: { width: 40, height: 40, borderRadius: 14, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  unitChips: { gap: 7, paddingRight: 4 },
  unitChip: { height: 38, minWidth: 50, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  unitChipActive: { backgroundColor: colors.accent },
  unitChipText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  unitChipTextActive: { color: '#FFFFFF' },
  undoBar: { position: 'absolute', left: 16, right: 16, bottom: 14, minHeight: 52, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.text, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  undoText: { ...typography.caption, color: colors.background, flex: 1 },
  undoAction: { ...typography.bodyStrong, color: colors.accentStrong },

  configurationTitle: { ...typography.title, color: colors.text, textAlign: 'center' },
  configurationText: { ...typography.body, color: colors.textSecondary, textAlign: 'center', maxWidth: 340 },

  recipeWizardHeaderText: { flex: 1, alignItems: 'center' },
  recipeWizardStep: { ...typography.caption, color: colors.textTertiary },
  recipeWizardProgress: { flexDirection: 'row', gap: 6, paddingHorizontal: 18, paddingBottom: 8 },
  recipeWizardProgressPart: { flex: 1, height: 4, borderRadius: 3, backgroundColor: colors.surfaceMuted },
  recipeWizardProgressPartActive: { backgroundColor: colors.accent },
  recipeWizardContent: { padding: 20, gap: 20, paddingBottom: 32 },
  recipeWizardEyebrow: { ...typography.label, color: colors.accent },
  recipeWizardTitle: { ...typography.h1, color: colors.text, marginTop: 5 },
  recipeWizardSubtitle: { ...typography.body, color: colors.textSecondary, marginTop: 5 },
  servingSelector: { alignSelf: 'flex-start', minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 6, borderRadius: radius.md, backgroundColor: colors.surfaceMuted },
  servingValue: { minWidth: 34, ...typography.h2, color: colors.text, textAlign: 'center' },
  ingredientAddRow: { flexDirection: 'row', gap: 9 },
  ingredientAddInput: { flex: 1, minHeight: 52, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 14, ...typography.body, color: colors.text },
  ingredientAddButton: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  ingredientQuickRow: { gap: 7, paddingRight: 4 },
  ingredientQuickChip: { minHeight: 37, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  ingredientQuickText: { ...typography.caption, color: colors.accent, fontWeight: '700' },
  ingredientEditorCard: { overflow: 'hidden' },
  ingredientEditorRow: { minHeight: 58, paddingLeft: 12, paddingRight: 6, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  ingredientNumber: { width: 28, height: 28, borderRadius: 10, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  ingredientNumberText: { ...typography.caption, color: colors.accent, fontWeight: '800' },
  ingredientEditorText: { flex: 1, ...typography.body, color: colors.text },
  recipeInstructionsInput: { minHeight: 180, paddingTop: 14 },
  recipeSummaryCard: { padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 },
  recipeWizardFooter: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 18, flexDirection: 'row', gap: 10, backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },

  });
}

let styles = createStyles();

function refreshAppStyles() {
  styles = createStyles();
  refreshUiComponentStyles();
  refreshInventoryStyles();
}

