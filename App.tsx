import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import * as Haptics from 'expo-haptics';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  addShoppingItem,
  deleteShoppingItem,
  loadMealPlan,
  loadShopping,
  saveMeal,
  setShoppingDone,
  type ShoppingItem,
} from './src/lib/cloud';
import { searchRecipes, type Recipe } from './src/lib/recipes';
import { isCloudConfigured, supabase } from './src/lib/supabase';

const DAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const UNITS = ['Stk.', 'Pkg.', 'g', 'kg', 'ml', 'l', 'EL', 'TL', 'Bund', 'Dose'];
const AMOUNTS = Array.from({ length: 80 }, (_, index) => (index + 1) / 2);
const BG = '#0B0D0F';
const CARD = '#15191D';
const CARD_2 = '#1B2025';
const TEXT = '#F4F6F8';
const MUTED = '#98A1AA';
const GREEN = '#79C843';

type Tab = 'plan' | 'shopping' | 'recipes' | 'more';

const DEMO_ITEMS: ShoppingItem[] = [
  { id: 'demo-1', name: 'Tomaten', amount: 500, unit: 'g', done: false },
  { id: 'demo-2', name: 'Hühnerbrust', amount: 400, unit: 'g', done: false },
  { id: 'demo-3', name: 'Milch', amount: 2, unit: 'l', done: true },
];

function PrimaryButton({ label, onPress, secondary = false }: { label: string; onPress: () => void; secondary?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: secondary ? CARD_2 : GREEN,
        borderRadius: 16,
        paddingHorizontal: 18,
        paddingVertical: 14,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <Text style={{ color: secondary ? TEXT : '#0A1205', fontSize: 16, fontWeight: '800', textAlign: 'center' }}>{label}</Text>
    </Pressable>
  );
}

function AuthScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (mode: 'signin' | 'signup') => {
    if (!supabase) return;
    if (!email.trim() || password.length < 6) {
      Alert.alert('Eingaben prüfen', 'Bitte E-Mail und mindestens 6 Zeichen Passwort eingeben.');
      return;
    }
    setBusy(true);
    try {
      const result = mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });
      if (result.error) throw result.error;
      if (mode === 'signup' && !result.data.session) {
        Alert.alert('E-Mail bestätigen', 'Bitte bestätige zuerst deine E-Mail und melde dich danach an.');
      }
    } catch (error: any) {
      Alert.alert('Anmeldung fehlgeschlagen', error?.message ?? 'Unbekannter Fehler');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 14, backgroundColor: BG }}>
      <Text style={{ color: TEXT, fontSize: 38, fontWeight: '900' }}>MealFlow</Text>
      <Text style={{ color: MUTED, fontSize: 16, lineHeight: 23 }}>Ein gemeinsamer Account synchronisiert Wochenplan und Einkaufsliste zwischen iPhone und Android.</Text>
      <TextInput value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" placeholder="E-Mail" placeholderTextColor={MUTED} style={{ backgroundColor: CARD, color: TEXT, padding: 16, borderRadius: 16, fontSize: 16 }} />
      <TextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="Passwort" placeholderTextColor={MUTED} style={{ backgroundColor: CARD, color: TEXT, padding: 16, borderRadius: 16, fontSize: 16 }} />
      {busy ? <ActivityIndicator color={GREEN} /> : (
        <>
          <PrimaryButton label="Anmelden" onPress={() => submit('signin')} />
          <PrimaryButton label="Account erstellen" secondary onPress={() => submit('signup')} />
        </>
      )}
    </ScrollView>
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
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View style={{ backgroundColor: CARD, borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Pressable onPress={onClose}><Text style={{ color: MUTED, fontSize: 16 }}>Abbrechen</Text></Pressable>
            <Text style={{ color: TEXT, fontSize: 17, fontWeight: '800' }}>Menge & Einheit</Text>
            <Pressable onPress={() => onDone(draftAmount, draftUnit)}><Text style={{ color: GREEN, fontSize: 16, fontWeight: '800' }}>Fertig</Text></Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Picker selectedValue={draftAmount} onValueChange={(value) => setDraftAmount(Number(value))} itemStyle={{ color: TEXT }} themeVariant="dark">
                {AMOUNTS.map((value) => <Picker.Item key={value} label={String(value).replace('.5', ',5')} value={value} />)}
              </Picker>
            </View>
            <View style={{ flex: 1 }}>
              <Picker selectedValue={draftUnit} onValueChange={(value) => setDraftUnit(String(value))} itemStyle={{ color: TEXT }} themeVariant="dark">
                {UNITS.map((value) => <Picker.Item key={value} label={value} value={value} />)}
              </Picker>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function PlanScreen({ meals, setMeals }: { meals: Record<string, string>; setMeals: React.Dispatch<React.SetStateAction<Record<string, string>>> }) {
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [mealText, setMealText] = useState('');

  const edit = (day: string) => {
    setEditingDay(day);
    setMealText(meals[day] ?? '');
    Haptics.selectionAsync().catch(() => undefined);
  };

  const persist = async () => {
    if (!editingDay) return;
    const value = mealText.trim();
    setMeals((current) => ({ ...current, [editingDay]: value }));
    try { await saveMeal(editingDay, value || null); } catch {}
    setEditingDay(null);
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 18, paddingBottom: 120, gap: 12 }}>
      <Text style={{ color: TEXT, fontSize: 32, fontWeight: '900' }}>Wochenplan</Text>
      <Text style={{ color: MUTED, fontSize: 15 }}>Nur Abendessen – schnell und übersichtlich.</Text>
      {DAYS.map((day) => (
        <Pressable key={day} onPress={() => edit(day)} style={({ pressed }) => ({ backgroundColor: CARD, borderRadius: 20, padding: 17, gap: 5, opacity: pressed ? 0.75 : 1 })}>
          <Text style={{ color: MUTED, fontSize: 13, fontWeight: '800' }}>{day.toUpperCase()}</Text>
          <Text style={{ color: TEXT, fontSize: 18, fontWeight: '700' }}>{meals[day] || 'Abendessen auswählen'}</Text>
        </Pressable>
      ))}
      <Modal transparent visible={Boolean(editingDay)} animationType="fade" onRequestClose={() => setEditingDay(null)}>
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.65)' }}>
          <View style={{ backgroundColor: CARD, borderRadius: 24, padding: 20, gap: 14 }}>
            <Text style={{ color: TEXT, fontSize: 22, fontWeight: '900' }}>{editingDay}</Text>
            <TextInput autoFocus value={mealText} onChangeText={setMealText} placeholder="z. B. Spaghetti Bolognese" placeholderTextColor={MUTED} style={{ backgroundColor: CARD_2, color: TEXT, padding: 15, borderRadius: 14, fontSize: 16 }} />
            <PrimaryButton label="Speichern" onPress={persist} />
            <PrimaryButton label="Abbrechen" secondary onPress={() => setEditingDay(null)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

function ShoppingScreen({ items, setItems }: { items: ShoppingItem[]; setItems: React.Dispatch<React.SetStateAction<ShoppingItem[]>> }) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState('Stk.');
  const [pickerOpen, setPickerOpen] = useState(false);

  const add = async () => {
    const cleanName = name.trim();
    if (!cleanName) return;
    const temporary: ShoppingItem = { id: `local-${Date.now()}`, name: cleanName, amount, unit, done: false };
    setItems((current) => [temporary, ...current]);
    setName('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    try {
      const remote = await addShoppingItem({ name: cleanName, amount, unit });
      if (remote) setItems((current) => current.map((item) => item.id === temporary.id ? remote : item));
    } catch {}
  };

  const toggle = async (item: ShoppingItem) => {
    setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, done: !entry.done } : entry));
    try { await setShoppingDone(item.id, !item.done); } catch {}
  };

  const remove = async (item: ShoppingItem) => {
    setItems((current) => current.filter((entry) => entry.id !== item.id));
    try { await deleteShoppingItem(item.id); } catch {}
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, paddingBottom: 120, gap: 14 }}>
      <Text style={{ color: TEXT, fontSize: 32, fontWeight: '900' }}>Einkaufsliste</Text>
      <View style={{ backgroundColor: CARD, borderRadius: 20, padding: 14, gap: 10 }}>
        <TextInput value={name} onChangeText={setName} onSubmitEditing={add} placeholder="Produkt hinzufügen" placeholderTextColor={MUTED} style={{ backgroundColor: CARD_2, color: TEXT, padding: 15, borderRadius: 14, fontSize: 16 }} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Pressable onPress={() => setPickerOpen(true)} style={{ flex: 1, backgroundColor: CARD_2, borderRadius: 14, padding: 14 }}>
            <Text style={{ color: MUTED, fontSize: 12, fontWeight: '700' }}>MENGE</Text>
            <Text style={{ color: TEXT, fontSize: 17, fontWeight: '700' }}>{String(amount).replace('.5', ',5')} {unit}</Text>
          </Pressable>
          <Pressable onPress={add} style={{ backgroundColor: GREEN, borderRadius: 14, paddingHorizontal: 20, justifyContent: 'center' }}>
            <Text style={{ color: '#0A1205', fontWeight: '900', fontSize: 18 }}>+</Text>
          </Pressable>
        </View>
      </View>
      {items.map((item) => (
        <View key={item.id} style={{ backgroundColor: CARD, borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Pressable onPress={() => toggle(item)} style={{ width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: item.done ? GREEN : '#606870', backgroundColor: item.done ? GREEN : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: '#081104', fontWeight: '900' }}>{item.done ? '✓' : ''}</Text>
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={{ color: item.done ? MUTED : TEXT, fontSize: 17, fontWeight: '700', textDecorationLine: item.done ? 'line-through' : 'none' }}>{item.name}</Text>
            <Text style={{ color: MUTED }}>{String(item.amount).replace('.5', ',5')} {item.unit}</Text>
          </View>
          <Pressable onPress={() => remove(item)} hitSlop={10}><Text style={{ color: '#F08B8B', fontSize: 22 }}>×</Text></Pressable>
        </View>
      ))}
      <QuantitySheet visible={pickerOpen} amount={amount} unit={unit} onClose={() => setPickerOpen(false)} onDone={(nextAmount, nextUnit) => { setAmount(nextAmount); setUnit(nextUnit); setPickerOpen(false); }} />
    </ScrollView>
  );
}

function RecipeDetail({ recipe, onClose, onAddIngredients, onPlan }: { recipe: Recipe | null; onClose: () => void; onAddIngredients: (recipe: Recipe) => void; onPlan: (recipe: Recipe) => void }) {
  return (
    <Modal visible={Boolean(recipe)} animationType="slide" onRequestClose={onClose}>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ minHeight: '100%', backgroundColor: BG, padding: 18, gap: 12 }}>
        <Pressable onPress={onClose}><Text style={{ color: GREEN, fontSize: 16 }}>‹ Zurück</Text></Pressable>
        {recipe?.image ? <Image source={{ uri: recipe.image }} style={{ width: '100%', height: 220, borderRadius: 22, backgroundColor: CARD }} /> : null}
        <Text style={{ color: TEXT, fontSize: 28, fontWeight: '900' }}>{recipe?.title}</Text>
        <Text style={{ color: MUTED }}>{recipe?.source ?? 'Internet-Rezept'}</Text>
        <Text style={{ color: TEXT, fontSize: 20, fontWeight: '800', marginTop: 6 }}>Zutaten</Text>
        {recipe?.ingredients.map((ingredient, index) => (
          <Text key={`${ingredient.name}-${index}`} style={{ color: TEXT, fontSize: 16, lineHeight: 25 }}>• {ingredient.name}{ingredient.amount ? ` · ${Number(ingredient.amount).toFixed(1).replace('.0', '')}` : ''}{ingredient.unit ? ` ${ingredient.unit}` : ''}</Text>
        ))}
        {recipe ? <PrimaryButton label="Zutaten zur Einkaufsliste" onPress={() => onAddIngredients(recipe)} /> : null}
        {recipe ? <PrimaryButton label="Als Abendessen einplanen" secondary onPress={() => onPlan(recipe)} /> : null}
      </ScrollView>
    </Modal>
  );
}

function RecipesScreen({ onAddIngredients, onPlan }: { onAddIngredients: (recipe: Recipe) => void; onPlan: (recipe: Recipe) => void }) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [selected, setSelected] = useState<Recipe | null>(null);

  const runSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      setRecipes(await searchRecipes(query));
    } catch (error: any) {
      Alert.alert('Rezeptsuche', error?.message ?? 'Suche fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, paddingBottom: 120, gap: 14 }}>
      <Text style={{ color: TEXT, fontSize: 32, fontWeight: '900' }}>Rezepte</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput value={query} onChangeText={setQuery} onSubmitEditing={runSearch} returnKeyType="search" placeholder="Rezepte im Internet suchen …" placeholderTextColor={MUTED} style={{ flex: 1, backgroundColor: CARD, color: TEXT, paddingHorizontal: 14, borderRadius: 16, fontSize: 16 }} />
        <Pressable onPress={runSearch} style={{ backgroundColor: GREEN, paddingHorizontal: 17, borderRadius: 16, justifyContent: 'center' }}><Text style={{ color: '#0A1205', fontWeight: '900' }}>Suchen</Text></Pressable>
      </View>
      {loading ? <ActivityIndicator color={GREEN} /> : null}
      {recipes.map((recipe) => (
        <Pressable key={recipe.id} onPress={() => setSelected(recipe)} style={{ backgroundColor: CARD, borderRadius: 20, overflow: 'hidden' }}>
          {recipe.image ? <Image source={{ uri: recipe.image }} style={{ width: '100%', height: 180, backgroundColor: CARD_2 }} resizeMode="cover" /> : null}
          <View style={{ padding: 15, gap: 4 }}>
            <Text style={{ color: TEXT, fontSize: 19, fontWeight: '900' }}>{recipe.title}</Text>
            <Text style={{ color: MUTED }}>{recipe.source ?? 'Internet-Rezept'} · {recipe.ingredients.length} Zutaten</Text>
          </View>
        </Pressable>
      ))}
      <RecipeDetail
        recipe={selected}
        onClose={() => setSelected(null)}
        onAddIngredients={(recipe) => { onAddIngredients(recipe); setSelected(null); }}
        onPlan={(recipe) => { onPlan(recipe); setSelected(null); }}
      />
    </ScrollView>
  );
}

function DayPicker({ recipe, onClose, onSelect }: { recipe: Recipe | null; onClose: () => void; onSelect: (day: string) => void }) {
  return (
    <Modal transparent visible={Boolean(recipe)} animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.65)' }}>
        <View style={{ backgroundColor: CARD, borderRadius: 24, padding: 20, gap: 10 }}>
          <Text style={{ color: TEXT, fontSize: 21, fontWeight: '900' }}>Welcher Tag?</Text>
          <Text style={{ color: MUTED, marginBottom: 4 }}>{recipe?.title}</Text>
          {DAYS.map((day) => <PrimaryButton key={day} label={day} secondary onPress={() => onSelect(day)} />)}
          <PrimaryButton label="Abbrechen" secondary onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function MoreScreen() {
  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 18, paddingBottom: 120, gap: 14 }}>
      <Text style={{ color: TEXT, fontSize: 32, fontWeight: '900' }}>Mehr</Text>
      <View style={{ backgroundColor: CARD, borderRadius: 20, padding: 18, gap: 7 }}>
        <Text style={{ color: TEXT, fontSize: 18, fontWeight: '800' }}>Synchronisierung</Text>
        <Text style={{ color: MUTED, lineHeight: 21 }}>{isCloudConfigured ? 'Supabase Cloud ist verbunden. Derselbe Login synchronisiert deine Daten auf iPhone und Android.' : 'Demo-Modus: Trage deine Supabase-Werte in .env ein, um die gemeinsame Synchronisierung zu aktivieren.'}</Text>
      </View>
      <View style={{ backgroundColor: CARD, borderRadius: 20, padding: 18, gap: 7 }}>
        <Text style={{ color: TEXT, fontSize: 18, fontWeight: '800' }}>Installation</Text>
        <Text style={{ color: MUTED, lineHeight: 21 }}>iPhone: SideStore IPA. Android: installierbare APK. Beide Builds werden über GitHub Actions erzeugt.</Text>
      </View>
      {supabase ? <PrimaryButton label="Abmelden" secondary onPress={() => { supabase.auth.signOut().catch(() => undefined); }} /> : null}
    </ScrollView>
  );
}

function MainApp() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('plan');
  const [items, setItems] = useState<ShoppingItem[]>(isCloudConfigured ? [] : DEMO_ITEMS);
  const [meals, setMeals] = useState<Record<string, string>>({ Montag: 'Hühnercurry', Mittwoch: 'Ofenkartoffeln', Freitag: 'Pasta' });
  const [ready, setReady] = useState(!isCloudConfigured);
  const [recipeToPlan, setRecipeToPlan] = useState<Recipe | null>(null);

  useEffect(() => {
    if (!supabase) return;
    Promise.all([loadShopping(), loadMealPlan()])
      .then(([shopping, plan]) => {
        setItems(shopping);
        setMeals(Object.fromEntries(plan.map((entry) => [entry.day, entry.meal ?? ''])));
      })
      .catch(() => undefined)
      .finally(() => setReady(true));

    const channel = supabase.channel('mealflow-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items' }, () => loadShopping().then(setItems).catch(() => undefined))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_plan' }, () => loadMealPlan().then((plan) => setMeals(Object.fromEntries(plan.map((entry) => [entry.day, entry.meal ?? ''])))).catch(() => undefined))
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const addRecipeIngredients = (recipe: Recipe) => {
    const additions: ShoppingItem[] = recipe.ingredients.slice(0, 20).map((ingredient, index) => ({
      id: `recipe-${Date.now()}-${index}`,
      name: ingredient.name,
      amount: ingredient.amount ?? 1,
      unit: ingredient.unit && UNITS.includes(ingredient.unit) ? ingredient.unit : 'Stk.',
      done: false,
    }));
    setItems((current) => [...additions, ...current]);
    additions.forEach((item) => addShoppingItem({ name: item.name, amount: item.amount, unit: item.unit }).catch(() => undefined));
    setTab('shopping');
  };

  const planRecipe = async (day: string) => {
    if (!recipeToPlan) return;
    const title = recipeToPlan.title;
    setMeals((current) => ({ ...current, [day]: title }));
    setRecipeToPlan(null);
    setTab('plan');
    try { await saveMeal(day, title); } catch {}
  };

  if (!ready) {
    return <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator size="large" color={GREEN} /></View>;
  }

  return (
    <View style={{ flex: 1, backgroundColor: BG, paddingTop: insets.top }}>
      {tab === 'plan' ? <PlanScreen meals={meals} setMeals={setMeals} /> : null}
      {tab === 'shopping' ? <ShoppingScreen items={items} setItems={setItems} /> : null}
      {tab === 'recipes' ? <RecipesScreen onAddIngredients={addRecipeIngredients} onPlan={setRecipeToPlan} /> : null}
      {tab === 'more' ? <MoreScreen /> : null}
      <View style={{ position: 'absolute', left: 12, right: 12, bottom: Math.max(insets.bottom, 10), backgroundColor: '#111519F2', borderRadius: 22, padding: 6, flexDirection: 'row', gap: 4 }}>
        {([['plan', 'Plan'], ['shopping', 'Einkauf'], ['recipes', 'Rezepte'], ['more', 'Mehr']] as [Tab, string][]).map(([key, label]) => (
          <Pressable key={key} onPress={() => { setTab(key); Haptics.selectionAsync().catch(() => undefined); }} style={{ flex: 1, paddingVertical: 12, borderRadius: 17, backgroundColor: tab === key ? CARD_2 : 'transparent' }}>
            <Text style={{ color: tab === key ? GREEN : MUTED, fontSize: 13, fontWeight: '800', textAlign: 'center' }}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <DayPicker recipe={recipeToPlan} onClose={() => setRecipeToPlan(null)} onSelect={planRecipe} />
    </View>
  );
}

function Root() {
  const [authenticated, setAuthenticated] = useState(!isCloudConfigured);
  const [checking, setChecking] = useState(isCloudConfigured);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setAuthenticated(Boolean(data.session));
      setChecking(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setAuthenticated(Boolean(session)));
    return () => data.subscription.unsubscribe();
  }, []);

  if (checking) return <View style={{ flex: 1, backgroundColor: BG, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={GREEN} /></View>;
  return <>{authenticated ? <MainApp /> : <AuthScreen />}<StatusBar style="light" /></>;
}

export default function App() {
  return <SafeAreaProvider><Root /></SafeAreaProvider>;
}
