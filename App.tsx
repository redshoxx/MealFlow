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
  StyleSheet,
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
  addOwnRecipe,
  addShoppingItem,
  deleteOwnRecipe,
  deleteShoppingItem,
  loadMealPlan,
  loadOwnRecipes,
  loadShopping,
  saveMeal,
  setShoppingDone,
  type OwnRecipe,
  type ShoppingItem,
} from './src/lib/cloud';
import { searchRecipes, type Recipe } from './src/lib/recipes';
import { isCloudConfigured, supabase } from './src/lib/supabase';
import { ActionButton, EmptyState, IconButton, ScreenHeader, SectionTitle, SurfaceCard } from './src/ui/components';
import { colors, radius, shadow, spacing, typography } from './src/ui/theme';

const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const UNITS = ['Stk.', 'Pkg.', 'g', 'kg', 'ml', 'l', 'EL', 'TL', 'Bund', 'Dose'];
const AMOUNTS = Array.from({ length: 80 }, (_, index) => (index + 1) / 2);
const QUICK_SEARCH = ['Pasta', 'Hähnchen', 'Kartoffeln', 'Lachs', 'Curry'];

type Tab = 'heute' | 'woche' | 'einkauf' | 'rezepte';
type RecipeSelection = { kind: 'online'; recipe: Recipe } | { kind: 'own'; recipe: OwnRecipe };

function germanError(message?: string) {
  if (!message) return 'Etwas ist schiefgelaufen. Bitte versuche es erneut.';
  const text = message.toLowerCase();
  if (text.includes('invalid login credentials')) return 'E-Mail-Adresse oder Passwort ist nicht korrekt.';
  if (text.includes('user already registered')) return 'Für diese E-Mail-Adresse gibt es bereits ein Konto.';
  if (text.includes('password should be')) return 'Das Passwort erfüllt die Mindestanforderungen nicht.';
  if (text.includes('email not confirmed')) return 'Bitte bestätige zuerst deine E-Mail-Adresse.';
  if (text.includes('network')) return 'Keine Verbindung. Bitte prüfe deine Internetverbindung.';
  return message;
}

function formatAmount(value: number) {
  return String(value).replace('.5', ',5');
}

function getCurrentDay() {
  const raw = new Date().toLocaleDateString('de-AT', { weekday: 'long' });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
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
        <View style={styles.brandMark}>
          <MaterialCommunityIcons name="silverware-fork-knife" size={28} color="#FFFFFF" />
        </View>
        <Text style={styles.authBrand}>MealFlow</Text>
        <Text style={styles.authHero}>Plane besser. Kaufe gezielter. Koche entspannter.</Text>
        <Text style={styles.authSubtitle}>Wochenplan, Einkaufsliste und Rezepte – auf iPhone und Android synchron.</Text>

        <SurfaceCard style={styles.authCard}>
          <View style={styles.segmentedControl}>
            <Pressable onPress={() => setMode('signin')} style={[styles.segmentButton, mode === 'signin' && styles.segmentButtonActive]}>
              <Text style={[styles.segmentText, mode === 'signin' && styles.segmentTextActive]}>Anmelden</Text>
            </Pressable>
            <Pressable onPress={() => setMode('signup')} style={[styles.segmentButton, mode === 'signup' && styles.segmentButtonActive]}>
              <Text style={[styles.segmentText, mode === 'signup' && styles.segmentTextActive]}>Registrieren</Text>
            </Pressable>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>E-Mail-Adresse</Text>
            <View style={styles.inputShell}>
              <MaterialCommunityIcons name="email-outline" size={20} color={colors.textTertiary} />
              <TextInput
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
                autoComplete="email"
                placeholder="name@beispiel.at"
                placeholderTextColor={colors.textTertiary}
                style={styles.textInput}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Passwort</Text>
            <View style={styles.inputShell}>
              <MaterialCommunityIcons name="lock-outline" size={20} color={colors.textTertiary} />
              <TextInput
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                placeholder="Mindestens 6 Zeichen"
                placeholderTextColor={colors.textTertiary}
                style={styles.textInput}
              />
              <Pressable onPress={() => setShowPassword((value) => !value)} hitSlop={8}>
                <MaterialCommunityIcons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
          </View>

          <ActionButton label={mode === 'signin' ? 'Anmelden' : 'Konto erstellen'} onPress={submit} loading={busy} />
          <Text style={styles.authHint}>Deine Daten werden geschützt in deinem Supabase-Konto gespeichert und über Row Level Security getrennt.</Text>
        </SurfaceCard>
      </ScrollView>
    </View>
  );
}

function QuantitySheet({ visible, amount, unit, onClose, onDone }: { visible: boolean; amount: number; unit: string; onClose: () => void; onDone: (amount: number, unit: string) => void }) {
  const [draftAmount, setDraftAmount] = useState(amount);
  const [draftUnit, setDraftUnit] = useState(unit);

  useEffect(() => {
    if (visible) {
      setDraftAmount(amount);
      setDraftUnit(unit);
    }
  }, [visible, amount, unit]);

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
          <Picker selectedValue={draftAmount} onValueChange={(value) => setDraftAmount(Number(value))} style={styles.picker} itemStyle={styles.pickerItem}>
            {AMOUNTS.map((value) => <Picker.Item key={value} label={formatAmount(value)} value={value} />)}
          </Picker>
          <Picker selectedValue={draftUnit} onValueChange={(value) => setDraftUnit(String(value))} style={styles.picker} itemStyle={styles.pickerItem}>
            {UNITS.map((value) => <Picker.Item key={value} label={value} value={value} />)}
          </Picker>
        </View>
      </View>
    </Modal>
  );
}

function SettingsSheet({ visible, email, onClose }: { visible: boolean; email: string; onClose: () => void }) {
  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose} />
      <View style={styles.settingsSheet}>
        <View style={styles.sheetHandle} />
        <View style={styles.sheetHeader}>
          <Text style={styles.sheetTitle}>Konto & Einstellungen</Text>
          <IconButton icon="close" onPress={onClose} accessibilityLabel="Schließen" />
        </View>
        <SurfaceCard style={styles.settingsCard}>
          <View style={styles.settingsIcon}><MaterialCommunityIcons name="account-outline" size={22} color={colors.accent} /></View>
          <View style={styles.flex1}>
            <Text style={styles.settingsLabel}>Angemeldet als</Text>
            <Text style={styles.settingsValue}>{email || 'MealFlow-Konto'}</Text>
          </View>
        </SurfaceCard>
        <SurfaceCard style={styles.settingsCard}>
          <View style={styles.settingsIcon}><MaterialCommunityIcons name="cloud-check-outline" size={22} color={colors.accent} /></View>
          <View style={styles.flex1}>
            <Text style={styles.settingsLabel}>Synchronisierung</Text>
            <Text style={styles.settingsValue}>Supabase verbunden</Text>
            <Text style={styles.settingsMeta}>Wochenplan, Einkaufsliste und eigene Rezepte werden geräteübergreifend synchronisiert.</Text>
          </View>
        </SurfaceCard>
        <SurfaceCard style={styles.settingsCard}>
          <View style={styles.settingsIcon}><MaterialCommunityIcons name="information-outline" size={22} color={colors.accent} /></View>
          <View style={styles.flex1}>
            <Text style={styles.settingsLabel}>App-Version</Text>
            <Text style={styles.settingsValue}>MealFlow 2.0</Text>
          </View>
        </SurfaceCard>
        <ActionButton label="Abmelden" icon="logout" variant="danger" onPress={() => supabase.auth.signOut().catch(() => undefined)} />
      </View>
    </Modal>
  );
}

function HomeScreen({ meals, items, onNavigate, onSettings }: { meals: Record<string, string>; items: ShoppingItem[]; onNavigate: (tab: Tab) => void; onSettings: () => void }) {
  const currentDay = getCurrentDay();
  const tonight = meals[currentDay] || '';
  const planned = DAYS.filter((day) => Boolean(meals[day])).length;
  const openItems = items.filter((item) => !item.done).length;
  const dateLabel = new Date().toLocaleDateString('de-AT', { weekday: 'long', day: '2-digit', month: 'long' });

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.screenContent}>
      <ScreenHeader eyebrow={dateLabel} title="Heute" subtitle="Alles Wichtige für deinen Abend auf einen Blick." action={<IconButton icon="account-circle-outline" onPress={onSettings} accessibilityLabel="Konto und Einstellungen" />} />

      <SurfaceCard style={styles.heroCard}>
        <View style={styles.heroIcon}><MaterialCommunityIcons name="silverware-fork-knife" size={25} color={colors.accent} /></View>
        <Text style={styles.heroLabel}>HEUTE ABEND</Text>
        <Text style={styles.heroMeal}>{tonight || 'Noch nichts geplant'}</Text>
        <Text style={styles.heroMeta}>{tonight ? 'Dein Abendessen ist eingeplant.' : 'Plane jetzt dein Abendessen und behalte die Woche im Griff.'}</Text>
        <ActionButton label={tonight ? 'Wochenplan öffnen' : 'Abendessen planen'} icon="calendar-week-outline" onPress={() => onNavigate('woche')} variant="secondary" />
      </SurfaceCard>

      <View style={styles.metricsRow}>
        <SurfaceCard style={styles.metricCard}>
          <MaterialCommunityIcons name="calendar-check-outline" size={22} color={colors.accent} />
          <Text style={styles.metricNumber}>{planned}/7</Text>
          <Text style={styles.metricLabel}>Abende geplant</Text>
        </SurfaceCard>
        <SurfaceCard style={styles.metricCard}>
          <MaterialCommunityIcons name="cart-outline" size={22} color={colors.accent} />
          <Text style={styles.metricNumber}>{openItems}</Text>
          <Text style={styles.metricLabel}>offene Einkäufe</Text>
        </SurfaceCard>
      </View>

      <SectionTitle title="Schnellzugriff" />
      <View style={styles.quickGrid}>
        <Pressable style={styles.quickAction} onPress={() => onNavigate('woche')}>
          <View style={styles.quickIcon}><MaterialCommunityIcons name="calendar-plus" size={22} color={colors.accent} /></View>
          <Text style={styles.quickTitle}>Woche planen</Text>
          <Text style={styles.quickText}>Abendessen für die nächsten Tage festlegen.</Text>
        </Pressable>
        <Pressable style={styles.quickAction} onPress={() => onNavigate('einkauf')}>
          <View style={styles.quickIcon}><MaterialCommunityIcons name="cart-plus" size={22} color={colors.accent} /></View>
          <Text style={styles.quickTitle}>Einkauf ergänzen</Text>
          <Text style={styles.quickText}>Produkte mit Menge und Einheit hinzufügen.</Text>
        </Pressable>
        <Pressable style={styles.quickAction} onPress={() => onNavigate('rezepte')}>
          <View style={styles.quickIcon}><MaterialCommunityIcons name="chef-hat" size={22} color={colors.accent} /></View>
          <Text style={styles.quickTitle}>Rezept finden</Text>
          <Text style={styles.quickText}>Online suchen oder eigene Rezepte verwenden.</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function PlanScreen({ meals, setMeals, onSettings }: { meals: Record<string, string>; setMeals: React.Dispatch<React.SetStateAction<Record<string, string>>>; onSettings: () => void }) {
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [mealText, setMealText] = useState('');

  const openEditor = (day: string) => {
    setEditingDay(day);
    setMealText(meals[day] ?? '');
    Haptics.selectionAsync().catch(() => undefined);
  };

  const persist = async () => {
    if (!editingDay) return;
    const value = mealText.trim();
    setMeals((current) => ({ ...current, [editingDay]: value }));
    try {
      await saveMeal(editingDay, value || null);
    } catch (error: any) {
      Alert.alert('Speichern nicht möglich', germanError(error?.message));
    }
    setEditingDay(null);
  };

  return (
    <>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.screenContent}>
        <ScreenHeader title="Wochenplan" subtitle="Nur Abendessen – klar, schnell und ohne unnötige Felder." action={<IconButton icon="account-circle-outline" onPress={onSettings} accessibilityLabel="Konto und Einstellungen" />} />
        <View style={styles.dayList}>
          {DAYS.map((day) => {
            const selected = Boolean(meals[day]);
            const isToday = getCurrentDay() === day;
            return (
              <Pressable key={day} onPress={() => openEditor(day)} style={({ pressed }) => [styles.dayRow, isToday && styles.dayRowToday, { opacity: pressed ? 0.72 : 1 }]}>
                <View style={[styles.dayBadge, isToday && styles.dayBadgeToday]}>
                  <Text style={[styles.dayBadgeText, isToday && styles.dayBadgeTextToday]}>{day.slice(0, 2)}</Text>
                </View>
                <View style={styles.flex1}>
                  <View style={styles.dayTitleRow}>
                    <Text style={styles.dayName}>{day}</Text>
                    {isToday ? <Text style={styles.todayPill}>Heute</Text> : null}
                  </View>
                  <Text style={[styles.dayMeal, !selected && styles.dayMealEmpty]} numberOfLines={1}>{meals[day] || 'Abendessen hinzufügen'}</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textTertiary} />
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <Modal transparent visible={Boolean(editingDay)} animationType="slide" onRequestClose={() => setEditingDay(null)}>
        <KeyboardAvoidingView style={styles.modalFlex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.modalOverlay} onPress={() => setEditingDay(null)} />
          <View style={styles.editorSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.editorEyebrow}>ABENDESSEN</Text>
            <Text style={styles.editorTitle}>{editingDay}</Text>
            <Text style={styles.fieldLabel}>Gericht</Text>
            <TextInput autoFocus value={mealText} onChangeText={setMealText} placeholder="z. B. Ofengemüse mit Feta" placeholderTextColor={colors.textTertiary} style={styles.largeInput} />
            <ActionButton label="Speichern" icon="check" onPress={persist} />
            {mealText ? <ActionButton label="Planung entfernen" variant="ghost" onPress={() => setMealText('')} /> : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function ShoppingScreen({ items, setItems, onSettings }: { items: ShoppingItem[]; setItems: React.Dispatch<React.SetStateAction<ShoppingItem[]>>; onSettings: () => void }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState('Stk.');
  const [pickerOpen, setPickerOpen] = useState(false);
  const active = items.filter((item) => !item.done);
  const completed = items.filter((item) => item.done);

  const add = async () => {
    const cleanName = name.trim();
    if (!cleanName) return;
    const temporary: ShoppingItem = { id: `local-${Date.now()}`, name: cleanName, amount, unit, done: false };
    setItems((current) => [temporary, ...current]);
    setName('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    try {
      const remote = await addShoppingItem({ name: cleanName, amount, unit });
      setItems((current) => current.map((item) => item.id === temporary.id ? remote : item));
    } catch (error: any) {
      setItems((current) => current.filter((item) => item.id !== temporary.id));
      Alert.alert('Produkt konnte nicht gespeichert werden', germanError(error?.message));
    }
  };

  const toggle = async (item: ShoppingItem) => {
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry));
    try { await setShoppingDone(item.id, !item.done); } catch (error: any) { Alert.alert('Änderung nicht gespeichert', germanError(error?.message)); }
  };

  const remove = async (item: ShoppingItem) => {
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    try { await deleteShoppingItem(item.id); } catch (error: any) { Alert.alert('Löschen nicht möglich', germanError(error?.message)); }
  };

  const renderItem = (item: ShoppingItem) => (
    <View key={item.id} style={styles.shoppingRow}>
      <Pressable accessibilityLabel={item.done ? `${item.name} als offen markieren` : `${item.name} als erledigt markieren`} onPress={() => toggle(item)} style={[styles.checkbox, item.done && styles.checkboxDone]}>
        {item.done ? <MaterialCommunityIcons name="check" size={17} color="#FFFFFF" /> : null}
      </Pressable>
      <View style={styles.flex1}>
        <Text style={[styles.shoppingName, item.done && styles.shoppingNameDone]}>{item.name}</Text>
        <Text style={styles.shoppingMeta}>{formatAmount(item.amount)} {item.unit}</Text>
      </View>
      <IconButton icon="trash-can-outline" tone="danger" onPress={() => remove(item)} accessibilityLabel={`${item.name} löschen`} />
    </View>
  );

  return (
    <>
      <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.screenContent}>
        <ScreenHeader title="Einkauf" subtitle={`${active.length} ${active.length === 1 ? 'Produkt' : 'Produkte'} offen`} action={<IconButton icon="account-circle-outline" onPress={onSettings} accessibilityLabel="Konto und Einstellungen" />} />

        <SurfaceCard style={styles.addCard}>
          <Text style={styles.inputLabel}>Produkt hinzufügen</Text>
          <TextInput value={name} onChangeText={setName} onSubmitEditing={add} returnKeyType="done" placeholder="Was brauchst du?" placeholderTextColor={colors.textTertiary} style={styles.productInput} />
          <View style={styles.addRow}>
            <Pressable onPress={() => setPickerOpen(true)} style={styles.amountButton}>
              <View>
                <Text style={styles.miniLabel}>MENGE</Text>
                <Text style={styles.amountText}>{formatAmount(amount)} {unit}</Text>
              </View>
              <MaterialCommunityIcons name="chevron-down" size={20} color={colors.textSecondary} />
            </Pressable>
            <ActionButton label="Hinzufügen" icon="plus" onPress={add} style={styles.addButton} />
          </View>
        </SurfaceCard>

        <SectionTitle title="Offen" />
        {active.length ? <SurfaceCard style={styles.listCard}>{active.map(renderItem)}</SurfaceCard> : (
          <SurfaceCard><EmptyState icon="cart-check" title="Alles erledigt" text="Deine Einkaufsliste ist aktuell leer. Neue Produkte kannst du oben hinzufügen." /></SurfaceCard>
        )}

        {completed.length ? (
          <>
            <SectionTitle title={`Erledigt · ${completed.length}`} />
            <SurfaceCard style={styles.listCard}>{completed.map(renderItem)}</SurfaceCard>
          </>
        ) : null}
      </ScrollView>
      <QuantitySheet visible={pickerOpen} amount={amount} unit={unit} onClose={() => setPickerOpen(false)} onDone={(nextAmount, nextUnit) => { setAmount(nextAmount); setUnit(nextUnit); setPickerOpen(false); }} />
    </>
  );
}

function OwnRecipeEditor({ visible, onClose, onSaved }: { visible: boolean; onClose: () => void; onSaved: (recipe: OwnRecipe) => void }) {
  const [title, setTitle] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [instructions, setInstructions] = useState('');
  const [servings, setServings] = useState('2');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const cleanTitle = title.trim();
    const ingredientList = ingredients.split('\n').map((line) => line.trim()).filter(Boolean);
    if (!cleanTitle || ingredientList.length === 0) {
      Alert.alert('Rezept unvollständig', 'Bitte gib einen Namen und mindestens eine Zutat ein.');
      return;
    }
    setSaving(true);
    try {
      const recipe = await addOwnRecipe({
        title: cleanTitle,
        ingredients: ingredientList,
        instructions: instructions.trim(),
        servings: Math.max(1, Math.min(20, Number(servings) || 2)),
      });
      onSaved(recipe);
      setTitle(''); setIngredients(''); setInstructions(''); setServings('2');
      onClose();
    } catch (error: any) {
      Alert.alert('Rezept konnte nicht gespeichert werden', germanError(error?.message));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <KeyboardAvoidingView style={styles.fullModal} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.fullModalHeader}>
            <IconButton icon="arrow-left" onPress={onClose} accessibilityLabel="Zurück" />
            <Text style={styles.fullModalTitle}>Eigenes Rezept</Text>
            <View style={styles.headerSpacer} />
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.formContent}>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Name des Rezepts</Text>
              <TextInput value={title} onChangeText={setTitle} placeholder="z. B. Omas Kartoffelgulasch" placeholderTextColor={colors.textTertiary} style={styles.formInput} />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Zutaten</Text>
              <Text style={styles.fieldHint}>Eine Zutat pro Zeile, z. B. „500 g Kartoffeln“.</Text>
              <TextInput value={ingredients} onChangeText={setIngredients} multiline textAlignVertical="top" placeholder={'500 g Kartoffeln\n1 Zwiebel\n2 EL Öl'} placeholderTextColor={colors.textTertiary} style={[styles.formInput, styles.multilineInput]} />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Zubereitung</Text>
              <TextInput value={instructions} onChangeText={setInstructions} multiline textAlignVertical="top" placeholder="Beschreibe die Zubereitung Schritt für Schritt …" placeholderTextColor={colors.textTertiary} style={[styles.formInput, styles.multilineInput]} />
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.fieldLabel}>Portionen</Text>
              <TextInput value={servings} onChangeText={setServings} keyboardType="number-pad" style={[styles.formInput, styles.servingsInput]} />
            </View>
            <ActionButton label="Rezept speichern" icon="content-save-outline" onPress={save} loading={saving} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaProvider>
    </Modal>
  );
}

function RecipeDetail({ selection, onClose, onAddIngredients, onPlan, onDeleteOwn }: { selection: RecipeSelection | null; onClose: () => void; onAddIngredients: (selection: RecipeSelection) => void; onPlan: (selection: RecipeSelection) => void; onDeleteOwn: (recipe: OwnRecipe) => void }) {
  if (!selection) return null;
  const online = selection.kind === 'online' ? selection.recipe : null;
  const own = selection.kind === 'own' ? selection.recipe : null;
  const title = online?.title ?? own?.title ?? '';
  const ingredients = online ? online.ingredients.map((item) => `${item.name}${item.amount ? ` · ${item.amount}` : ''}${item.unit ? ` ${item.unit}` : ''}`) : own?.ingredients ?? [];

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaProvider>
        <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.recipeDetailContent}>
          <View style={styles.detailTopbar}>
            <IconButton icon="arrow-left" onPress={onClose} accessibilityLabel="Zurück" />
            {own ? <IconButton icon="trash-can-outline" tone="danger" onPress={() => onDeleteOwn(own)} accessibilityLabel="Rezept löschen" /> : <View style={styles.headerSpacer} />}
          </View>
          {online?.image ? <Image source={{ uri: online.image }} style={styles.detailImage} resizeMode="cover" /> : (
            <View style={styles.detailPlaceholder}><MaterialCommunityIcons name="chef-hat" size={42} color={colors.accent} /></View>
          )}
          <Text style={styles.detailSource}>{online ? 'ONLINE-REZEPT' : 'MEIN REZEPT'}</Text>
          <Text style={styles.detailTitle}>{title}</Text>
          {own ? <Text style={styles.detailMeta}>{own.servings} {own.servings === 1 ? 'Portion' : 'Portionen'}</Text> : null}

          <SectionTitle title="Zutaten" />
          <SurfaceCard style={styles.ingredientsCard}>
            {ingredients.map((ingredient, index) => (
              <View key={`${ingredient}-${index}`} style={styles.ingredientRow}>
                <View style={styles.ingredientDot} />
                <Text style={styles.ingredientText}>{ingredient}</Text>
              </View>
            ))}
          </SurfaceCard>

          {(own?.instructions || online?.instructions) ? (
            <>
              <SectionTitle title="Zubereitung" />
              <SurfaceCard style={styles.instructionsCard}>
                <Text style={styles.instructionsText}>{own?.instructions || online?.instructions}</Text>
              </SurfaceCard>
            </>
          ) : null}

          <ActionButton label="Zutaten zur Einkaufsliste" icon="cart-plus" onPress={() => onAddIngredients(selection)} />
          <ActionButton label="Als Abendessen einplanen" icon="calendar-plus" variant="secondary" onPress={() => onPlan(selection)} />
          {online?.url ? <ActionButton label="Originalquelle öffnen" icon="open-in-new" variant="ghost" onPress={() => Linking.openURL(online.url!).catch(() => undefined)} /> : null}
        </ScrollView>
      </SafeAreaProvider>
    </Modal>
  );
}

function RecipesScreen({ ownRecipes, setOwnRecipes, onAddIngredients, onPlan, onSettings }: { ownRecipes: OwnRecipe[]; setOwnRecipes: React.Dispatch<React.SetStateAction<OwnRecipe[]>>; onAddIngredients: (selection: RecipeSelection) => void; onPlan: (selection: RecipeSelection) => void; onSettings: () => void }) {
  const [mode, setMode] = useState<'entdecken' | 'eigene'>('entdecken');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selected, setSelected] = useState<RecipeSelection | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  const runSearch = async (term = query) => {
    const clean = term.trim();
    if (!clean) return;
    setQuery(clean);
    setLoading(true);
    try {
      const result = await searchRecipes(clean);
      setRecipes(result);
      if (!result.length) Alert.alert('Keine Treffer', `Für „${clean}“ wurden keine passenden Rezepte gefunden.`);
    } catch (error: any) {
      Alert.alert('Rezeptsuche nicht möglich', germanError(error?.message));
    } finally {
      setLoading(false);
    }
  };

  const removeOwn = async (recipe: OwnRecipe) => {
    Alert.alert('Rezept löschen?', `„${recipe.title}“ wird dauerhaft gelöscht.`, [
      { text: 'Abbrechen', style: 'cancel' },
      { text: 'Löschen', style: 'destructive', onPress: async () => {
        setSelected(null);
        setOwnRecipes((current) => current.filter((item) => item.id !== recipe.id));
        try { await deleteOwnRecipe(recipe.id); } catch (error: any) { Alert.alert('Löschen nicht möglich', germanError(error?.message)); }
      } },
    ]);
  };

  return (
    <>
      <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.screenContent}>
        <ScreenHeader title="Rezepte" subtitle="Inspiration finden oder deine eigenen Rezepte speichern." action={<IconButton icon="account-circle-outline" onPress={onSettings} accessibilityLabel="Konto und Einstellungen" />} />

        <View style={styles.recipeSegments}>
          <Pressable onPress={() => setMode('entdecken')} style={[styles.recipeSegment, mode === 'entdecken' && styles.recipeSegmentActive]}><Text style={[styles.recipeSegmentText, mode === 'entdecken' && styles.recipeSegmentTextActive]}>Entdecken</Text></Pressable>
          <Pressable onPress={() => setMode('eigene')} style={[styles.recipeSegment, mode === 'eigene' && styles.recipeSegmentActive]}><Text style={[styles.recipeSegmentText, mode === 'eigene' && styles.recipeSegmentTextActive]}>Meine Rezepte</Text></Pressable>
        </View>

        {mode === 'entdecken' ? (
          <>
            <View style={styles.searchShell}>
              <MaterialCommunityIcons name="magnify" size={22} color={colors.textTertiary} />
              <TextInput value={query} onChangeText={setQuery} onSubmitEditing={() => runSearch()} returnKeyType="search" placeholder="Nach Rezepten suchen …" placeholderTextColor={colors.textTertiary} style={styles.searchInput} />
              {query ? <Pressable onPress={() => setQuery('')}><MaterialCommunityIcons name="close-circle" size={19} color={colors.textTertiary} /></Pressable> : null}
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsRow}>
              {QUICK_SEARCH.map((term) => <Pressable key={term} onPress={() => runSearch(term)} style={styles.chip}><Text style={styles.chipText}>{term}</Text></Pressable>)}
            </ScrollView>
            {loading ? <View style={styles.loadingBox}><ActivityIndicator color={colors.accent} /><Text style={styles.loadingText}>Rezepte werden gesucht …</Text></View> : null}
            {!loading && recipes.length === 0 ? <SurfaceCard><EmptyState icon="chef-hat" title="Was möchtest du kochen?" text="Suche nach einem Gericht oder wähle einen Vorschlag. Deine Einkaufsliste und dein Wochenplan sind direkt verbunden." /></SurfaceCard> : null}
            <View style={styles.recipeGrid}>
              {recipes.map((recipe) => (
                <Pressable key={recipe.id} onPress={() => setSelected({ kind: 'online', recipe })} style={({ pressed }) => [styles.recipeCard, { opacity: pressed ? 0.8 : 1 }]}>
                  {recipe.image ? <Image source={{ uri: recipe.image }} style={styles.recipeImage} resizeMode="cover" /> : <View style={styles.recipeImagePlaceholder}><MaterialCommunityIcons name="chef-hat" size={28} color={colors.accent} /></View>}
                  <View style={styles.recipeCardBody}>
                    <Text style={styles.recipeCardTitle} numberOfLines={2}>{recipe.title}</Text>
                    <Text style={styles.recipeCardMeta}>{recipe.ingredients.length} Zutaten</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <>
            <ActionButton label="Eigenes Rezept hinzufügen" icon="plus" onPress={() => setEditorOpen(true)} />
            {ownRecipes.length === 0 ? <SurfaceCard><EmptyState icon="book-open-page-variant-outline" title="Noch keine eigenen Rezepte" text="Speichere Familienrezepte, Lieblingsgerichte oder eigene Ideen dauerhaft in MealFlow." actionLabel="Erstes Rezept anlegen" onAction={() => setEditorOpen(true)} /></SurfaceCard> : (
              <View style={styles.ownRecipeList}>
                {ownRecipes.map((recipe) => (
                  <Pressable key={recipe.id} onPress={() => setSelected({ kind: 'own', recipe })} style={({ pressed }) => [styles.ownRecipeRow, { opacity: pressed ? 0.75 : 1 }]}>
                    <View style={styles.ownRecipeIcon}><MaterialCommunityIcons name="book-open-page-variant-outline" size={22} color={colors.accent} /></View>
                    <View style={styles.flex1}><Text style={styles.ownRecipeTitle}>{recipe.title}</Text><Text style={styles.ownRecipeMeta}>{recipe.ingredients.length} Zutaten · {recipe.servings} Portionen</Text></View>
                    <MaterialCommunityIcons name="chevron-right" size={24} color={colors.textTertiary} />
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      <OwnRecipeEditor visible={editorOpen} onClose={() => setEditorOpen(false)} onSaved={(recipe) => setOwnRecipes((current) => [recipe, ...current])} />
      <RecipeDetail selection={selected} onClose={() => setSelected(null)} onAddIngredients={(selection) => { onAddIngredients(selection); setSelected(null); }} onPlan={(selection) => { onPlan(selection); setSelected(null); }} onDeleteOwn={removeOwn} />
    </>
  );
}

function DayPicker({ selection, onClose, onSelect }: { selection: RecipeSelection | null; onClose: () => void; onSelect: (day: string) => void }) {
  const title = selection?.recipe.title ?? '';
  return (
    <Modal transparent visible={Boolean(selection)} animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose} />
      <View style={styles.dayPickerSheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.editorEyebrow}>ABENDESSEN EINPLANEN</Text>
        <Text style={styles.dayPickerTitle}>{title}</Text>
        <View style={styles.dayPickerGrid}>
          {DAYS.map((day) => <Pressable key={day} onPress={() => onSelect(day)} style={styles.dayPickerButton}><Text style={styles.dayPickerButtonText}>{day}</Text></Pressable>)}
        </View>
      </View>
    </Modal>
  );
}

function TabBar({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const tabs: { key: Tab; label: string; icon: React.ComponentProps<typeof MaterialCommunityIcons>['name']; active: React.ComponentProps<typeof MaterialCommunityIcons>['name'] }[] = [
    { key: 'heute', label: 'Heute', icon: 'home-variant-outline', active: 'home-variant' },
    { key: 'woche', label: 'Woche', icon: 'calendar-week-outline', active: 'calendar-week' },
    { key: 'einkauf', label: 'Einkauf', icon: 'cart-outline', active: 'cart' },
    { key: 'rezepte', label: 'Rezepte', icon: 'silverware-fork-knife', active: 'silverware-fork-knife' },
  ];
  return (
    <View style={styles.tabBar}>
      {tabs.map((item) => {
        const active = tab === item.key;
        return (
          <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => onChange(item.key)} style={styles.tabItem}>
            <MaterialCommunityIcons name={active ? item.active : item.icon} size={23} color={active ? colors.accent : colors.textTertiary} />
            <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function MainApp() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('heute');
  const [items, setItems] = useState<ShoppingItem[]>([]);
  const [meals, setMeals] = useState<Record<string, string>>({});
  const [ownRecipes, setOwnRecipes] = useState<OwnRecipe[]>([]);
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [recipeToPlan, setRecipeToPlan] = useState<RecipeSelection | null>(null);

  useEffect(() => {
    Promise.all([loadShopping(), loadMealPlan(), loadOwnRecipes(), supabase.auth.getUser()])
      .then(([shopping, plan, customRecipes, userResult]) => {
        setItems(shopping);
        setMeals(Object.fromEntries(plan.map((entry) => [entry.day, entry.meal ?? ''])));
        setOwnRecipes(customRecipes);
        setEmail(userResult.data.user?.email ?? '');
      })
      .catch((error) => Alert.alert('Daten konnten nicht geladen werden', germanError(error?.message)))
      .finally(() => setReady(true));

    const channel = supabase.channel('mealflow-live-v2')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items' }, () => loadShopping().then(setItems).catch(() => undefined))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_plan' }, () => loadMealPlan().then((plan) => setMeals(Object.fromEntries(plan.map((entry) => [entry.day, entry.meal ?? ''])))).catch(() => undefined))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'custom_recipes' }, () => loadOwnRecipes().then(setOwnRecipes).catch(() => undefined))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const changeTab = (next: Tab) => {
    setTab(next);
    Haptics.selectionAsync().catch(() => undefined);
  };

  const addRecipeIngredients = (selection: RecipeSelection) => {
    const rawIngredients = selection.kind === 'online'
      ? selection.recipe.ingredients.map((ingredient) => ({ name: ingredient.name, amount: ingredient.amount ?? 1, unit: UNITS.includes(ingredient.unit ?? '') ? ingredient.unit! : 'Stk.' }))
      : selection.recipe.ingredients.map((ingredient) => ({ name: ingredient, amount: 1, unit: 'Stk.' }));

    const temporary = rawIngredients.slice(0, 30).map((ingredient, index) => ({ id: `recipe-${Date.now()}-${index}`, done: false, ...ingredient }));
    setItems((current) => [...temporary, ...current]);
    temporary.forEach((item) => addShoppingItem({ name: item.name, amount: item.amount, unit: item.unit }).catch(() => undefined));
    changeTab('einkauf');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
  };

  const planRecipe = async (day: string) => {
    if (!recipeToPlan) return;
    const title = recipeToPlan.recipe.title;
    setMeals((current) => ({ ...current, [day]: title }));
    setRecipeToPlan(null);
    changeTab('woche');
    try { await saveMeal(day, title); } catch (error: any) { Alert.alert('Planung nicht gespeichert', germanError(error?.message)); }
  };

  if (!ready) {
    return <View style={styles.loadingScreen}><View style={styles.brandMark}><MaterialCommunityIcons name="silverware-fork-knife" size={28} color="#FFFFFF" /></View><ActivityIndicator color={colors.accent} /><Text style={styles.loadingText}>MealFlow wird vorbereitet …</Text></View>;
  }

  return (
    <View style={[styles.appRoot, { paddingTop: insets.top }]}> 
      <StatusBar style="dark" />
      <View style={styles.screenArea}>
        {tab === 'heute' ? <HomeScreen meals={meals} items={items} onNavigate={changeTab} onSettings={() => setSettingsOpen(true)} /> : null}
        {tab === 'woche' ? <PlanScreen meals={meals} setMeals={setMeals} onSettings={() => setSettingsOpen(true)} /> : null}
        {tab === 'einkauf' ? <ShoppingScreen items={items} setItems={setItems} onSettings={() => setSettingsOpen(true)} /> : null}
        {tab === 'rezepte' ? <RecipesScreen ownRecipes={ownRecipes} setOwnRecipes={setOwnRecipes} onAddIngredients={addRecipeIngredients} onPlan={setRecipeToPlan} onSettings={() => setSettingsOpen(true)} /> : null}
      </View>
      <View style={{ paddingBottom: Math.max(insets.bottom, 8), backgroundColor: colors.surface }}><TabBar tab={tab} onChange={changeTab} /></View>
      <SettingsSheet visible={settingsOpen} email={email} onClose={() => setSettingsOpen(false)} />
      <DayPicker selection={recipeToPlan} onClose={() => setRecipeToPlan(null)} onSelect={planRecipe} />
    </View>
  );
}

function Root() {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!isCloudConfigured) {
      setChecking(false);
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      setAuthenticated(Boolean(data.session));
      setChecking(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setAuthenticated(Boolean(session)));
    return () => listener.subscription.unsubscribe();
  }, []);

  if (checking) return <View style={styles.loadingScreen}><ActivityIndicator color={colors.accent} /></View>;
  if (!isCloudConfigured) return <View style={styles.loadingScreen}><Text style={styles.configurationTitle}>Cloud-Verbindung fehlt</Text><Text style={styles.configurationText}>MealFlow benötigt die Supabase-Konfiguration, damit deine Daten sicher synchronisiert werden.</Text></View>;
  return authenticated ? <MainApp /> : <AuthScreen />;
}

export default function App() {
  return <SafeAreaProvider><Root /></SafeAreaProvider>;
}

const styles = StyleSheet.create({
  appRoot: { flex: 1, backgroundColor: colors.background },
  screenArea: { flex: 1 },
  screenContent: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 30, gap: 18 },
  flex1: { flex: 1 },
  modalFlex: { flex: 1, justifyContent: 'flex-end' },
  fullModal: { flex: 1, backgroundColor: colors.background },
  headerSpacer: { width: 44, height: 44 },
  authRoot: { flex: 1, backgroundColor: colors.background },
  authContent: { flexGrow: 1, justifyContent: 'center', padding: 24, gap: 12 },
  brandMark: { width: 58, height: 58, borderRadius: 20, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', ...shadow },
  authBrand: { ...typography.title, color: colors.accent, marginTop: 6 },
  authHero: { ...typography.hero, color: colors.text, maxWidth: 380 },
  authSubtitle: { ...typography.body, color: colors.textSecondary, maxWidth: 370, marginBottom: 12 },
  authCard: { padding: 18, gap: 16 },
  segmentedControl: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: 4 },
  segmentButton: { flex: 1, minHeight: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  segmentButtonActive: { backgroundColor: colors.surface, ...shadow },
  segmentText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  segmentTextActive: { color: colors.text },
  inputGroup: { gap: 7 },
  inputLabel: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  inputShell: { minHeight: 52, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.background, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.md },
  textInput: { flex: 1, ...typography.body, color: colors.text, paddingVertical: 12 },
  authHint: { ...typography.caption, color: colors.textTertiary, textAlign: 'center' },
  heroCard: { padding: 20, gap: 10 },
  heroIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  heroLabel: { ...typography.label, color: colors.accent, marginTop: 4 },
  heroMeal: { ...typography.h2, color: colors.text },
  heroMeta: { ...typography.body, color: colors.textSecondary, marginBottom: 4 },
  metricsRow: { flexDirection: 'row', gap: 12 },
  metricCard: { flex: 1, padding: 16, gap: 7 },
  metricNumber: { fontSize: 26, lineHeight: 31, fontWeight: '800', color: colors.text },
  metricLabel: { ...typography.caption, color: colors.textSecondary },
  quickGrid: { gap: 10 },
  quickAction: { backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.lg, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, ...shadow },
  quickIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  quickTitle: { ...typography.bodyStrong, color: colors.text, minWidth: 95 },
  quickText: { ...typography.caption, color: colors.textSecondary, flex: 1 },
  dayList: { gap: 9 },
  dayRow: { minHeight: 76, paddingHorizontal: 14, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 13, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.lg },
  dayRowToday: { borderColor: '#BBD1C1', backgroundColor: '#FBFDFB' },
  dayBadge: { width: 46, height: 46, borderRadius: 15, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  dayBadgeToday: { backgroundColor: colors.accentSoft },
  dayBadgeText: { ...typography.bodyStrong, color: colors.textSecondary },
  dayBadgeTextToday: { color: colors.accent },
  dayTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayName: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  todayPill: { ...typography.caption, color: colors.accent, backgroundColor: colors.accentSoft, paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, overflow: 'hidden' },
  dayMeal: { ...typography.bodyStrong, color: colors.text, marginTop: 2 },
  dayMealEmpty: { color: colors.textTertiary, fontWeight: '400' },
  modalOverlay: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  bottomSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 18, paddingBottom: 26, position: 'absolute', left: 0, right: 0, bottom: 0 },
  settingsSheet: { backgroundColor: colors.background, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 18, paddingBottom: 30, position: 'absolute', left: 0, right: 0, bottom: 0, gap: 12 },
  editorSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 18, paddingBottom: 30, gap: 12 },
  dayPickerSheet: { backgroundColor: colors.surface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, paddingHorizontal: 18, paddingBottom: 30, position: 'absolute', left: 0, right: 0, bottom: 0, gap: 12 },
  sheetHandle: { width: 38, height: 5, borderRadius: 3, backgroundColor: colors.border, alignSelf: 'center', marginVertical: 10 },
  sheetHeader: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  sheetCancel: { ...typography.body, color: colors.textSecondary },
  sheetTitle: { ...typography.title, color: colors.text },
  sheetDone: { ...typography.bodyStrong, color: colors.accent },
  pickerRow: { flexDirection: 'row', minHeight: 210 },
  picker: { flex: 1 },
  pickerItem: { color: colors.text, fontSize: 19 },
  settingsCard: { padding: 15, flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  settingsIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  settingsLabel: { ...typography.caption, color: colors.textSecondary },
  settingsValue: { ...typography.bodyStrong, color: colors.text, marginTop: 2 },
  settingsMeta: { ...typography.caption, color: colors.textTertiary, marginTop: 4 },
  editorEyebrow: { ...typography.label, color: colors.accent },
  editorTitle: { ...typography.h2, color: colors.text, marginBottom: 2 },
  fieldLabel: { ...typography.bodyStrong, color: colors.text },
  fieldHint: { ...typography.caption, color: colors.textSecondary },
  largeInput: { minHeight: 54, borderRadius: radius.md, backgroundColor: colors.background, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 14, ...typography.body, color: colors.text },
  addCard: { padding: 15, gap: 10 },
  productInput: { minHeight: 52, backgroundColor: colors.background, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, ...typography.body, color: colors.text },
  addRow: { flexDirection: 'row', gap: 10 },
  amountButton: { flex: 1, minHeight: 52, paddingHorizontal: 13, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  miniLabel: { ...typography.label, color: colors.textTertiary },
  amountText: { ...typography.bodyStrong, color: colors.text },
  addButton: { flex: 1 },
  listCard: { overflow: 'hidden' },
  shoppingRow: { minHeight: 70, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  checkbox: { width: 28, height: 28, borderRadius: 10, borderWidth: 1.5, borderColor: '#A7AFA5', alignItems: 'center', justifyContent: 'center' },
  checkboxDone: { backgroundColor: colors.accent, borderColor: colors.accent },
  shoppingName: { ...typography.bodyStrong, color: colors.text },
  shoppingNameDone: { color: colors.textTertiary, textDecorationLine: 'line-through' },
  shoppingMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  recipeSegments: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, padding: 4, borderRadius: radius.md },
  recipeSegment: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  recipeSegmentActive: { backgroundColor: colors.surface, ...shadow },
  recipeSegmentText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  recipeSegmentTextActive: { color: colors.text },
  searchShell: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  searchInput: { flex: 1, ...typography.body, color: colors.text },
  chipsRow: { gap: 8, paddingRight: 12 },
  chip: { paddingHorizontal: 13, paddingVertical: 9, backgroundColor: colors.accentSoft, borderRadius: radius.pill },
  chipText: { ...typography.caption, color: colors.accent, fontWeight: '700' },
  loadingBox: { alignItems: 'center', justifyContent: 'center', paddingVertical: 24, gap: 10 },
  loadingText: { ...typography.caption, color: colors.textSecondary },
  recipeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  recipeCard: { width: '48.5%', backgroundColor: colors.surface, borderRadius: radius.lg, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...shadow },
  recipeImage: { width: '100%', height: 130, backgroundColor: colors.surfaceMuted },
  recipeImagePlaceholder: { width: '100%', height: 130, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  recipeCardBody: { padding: 12, gap: 5 },
  recipeCardTitle: { ...typography.bodyStrong, color: colors.text },
  recipeCardMeta: { ...typography.caption, color: colors.textSecondary },
  ownRecipeList: { gap: 9 },
  ownRecipeRow: { minHeight: 72, padding: 13, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.lg },
  ownRecipeIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  ownRecipeTitle: { ...typography.bodyStrong, color: colors.text },
  ownRecipeMeta: { ...typography.caption, color: colors.textSecondary, marginTop: 2 },
  fullModalHeader: { paddingHorizontal: 18, paddingTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fullModalTitle: { ...typography.title, color: colors.text },
  formContent: { padding: 18, paddingBottom: 40, gap: 18 },
  formInput: { minHeight: 52, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 12, ...typography.body, color: colors.text },
  multilineInput: { minHeight: 130 },
  servingsInput: { maxWidth: 110 },
  recipeDetailContent: { minHeight: '100%', backgroundColor: colors.background, padding: 18, paddingBottom: 44, gap: 16 },
  detailTopbar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  detailImage: { width: '100%', height: 250, borderRadius: radius.xl, backgroundColor: colors.surfaceMuted },
  detailPlaceholder: { width: '100%', height: 190, borderRadius: radius.xl, backgroundColor: colors.accentSoft, alignItems: 'center', justifyContent: 'center' },
  detailSource: { ...typography.label, color: colors.accent },
  detailTitle: { ...typography.h1, color: colors.text },
  detailMeta: { ...typography.body, color: colors.textSecondary },
  ingredientsCard: { padding: 15, gap: 12 },
  ingredientRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  ingredientDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.accent, marginTop: 8 },
  ingredientText: { ...typography.body, color: colors.text, flex: 1 },
  instructionsCard: { padding: 16 },
  instructionsText: { ...typography.body, color: colors.textSecondary },
  dayPickerTitle: { ...typography.h2, color: colors.text, marginBottom: 4 },
  dayPickerGrid: { gap: 8 },
  dayPickerButton: { minHeight: 48, borderRadius: radius.md, backgroundColor: colors.surfaceMuted, justifyContent: 'center', paddingHorizontal: 15 },
  dayPickerButtonText: { ...typography.bodyStrong, color: colors.text },
  tabBar: { height: 64, flexDirection: 'row', backgroundColor: colors.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingHorizontal: 6 },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3 },
  tabLabel: { fontSize: 11, lineHeight: 14, fontWeight: '600', color: colors.textTertiary },
  tabLabelActive: { color: colors.accent },
  loadingScreen: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  configurationTitle: { ...typography.h2, color: colors.text, textAlign: 'center' },
  configurationText: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
});
