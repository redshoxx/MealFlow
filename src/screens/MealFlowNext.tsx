import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Appearance, Image, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, StyleSheet, Switch, Text, TextInput,
  useWindowDimensions, View
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  addShoppingItem, clearHouseholdCache, createHouseholdJoinCode, joinHouseholdByCode,
  loadHousehold, loadShopping, saveMeal, saveSaskiaMeal, setShoppingDone,
  updateShoppingItem, deleteShoppingItem, type Household, type ShoppingItem
} from '../lib/cloud';
import { DEFAULT_PREFERENCES, loadPreferences, savePreferences, type AppPreferences } from '../lib/preferences';
import { supabase } from '../lib/supabase';
import {
  CATEGORY_NAMES, GROCERY_CATEGORIES, formatAmount, groceryCategory, guessCategory,
  iso, loadDishCollection, loadWeek, loadWeeklyChecks, updateWeeklyCheck, normalize, saveDish, weekDates, weekStart,
  weeklyGroceries, type Dish, type Grocery, type MealSlot, type PlannedDay, type WeeklyCheckState
} from '../lib/mealflowNext';

type IconName = React.ComponentProps<typeof MaterialCommunityIcons>['name'];
type Palette = { background: string; card: string; soft: string; input: string; text: string; muted: string; border: string; olive: string; oliveDeep: string; accentSoft: string; gold: string; pill: string; nav: string };
type Page = 'gerichte' | 'woche' | 'einkauf' | 'einstellungen';
const PALETTES: Record<'normal' | 'cozy' | 'dark' | 'cozyDark', Palette> = {
  normal: { background: '#F9F7F2', card: '#FFFDF9', soft: '#F0EEE6', input: '#F5F2EC', text: '#24271E', muted: '#7A796F', border: '#EAE5DB', olive: '#56683D', oliveDeep: '#3B4C2A', accentSoft: '#E5EBD9', gold: '#B98148', pill: '#F1E9DD', nav: '#FFFDF8' },
  cozy: { background: '#F9EBDD', card: '#FFF7EC', soft: '#F4E4D2', input: '#F5E8D7', text: '#3C3025', muted: '#887563', border: '#E9D4BE', olive: '#607040', oliveDeep: '#48572E', accentSoft: '#E6E9D4', gold: '#BB814B', pill: '#F5DFC8', nav: '#FFF2E3' },
  dark: { background: '#171914', card: '#22251E', soft: '#2B3025', input: '#30352A', text: '#F2EEE5', muted: '#B8B9AC', border: '#394035', olive: '#889A6B', oliveDeep: '#5B754A', accentSoft: '#374431', gold: '#D7A16F', pill: '#383629', nav: '#22251E' },
  cozyDark: { background: '#211B15', card: '#30251D', soft: '#3C3026', input: '#46382B', text: '#FAECDD', muted: '#C1AA96', border: '#4E3D30', olive: '#9DAF79', oliveDeep: '#607348', accentSoft: '#42432F', gold: '#E0A873', pill: '#4B3729', nav: '#30251D' }
};
const DISH_PHOTOS: Array<[RegExp, string]> = [
  [/pasta|nudel|spaghetti/i, 'https://images.unsplash.com/photo-1473093295043-cdd812d0e601?w=480&q=80'],
  [/salat|bowl|gemüse|veggie/i, 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=480&q=80'],
  [/hendl|huhn|chicken/i, 'https://images.unsplash.com/photo-1532550907401-a500c9a57435?w=480&q=80'],
  [/curry/i, 'https://images.unsplash.com/photo-1603894584373-5ac82b2ae398?w=480&q=80'],
  [/toast|avocado/i, 'https://images.unsplash.com/photo-1525351484163-7529414344d8?w=480&q=80'],
  [/lachs|salmon|fisch/i, 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=480&q=80']
];
function getPhoto(dish: Dish): string | null {
  const value = dish.imageUrl.trim();
  if (/^https:\/\//i.test(value)) return value;
  return DISH_PHOTOS.find(([rule]) => rule.test(dish.title))?.[1] ?? null;
}
function MIcon({ name, size = 20, color }: { name: IconName; size?: number; color: string }) {
  return <MaterialCommunityIcons name={name} size={size} color={color} />;
}
function Header({ title, subtitle, right, c }: { title: string; subtitle?: string; right?: React.ReactNode; c: Palette }) {
  return <View style={s.header}>
    <View style={{ flex: 1 }}>
      <Text style={[s.heading, { color: c.text }]}>{title}</Text>
      {subtitle ? <Text style={[s.subtitle, { color: c.muted }]}>{subtitle}</Text> : null}
    </View>{right}
  </View>;
}
function SolidButton({ label, onPress, icon, c, secondary, disabled }: { label: string; onPress: () => void; icon?: IconName; c: Palette; secondary?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={({ pressed }) => [s.primaryButton, { backgroundColor: secondary ? c.soft : c.oliveDeep, opacity: disabled ? .5 : pressed ? .83 : 1 }]}>
    {icon ? <MIcon name={icon} size={19} color={secondary ? c.text : '#FFFFFF'} /> : null}
    <Text style={[s.primaryLabel, { color: secondary ? c.text : '#FFFFFF' }]}>{label}</Text>
  </Pressable>;
}
function IconButton({ name, onPress, c, label }: { name: IconName; onPress: () => void; c: Palette; label: string }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[s.iconButton, { backgroundColor: c.input }]}>
    <MIcon name={name} color={c.text} size={21} />
  </Pressable>;
}
function Badge({ text, c, warm }: { text: string; c: Palette; warm?: boolean }) {
  return <View style={[s.badge, { backgroundColor: warm ? c.pill : c.accentSoft }]}>
    <Text style={[s.badgeText, { color: warm ? c.gold : c.oliveDeep }]} numberOfLines={1}>{text}</Text>
  </View>;
}
function DishPhoto({ dish, size = 68, c }: { dish: Dish; size?: number; c: Palette }) {
  const [failed, setFailed] = useState(false);
  const uri = getPhoto(dish);
  useEffect(() => setFailed(false), [uri]);
  return <View style={{ width: size, height: size, borderRadius: 14, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
    {uri && !failed ? <Image source={{ uri }} style={{ width: size, height: size }} resizeMode="cover" onError={() => setFailed(true)} /> : <MIcon name="silverware-fork-knife" color={c.olive} size={Math.min(29, size / 2)} />}
  </View>;
}
function PageCaption({ children, c }: { children: React.ReactNode; c: Palette }) {
  return <Text style={[s.section, { color: c.text }]}>{children}</Text>;
}
function Input({ value, onChangeText, placeholder, c, multiline, keyboardType }: { value: string; onChangeText: (v: string) => void; placeholder: string; c: Palette; multiline?: boolean; keyboardType?: 'numeric' | 'default' }) {
  return <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={c.muted}
    multiline={multiline} keyboardType={keyboardType} textAlignVertical={multiline ? 'top' : 'center'}
    style={[s.input, { color: c.text, backgroundColor: c.input, borderColor: c.border }, multiline && { minHeight: 94, paddingTop: 13 }]} />;
}
function AddRemove({ value, onChange, c, min = 1, max = 20 }: { value: number; onChange: (v: number) => void; c: Palette; min?: number; max?: number }) {
  return <View style={s.stepper}>
    <Pressable accessibilityLabel="Verringern" onPress={() => onChange(Math.max(min, value - 1))} style={[s.stepControl, { backgroundColor: c.soft }]}><MIcon name="minus" size={19} color={c.text} /></Pressable>
    <Text style={[s.stepNumber, { color: c.text }]}>{value}</Text>
    <Pressable accessibilityLabel="Erhöhen" onPress={() => onChange(Math.min(max, value + 1))} style={[s.stepControl, { backgroundColor: c.soft }]}><MIcon name="plus" size={19} color={c.text} /></Pressable>
  </View>;
}
function dateText(date: Date): string {
  return date.toLocaleDateString('de-AT', { day: '2-digit', month: 'short' });
}
function paragraphError(error: unknown): string {
  return error instanceof Error ? error.message : 'Bitte versuche es erneut.';
}

export default function MealFlowNext() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [preferences, setPreferences] = useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [themeLoaded, setThemeLoaded] = useState(false);
  const [systemScheme, setSystemScheme] = useState(Appearance.getColorScheme());
  const [page, setPage] = useState<Page>('gerichte');
  const [household, setHousehold] = useState<Household | null>(null);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [days, setDays] = useState<PlannedDay[]>([]);
  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  const [weeklyChecks, setWeeklyChecks] = useState<WeeklyCheckState>({ available: false, checked: {} });
  const [weekOffset, setWeekOffset] = useState(0);
  const weekOffsetRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('Alle');
  const [editor, setEditor] = useState<Dish | 'new' | null>(null);
  const [name, setName] = useState('');
  const [recipeCategory, setRecipeCategory] = useState('Hauptgerichte');
  const [minutes, setMinutes] = useState('20');
  const [difficulty, setDifficulty] = useState('Einfach');
  const [servings, setServings] = useState(2);
  const [photoUrl, setPhotoUrl] = useState('');
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [ingredientInput, setIngredientInput] = useState('');
  const [steps, setSteps] = useState<string[]>([]);
  const [dayEditor, setDayEditor] = useState<{ date: string; slot: MealSlot } | null>(null);
  const [planTitle, setPlanTitle] = useState('');
  const [planSearch, setPlanSearch] = useState('');
  const [portions, setPortions] = useState(2);
  const [shoppingEditor, setShoppingEditor] = useState<ShoppingItem | 'new' | null>(null);
  const [itemName, setItemName] = useState('');
  const [itemAmount, setItemAmount] = useState('1');
  const [itemUnit, setItemUnit] = useState('Stk.');
  const [joinCode, setJoinCode] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const isDark = preferences.themeMode === 'dark' || (preferences.themeMode === 'system' && systemScheme === 'dark');
  const c = isDark ? PALETTES[preferences.cozyMode ? 'cozyDark' : 'dark'] : PALETTES[preferences.cozyMode ? 'cozy' : 'normal'];

  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => setSystemScheme(colorScheme));
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    let alive = true;
    loadPreferences().then(p => { if (alive) { setPreferences(p); setThemeLoaded(true); } })
      .catch(() => setThemeLoaded(true));
    return () => { alive = false; };
  }, []);
  const reload = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    try {
      const hh = await loadHousehold();
      const [newDishes, newDays, newShopping, newChecks] = await Promise.all([
        loadDishCollection(), loadWeek(weekStart(weekOffsetRef.current)), loadShopping(), loadWeeklyChecks(weekStart(weekOffsetRef.current))
      ]);
      setHousehold(hh);
      setDishes(newDishes);
      setDays(newDays);
      setShopping(newShopping);
      setWeeklyChecks(newChecks);
      setMessage('');
    } catch (error) { setMessage('Synchronisierung: ' + paragraphError(error)); }
    finally { setLoading(false); }
  }, []);
  const refreshShopping = useCallback(async () => {
    try { setShopping(await loadShopping()); } catch (error) { setMessage(paragraphError(error)); }
  }, []);
  useEffect(() => { void reload(true); }, [reload]);
  useEffect(() => {
    if (!household) return;
    const channel = supabase.channel('mealflow-next-' + household.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_plan_entries', filter: 'household_id=eq.' + household.id }, () => { void reload(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'custom_recipes', filter: 'household_id=eq.' + household.id }, () => { void reload(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items', filter: 'household_id=eq.' + household.id }, () => { void refreshShopping(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mealflow_weekly_checks', filter: 'household_id=eq.' + household.id }, () => { void loadWeeklyChecks(weekStart(weekOffsetRef.current)).then(setWeeklyChecks); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [household?.id, reload, refreshShopping]);
  const moveWeek = (delta: number) => {
    const next = weekOffsetRef.current + delta;
    weekOffsetRef.current = next;
    setWeekOffset(next);
    Promise.all([loadWeek(weekStart(next)), loadWeeklyChecks(weekStart(next))]).then(([plan, checks]) => { setDays(plan); setWeeklyChecks(checks); }).catch(error => setMessage(paragraphError(error)));
  };
  const changePrefs = (patch: Partial<AppPreferences>) => {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    void savePreferences(next).catch(error => setMessage(paragraphError(error)));
  };
  const notify = async (action: () => Promise<void>, reloadAll = true) => {
    if (busy) return;
    setBusy(true);
    try { await action(); if (reloadAll) await reload(); else await refreshShopping(); }
    catch (error) { setMessage(paragraphError(error)); }
    finally { setBusy(false); }
  };
  const startEdit = (dish?: Dish) => {
    setEditor(dish ?? 'new');
    setName(dish?.title ?? '');
    setRecipeCategory(dish?.category ?? 'Hauptgerichte');
    setMinutes(String(dish?.minutes || 20));
    setDifficulty(dish?.difficulty ?? 'Einfach');
    setServings(dish?.servings ?? 2);
    setPhotoUrl(dish?.imageUrl ?? '');
    setIngredients(dish?.ingredients ?? []);
    setIngredientInput('');
    setSteps(dish?.instructions ? dish.instructions.split(/\n+/) : []);
  };
  const saveEditedDish = () => notify(async () => {
    const dishName = name.trim();
    if (!dishName) throw new Error('Bitte einen Gerichtsnamen eingeben.');
    if (dishes.some(d => normalize(d.title) === normalize(dishName) && d.id !== (typeof editor === 'object' ? editor?.id : undefined))) {
      throw new Error('Dieses Gericht existiert bereits in deiner Sammlung.');
    }
    await saveDish({
      title: dishName, category: recipeCategory, minutes: Math.max(0, Number(minutes) || 0),
      difficulty, servings, imageUrl: photoUrl,
      ingredients: [...ingredients, ingredientInput].map(x => x.trim()).filter(Boolean),
      instructions: steps.map(x => x.trim()).filter(Boolean).join('\n')
    }, typeof editor === 'object' ? editor : null);
    setEditor(null);
  });
  const openPlan = (date: string, slot: MealSlot = 'main') => {
    const found = days.find(day => day.plannedDate === date);
    const current = slot === 'main' ? found?.meal : found?.mealSaskia;
    setDayEditor({ date, slot });
    setPlanTitle(current ?? '');
    setPortions(slot === 'main' ? (found?.mealPortions ?? 2) : (found?.mealSaskiaPortions ?? 2));
    setPlanSearch('');
  };
  const commitPlan = () => notify(async () => {
    if (!dayEditor) return;
    const title = planTitle.trim();
    if (dayEditor.slot === 'main') await saveMeal(dayEditor.date, title || null);
    else await saveSaskiaMeal(dayEditor.date, title || null);
    const householdId = household?.id;
    if (householdId && title) {
      const column = dayEditor.slot === 'main' ? 'meal_portions' : 'meal_saskia_portions';
      const { error } = await supabase.from('meal_plan_entries').update({ [column]: portions })
        .eq('household_id', householdId).eq('planned_date', dayEditor.date);
      if (error) throw error;
    }
    setDayEditor(null);
  });
  const shopEdit = (item?: ShoppingItem) => {
    setShoppingEditor(item ?? 'new');
    setItemName(item?.name ?? '');
    setItemAmount(item ? String(item.amount) : '1');
    setItemUnit(item?.unit ?? 'Stk.');
  };
  const saveShopping = () => notify(async () => {
    const value = Number(itemAmount.replace(',', '.'));
    if (!itemName.trim() || !Number.isFinite(value) || value <= 0) throw new Error('Bitte Produkt und gültige Menge eingeben.');
    if (shoppingEditor && shoppingEditor !== 'new') await updateShoppingItem(shoppingEditor.id, { name: itemName.trim(), amount: value, unit: itemUnit });
    else await addShoppingItem({ name: itemName.trim(), amount: value, unit: itemUnit });
    setShoppingEditor(null);
  }, false);
  const grouped = useMemo(() => weeklyGroceries(days, dishes, shopping, weeklyChecks), [days, dishes, shopping, weeklyChecks]);
  const foundDishes = useMemo(() => dishes.filter(d => (category === 'Alle' || d.category === category)
    && (!search.trim() || normalize(d.title).includes(normalize(search)))), [dishes, category, search]);
  const dates = weekDates(weekStart(weekOffset));
  const plannedCount = days.reduce((total, item) => total + Number(Boolean(item.meal)) + Number(Boolean(item.mealSaskia)), 0);
  const shoppingDone = grouped.items.filter(x => x.done).length;
  const shoppingGroups = [...GROCERY_CATEGORIES.map(x => x.title), 'Sonstiges'].map(title => ({
    title, category: GROCERY_CATEGORIES.find(x => x.title === title),
    items: grouped.items.filter(item => groceryCategory(item.name) === title)
  })).filter(group => group.items.length);
  const renderBody = () => {
    if (page === 'gerichte') return <>
      <Header title="Meine Gerichte" subtitle="Aus deinem Wochenplan gespeichert" c={c} right={<IconButton name="tune-variant" label="Kategorien" c={c} onPress={() => setCategory('Alle')} />} />
      <View style={[s.searchbar, { backgroundColor: c.input }]}>
        <MIcon name="magnify" color={c.muted} size={20} />
        <TextInput value={search} onChangeText={setSearch} placeholder="Gerichte suchen ..." placeholderTextColor={c.muted} style={[s.searchInput, { color: c.text }]} />
        {search ? <Pressable onPress={() => setSearch('')}><MIcon name="close" color={c.muted} size={18} /></Pressable> : null}
      </View>
      <SolidButton label="Neues Gericht" icon="plus" c={c} onPress={() => startEdit()} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        {CATEGORY_NAMES.map(chip => <Pressable key={chip} onPress={() => setCategory(chip)} style={[s.chip, { backgroundColor: chip === category ? c.olive : c.soft }]}>
          <Text style={[s.chipText, { color: chip === category ? '#FFFFFF' : c.muted }]}>{chip}</Text>
        </Pressable>)}
      </ScrollView>
      {foundDishes.length ? foundDishes.map(dish => <Pressable key={dish.id} accessibilityRole="button" onPress={() => startEdit(dish)}
        style={({ pressed }) => [s.dishRow, { backgroundColor: c.card, borderColor: c.border, opacity: pressed ? .8 : 1 }]}>
        <DishPhoto dish={dish} c={c} size={70} />
        <View style={s.flex}>
          <Text style={[s.dishTitle, { color: c.text }]} numberOfLines={2}>{dish.title}</Text>
          <Text style={[s.tiny, { color: c.muted }]}>{dish.minutes ? String(dish.minutes) + ' Min. · ' : ''}{dish.ingredients.length ? dish.ingredients.length + ' Zutaten' : 'Zutaten ergänzen'}</Text>
          <View style={{ alignSelf: 'flex-start', marginTop: 5 }}><Badge text={dish.category} c={c} warm={dish.category === 'Pasta' || dish.category === 'Frühstück'} /></View>
        </View>
        <MIcon name="pencil-outline" color={c.oliveDeep} size={21} />
      </Pressable>) : <View style={[s.empty, { backgroundColor: c.card, borderColor: c.border }]}>
        <MIcon name="book-open-page-variant-outline" size={34} color={c.olive} />
        <Text style={[s.emptyTitle, { color: c.text }]}>Noch keine Gerichte gefunden</Text>
        <Text style={[s.smallText, { color: c.muted, textAlign: 'center' }]}>Sobald du ein Gericht einplanst, erscheint es hier. Du kannst auch selbst eines anlegen.</Text>
      </View>}
    </>;

    if (page === 'woche') return <>
      <Header title="Wochenplan" subtitle="Schnell und einfach Gerichte planen" c={c} right={<IconButton name="calendar-month-outline" c={c} label="Zur aktuellen Woche" onPress={() => { weekOffsetRef.current = 0; setWeekOffset(0); void Promise.all([loadWeek(weekStart(0)), loadWeeklyChecks(weekStart(0))]).then(([plan, checks]) => { setDays(plan); setWeeklyChecks(checks); }); }} />} />
      <View style={s.weekToolbar}>
        <IconButton name="chevron-left" label="Vorige Woche" c={c} onPress={() => moveWeek(-1)} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[s.weekDate, { color: c.text }]}>{dateText(dates[0]!)} – {dateText(dates[6]!)}</Text>
          <Text style={[s.tiny, { color: c.muted }]}>{plannedCount} Gerichte geplant</Text>
        </View>
        <IconButton name="chevron-right" label="Nächste Woche" c={c} onPress={() => moveWeek(1)} />
      </View>
      <View style={[s.weekSummary, { backgroundColor: c.accentSoft }]}>
        <MIcon name="silverware-fork-knife" size={21} color={c.oliveDeep} />
        <Text style={[s.smallText, { color: c.oliveDeep, flex: 1 }]}>Deine Gerichte werden automatisch in „Meine Gerichte“ gesammelt.</Text>
      </View>
      {dates.map(date => {
        const key = iso(date);
        const planned = days.find(day => day.plannedDate === key);
        const meal = planned?.meal ? dishes.find(d => normalize(d.title) === normalize(planned.meal!)) : null;
        const secondary = planned?.mealSaskia ? dishes.find(d => normalize(d.title) === normalize(planned.mealSaskia!)) : null;
        const isToday = key === iso(new Date());
        return <View key={key} style={[s.dayRow, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={[s.dayDate, { backgroundColor: isToday ? c.accentSoft : c.soft }]}>
            <Text style={[s.dayShort, { color: c.text }]}>{date.toLocaleDateString('de-AT', { weekday: 'short' }).replace('.', '')}</Text>
            <Text style={[s.tiny, { color: c.muted }]}>{dateText(date)}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => openPlan(key)} style={s.dayDish}>
            {planned?.meal ? <>
              {meal ? <DishPhoto dish={meal} c={c} size={54} /> : <View style={[s.plusPhoto, { backgroundColor: c.soft }]}><MIcon name="silverware-fork-knife" size={20} color={c.olive} /></View>}
              <View style={s.flex}>
                <Text style={[s.dayDishName, { color: c.text }]} numberOfLines={2}>{planned.meal}</Text>
                <Text style={[s.tiny, { color: c.muted }]}>{planned.mealPortions ?? 2} Portionen{meal?.minutes ? ' · ' + meal.minutes + ' Min.' : ''}</Text>
                {meal ? <View style={{ alignSelf: 'flex-start', marginTop: 4 }}><Badge text={meal.category} c={c} /></View> : null}
              </View>
            </> : <>
              <View style={[s.plusPhoto, { backgroundColor: c.soft }]}><MIcon name="plus" size={24} color={c.olive} /></View>
              <Text style={[s.smallText, { color: c.muted, flex: 1 }]}>Gericht hinzufügen</Text>
            </>}
            <MIcon name="chevron-right" color={c.muted} size={18} />
          </Pressable>
          {planned?.mealSaskia ? <Pressable onPress={() => openPlan(key, 'saskia')} style={[s.secondaryMeal, { borderTopColor: c.border }]}>
            <MIcon name="plus-circle-outline" color={c.olive} size={16} />
            <Text numberOfLines={1} style={[s.tiny, { color: c.text, flex: 1 }]}>{planned.mealSaskia} · {planned.mealSaskiaPortions ?? 2} Portionen</Text>
            {secondary ? <MIcon name="pencil-outline" color={c.muted} size={16} /> : null}
          </Pressable> : planned?.meal ? <Pressable onPress={() => openPlan(key, 'saskia')} style={[s.secondaryMeal, { borderTopColor: c.border }]}>
            <MIcon name="plus" color={c.muted} size={15} />
            <Text style={[s.tiny, { color: c.muted }]}>Weiteres Gericht</Text>
          </Pressable> : null}
        </View>;
      })}
      <SolidButton label="Gericht aus meiner Sammlung" icon="plus" c={c} onPress={() => openPlan(iso(dates.find(d => iso(d) >= iso(new Date())) ?? dates[0]!))} />
    </>;

    if (page === 'einkauf') return <>
      <Header title="Einkaufsliste" subtitle="Automatisch aus deinem Wochenplan" c={c} right={<IconButton name="plus" c={c} label="Produkt hinzufügen" onPress={() => shopEdit()} />} />
      <View style={[s.progressBox, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={s.progressLabels}><Text style={[s.smallText, { color: c.text, fontWeight: '700' }]}>Einkaufsfortschritt</Text><Text style={[s.tiny, { color: c.muted }]}>{shoppingDone} von {grouped.items.length} erledigt</Text></View>
        <View style={[s.progressRail, { backgroundColor: c.soft }]}><View style={[s.progressFill, { backgroundColor: c.olive, width: (grouped.items.length ? shoppingDone / grouped.items.length * 100 : 0) + '%' as any }]} /></View>
        <Text style={[s.tiny, { color: c.muted, marginTop: 7 }]}>Woche: {dateText(dates[0]!)} – {dateText(dates[6]!)}</Text>
      </View>
      {grouped.missing.length ? <Pressable onPress={() => { setPage('gerichte'); setSearch(grouped.missing[0] ?? ''); }} style={[s.notice, { backgroundColor: c.pill }]}>
        <MIcon name="information-outline" color={c.gold} size={20} />
        <Text style={[s.smallText, { color: c.text, flex: 1 }]}>{grouped.missing.length} Gericht(en) fehlen noch Zutaten. Tippe hier zum Ergänzen.</Text>
      </Pressable> : null}
      {shoppingGroups.length ? shoppingGroups.map(group => <View key={group.title} style={[s.shoppingGroup, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={[s.shoppingGroupHeader, { backgroundColor: c.soft }]}>
          <MIcon name={(group.category?.icon ?? 'format-list-bulleted') as IconName} color={c.oliveDeep} size={21} />
          <Text style={[s.groupTitle, { color: c.text }]}>{group.title}</Text>
          <Text style={[s.tiny, { color: c.muted }]}>{group.items.filter(i => i.done).length}/{group.items.length}</Text>
        </View>
        {group.items.map(item => <View key={item.key} style={[s.shoppingItem, { borderTopColor: c.border }]}>
          <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: item.done }} accessibilityLabel={item.name + ' abhaken'} disabled={busy}
            onPress={() => void notify(async () => {
              if (item.source === 'planned' && weeklyChecks.available) {
                await updateWeeklyCheck(weekStart(weekOffsetRef.current), item.key, !item.done);
                setWeeklyChecks(await loadWeeklyChecks(weekStart(weekOffsetRef.current)));
              } else if (item.saved) await setShoppingDone(item.saved.id, !item.done);
              else { const saved = await addShoppingItem({ name: item.name, amount: item.amount, unit: item.unit }); await setShoppingDone(saved.id, true); }
            }, false)} style={[s.checkbox, { borderColor: c.olive, backgroundColor: item.done ? c.olive : 'transparent' }]}>
            {item.done ? <MIcon name="check" color="#FFFFFF" size={16} /> : null}
          </Pressable>
          <Text style={[s.shopName, { color: item.done ? c.muted : c.text, textDecorationLine: item.done ? 'line-through' : 'none' }]} numberOfLines={2}>{item.name}</Text>
          <Text style={[s.shopQuantity, { color: c.muted }]}>{formatAmount(item.source === 'planned' ? item.amount : item.saved?.amount ?? item.amount)} {item.unit}</Text>
          {item.saved ? <Pressable accessibilityLabel={item.name + ' bearbeiten'} onPress={() => shopEdit(item.saved)}><MIcon name="pencil-outline" color={c.muted} size={17} /></Pressable> : null}
        </View>)}
      </View>) : <View style={[s.empty, { backgroundColor: c.card, borderColor: c.border }]}>
        <MIcon name="basket-outline" size={34} color={c.olive} />
        <Text style={[s.emptyTitle, { color: c.text }]}>Deine Einkaufsliste ist leer</Text>
        <Text style={[s.smallText, { color: c.muted, textAlign: 'center' }]}>Plane Gerichte mit Zutaten oder füge selbst ein Produkt hinzu.</Text>
      </View>}
      <SolidButton label="Produkt hinzufügen" icon="plus" c={c} onPress={() => shopEdit()} secondary />
    </>;

    return <>
      <Header title="Einstellungen" subtitle="MealFlow nach deinen Wünschen" c={c} />
      <View style={[s.settingsCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <View style={s.settingRow}>
          <View style={[s.settingIcon, { backgroundColor: c.pill }]}><MIcon name="weather-sunny" color={c.gold} size={25} /></View>
          <View style={s.flex}><Text style={[s.settingTitle, { color: c.text }]}>Cozy Mode</Text><Text style={[s.smallText, { color: c.muted }]}>Wärmere Farben, sanftere Stimmung für einen entspannten Alltag.</Text></View>
          <Switch accessibilityLabel="Cozy Mode" value={preferences.cozyMode} onValueChange={value => changePrefs({ cozyMode: value })} trackColor={{ false: c.soft, true: c.olive }} thumbColor="#FFFDF8" />
        </View>
      </View>
      <PageCaption c={c}>Darstellung</PageCaption>
      <View style={[s.settingsCard, { backgroundColor: c.card, borderColor: c.border }]}>
        <Text style={[s.settingTitle, { color: c.text }]}>Erscheinungsbild</Text>
        <View style={[s.segment, { backgroundColor: c.soft }]}>
          {(['system', 'light', 'dark'] as const).map(mode => <Pressable key={mode} onPress={() => changePrefs({ themeMode: mode })}
            style={[s.segmentItem, { backgroundColor: preferences.themeMode === mode ? c.olive : 'transparent' }]}>
            <Text style={[s.smallText, { color: preferences.themeMode === mode ? '#FFFFFF' : c.text, fontWeight: '700' }]}>{mode === 'system' ? 'System' : mode === 'light' ? 'Hell' : 'Dunkel'}</Text>
          </Pressable>)}
        </View>
      </View>
      <PageCaption c={c}>Haushalt & Synchronisierung</PageCaption>
      <View style={[s.settingsCard, { backgroundColor: c.card, borderColor: c.border, gap: 12 }]}>
        <Text style={[s.settingTitle, { color: c.text }]}>{household?.name ?? 'Haushalt'}</Text>
        <Text style={[s.smallText, { color: c.muted }]}>{household?.members.length ?? 0} Mitglieder · Deine Daten werden über Supabase synchronisiert.</Text>
        {household?.canInvite ? <><SolidButton label="Einladungscode erstellen" c={c} secondary icon="account-plus-outline" onPress={() => void notify(async () => setInviteCode(await createHouseholdJoinCode(household.id)), false)} />
          {inviteCode ? <Text selectable style={[s.invite, { color: c.oliveDeep, backgroundColor: c.accentSoft }]}>{inviteCode}</Text> : null}</> : null}
        <Input c={c} value={joinCode} onChangeText={setJoinCode} placeholder="Einladungscode zum Beitreten" />
        <SolidButton label="Haushalt beitreten" c={c} secondary disabled={!joinCode.trim()} onPress={() => void notify(async () => {
          await joinHouseholdByCode(joinCode); clearHouseholdCache(); setJoinCode('');
        })} />
      </View>
      <SolidButton label="Daten neu laden" icon="refresh" c={c} secondary onPress={() => void reload(true)} />
      <SolidButton label="Abmelden" icon="logout" c={c} secondary onPress={() => { void supabase.auth.signOut(); }} />
    </>;
  };
  const nav: { key: Page; name: string; icon: IconName; active: IconName }[] = [
    { key: 'gerichte', name: 'Gerichte', icon: 'silverware-fork-knife', active: 'silverware-fork-knife' },
    { key: 'woche', name: 'Wochenplan', icon: 'calendar-week-outline', active: 'calendar-week' },
    { key: 'einkauf', name: 'Einkaufsliste', icon: 'clipboard-list-outline', active: 'clipboard-list' },
    { key: 'einstellungen', name: 'Einstellungen', icon: 'cog-outline', active: 'cog' }
  ];
  if (!themeLoaded || (loading && !household)) return <View style={[s.full, { backgroundColor: c.background, justifyContent: 'center', alignItems: 'center', gap: 14 }]}>
    <MIcon name="leaf" color={c.olive} size={46} />
    <Text style={[s.heading, { color: c.text }]}>MealFlow</Text><ActivityIndicator color={c.olive} />
    {message ? <Text style={[s.smallText, { color: c.muted, textAlign: 'center', paddingHorizontal: 26 }]}>{message}</Text> : null}
    {message ? <SolidButton label="Erneut versuchen" c={c} onPress={() => void reload(true)} /> : null}
  </View>;
  return <SafeAreaView edges={['top', 'left', 'right']} style={[s.full, { backgroundColor: c.background }]}>
    <View style={[s.main, { maxWidth: width > 940 ? 860 : 650 }]}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, { paddingBottom: 26 }]}>
        {message ? <Pressable onPress={() => setMessage('')} style={[s.notice, { backgroundColor: c.pill }]}><MIcon name="alert-circle-outline" size={19} color={c.gold} /><Text style={[s.smallText, { color: c.text, flex: 1 }]}>{message}</Text><MIcon name="close" size={17} color={c.text} /></Pressable> : null}
        {renderBody()}
      </ScrollView>
      <View style={[s.nav, { backgroundColor: c.nav, borderTopColor: c.border, paddingBottom: Math.max(insets.bottom, 8) }]}>
        {nav.map(item => <Pressable key={item.key} accessibilityRole="tab" accessibilityState={{ selected: page === item.key }} onPress={() => setPage(item.key)}
          style={s.navItem}>
          <MIcon name={page === item.key ? item.active : item.icon} size={22} color={page === item.key ? c.olive : c.muted} />
          <Text style={[s.navText, { color: page === item.key ? c.oliveDeep : c.muted, fontWeight: page === item.key ? '800' : '500' }]} numberOfLines={1} adjustsFontSizeToFit>{item.name}</Text>
        </Pressable>)}
      </View>
    </View>

    <Modal visible={Boolean(editor)} animationType="slide" onRequestClose={() => setEditor(null)}>
      <SafeAreaView style={[s.modalFull, { backgroundColor: c.background }]} edges={['top', 'bottom']}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.full}>
          <View style={[s.modalTop, { borderBottomColor: c.border }]}>
            <IconButton name="chevron-left" c={c} label="Zurück" onPress={() => setEditor(null)} />
            <Text style={[s.modalTitle, { color: c.text }]}>Gericht bearbeiten</Text>
            <Pressable onPress={() => void saveEditedDish()} disabled={busy}><Text style={[s.saveText, { color: c.oliveDeep }]}>{busy ? '...' : 'Speichern'}</Text></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, { maxWidth: 650, alignSelf: 'center', width: '100%' }]}>
            {editor && editor !== 'new' ? <DishPhoto dish={editor} c={c} size={170} /> : <View style={[s.imageHero, { backgroundColor: c.accentSoft }]}><MIcon name="silverware-fork-knife" size={44} color={c.olive} /></View>}
            <Text style={[s.fieldTitle, { color: c.text }]}>Name des Gerichts</Text>
            <Input c={c} value={name} onChangeText={setName} placeholder="z. B. Cremige Tomaten-Pasta" />
            <Text style={[s.fieldTitle, { color: c.text }]}>Kategorie</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
              {CATEGORY_NAMES.slice(1).map(item => <Pressable key={item} onPress={() => setRecipeCategory(item)} style={[s.chip, { backgroundColor: recipeCategory === item ? c.olive : c.soft }]}>
                <Text style={[s.chipText, { color: recipeCategory === item ? '#FFF' : c.muted }]}>{item}</Text>
              </Pressable>)}
            </ScrollView>
            <View style={s.twoCols}>
              <View style={s.flex}><Text style={[s.fieldTitle, { color: c.text }]}>Zubereitungszeit</Text><Input c={c} value={minutes} onChangeText={setMinutes} placeholder="Minuten" keyboardType="numeric" /></View>
              <View style={s.flex}><Text style={[s.fieldTitle, { color: c.text }]}>Schwierigkeit</Text><View style={[s.segment, { backgroundColor: c.soft }]}>
                {['Einfach', 'Mittel'].map(value => <Pressable key={value} onPress={() => setDifficulty(value)} style={[s.segmentItem, { backgroundColor: difficulty === value ? c.olive : 'transparent' }]}>
                  <Text style={[s.tiny, { color: difficulty === value ? '#FFF' : c.text }]}>{value}</Text>
                </Pressable>)}
              </View></View>
            </View>
            <View style={[s.between, { marginTop: 5 }]}>
              <Text style={[s.fieldTitle, { color: c.text }]}>Zutaten ({servings} Portionen)</Text>
              <AddRemove value={servings} onChange={setServings} c={c} />
            </View>
            <View style={[s.editCard, { backgroundColor: c.card, borderColor: c.border }]}>
              {ingredients.map((value, index) => <View key={index} style={[s.ingredientLine, { borderBottomColor: c.border }]}>
                <Pressable accessibilityLabel="Zutat entfernen" onPress={() => setIngredients(current => current.filter((_, i) => i !== index))}><MIcon name="minus-circle-outline" size={22} color="#CB5E55" /></Pressable>
                <TextInput value={value} onChangeText={next => setIngredients(current => current.map((x, i) => i === index ? next : x))} style={[s.ingredientText, { color: c.text }]} placeholder="200 g Nudeln" placeholderTextColor={c.muted} />
              </View>)}
              <View style={s.ingredientLine}>
                <MIcon name="plus-circle-outline" size={22} color={c.olive} />
                <TextInput value={ingredientInput} onChangeText={setIngredientInput} onSubmitEditing={() => { if (ingredientInput.trim()) { setIngredients(current => [...current, ingredientInput.trim()]); setIngredientInput(''); } }} placeholder="z. B. 200 g Pasta" placeholderTextColor={c.muted} style={[s.ingredientText, { color: c.text }]} returnKeyType="done" />
                <Pressable accessibilityLabel="Zutat hinzufügen" onPress={() => { if (ingredientInput.trim()) { setIngredients(current => [...current, ingredientInput.trim()]); setIngredientInput(''); } }}><MIcon name="plus" size={23} color={c.olive} /></Pressable>
              </View>
            </View>
            <Text style={[s.smallText, { color: c.muted }]}>Bitte Mengen mit Einheit eingeben, z. B. „200 g Pasta“. Nur so kann die Einkaufsliste die Mengen zusammenfassen.</Text>
            <PageCaption c={c}>Zubereitung</PageCaption>
            {steps.map((step, index) => <View key={index} style={[s.stepLine, { backgroundColor: c.card, borderColor: c.border }]}>
              <View style={[s.stepBadge, { backgroundColor: c.pill }]}><Text style={{ color: c.gold, fontWeight: '800' }}>{index + 1}</Text></View>
              <TextInput value={step} multiline onChangeText={next => setSteps(current => current.map((v, i) => i === index ? next : v))}
                placeholder="Zubereitungsschritt" placeholderTextColor={c.muted} style={[s.ingredientText, { color: c.text }]} />
              <Pressable accessibilityLabel="Schritt entfernen" onPress={() => setSteps(current => current.filter((_, i) => i !== index))}><MIcon name="close" color={c.muted} size={19} /></Pressable>
            </View>)}
            <SolidButton label="Schritt hinzufügen" icon="plus" c={c} secondary onPress={() => setSteps(current => [...current, ''])} />
            <Text style={[s.fieldTitle, { color: c.text }]}>Bild (optional)</Text>
            <Input c={c} value={photoUrl} onChangeText={setPhotoUrl} placeholder="https://... Bildadresse" />
            <SolidButton label={busy ? 'Speichert ...' : 'Gericht speichern'} icon="content-save-outline" c={c} disabled={busy} onPress={() => void saveEditedDish()} />
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>

    <Modal visible={Boolean(dayEditor)} transparent animationType="fade" onRequestClose={() => setDayEditor(null)}>
      <View style={s.overlay}>
        <View style={[s.dialog, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={s.between}><Text style={[s.modalTitle, { color: c.text }]}>Gericht auswählen</Text><IconButton name="close" c={c} label="Schließen" onPress={() => setDayEditor(null)} /></View>
          <Text style={[s.smallText, { color: c.muted }]}>{dayEditor ? new Date(dayEditor.date + 'T12:00:00').toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' }) : ''}</Text>
          <View style={[s.searchbar, { backgroundColor: c.input }]}><MIcon name="magnify" color={c.muted} /><TextInput value={planSearch} onChangeText={setPlanSearch} placeholder="Gericht suchen" placeholderTextColor={c.muted} style={[s.searchInput, { color: c.text }]} /></View>
          <ScrollView style={{ maxHeight: 260 }} keyboardShouldPersistTaps="handled">
            {dishes.filter(d => normalize(d.title).includes(normalize(planSearch))).map(d => <Pressable key={d.id} onPress={() => setPlanTitle(d.title)}
              style={[s.planPick, { borderBottomColor: c.border, backgroundColor: normalize(planTitle) === normalize(d.title) ? c.accentSoft : 'transparent' }]}>
              <DishPhoto dish={d} c={c} size={44} />
              <Text style={[s.smallText, { color: c.text, flex: 1 }]} numberOfLines={2}>{d.title}</Text>
              {normalize(planTitle) === normalize(d.title) ? <MIcon name="check-circle" color={c.olive} size={21} /> : null}
            </Pressable>)}
          </ScrollView>
          <View style={s.between}><Text style={[s.fieldTitle, { color: c.text }]}>Portionen</Text><AddRemove value={portions} onChange={setPortions} c={c} /></View>
          <SolidButton label="Gericht speichern" icon="check" c={c} disabled={busy || !planTitle} onPress={() => void commitPlan()} />
          {planTitle ? <SolidButton label="Tag leeren" c={c} secondary onPress={() => setPlanTitle('')} /> : null}
          <Pressable onPress={() => { setDayEditor(null); setPage('gerichte'); }}><Text style={[s.smallText, { color: c.oliveDeep, textAlign: 'center' }]}>Neues Gericht anlegen oder bearbeiten</Text></Pressable>
          {!planTitle && dayEditor ? <Pressable onPress={() => void commitPlan()}><Text style={[s.smallText, { color: c.gold, textAlign: 'center' }]}>Vorhandenes Gericht entfernen</Text></Pressable> : null}
        </View>
      </View>
    </Modal>

    <Modal visible={Boolean(shoppingEditor)} transparent animationType="fade" onRequestClose={() => setShoppingEditor(null)}>
      <View style={s.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[s.dialog, { backgroundColor: c.card, borderColor: c.border }]}>
          <View style={s.between}><Text style={[s.modalTitle, { color: c.text }]}>Produkt bearbeiten</Text><IconButton name="close" c={c} label="Schließen" onPress={() => setShoppingEditor(null)} /></View>
          <Text style={[s.fieldTitle, { color: c.text }]}>Produkt</Text><Input c={c} value={itemName} onChangeText={setItemName} placeholder="z. B. Milch" />
          <View style={s.twoCols}><View style={s.flex}><Text style={[s.fieldTitle, { color: c.text }]}>Menge</Text><Input c={c} value={itemAmount} onChangeText={setItemAmount} keyboardType="numeric" placeholder="1" /></View>
            <View style={s.flex}><Text style={[s.fieldTitle, { color: c.text }]}>Einheit</Text><Input c={c} value={itemUnit} onChangeText={setItemUnit} placeholder="Stk." /></View></View>
          <SolidButton c={c} label="Speichern" icon="check" disabled={busy} onPress={() => void saveShopping()} />
          {shoppingEditor && shoppingEditor !== 'new' ? <Pressable onPress={() => void notify(async () => {
            await deleteShoppingItem(shoppingEditor.id); setShoppingEditor(null);
          }, false)}><Text style={[s.smallText, { textAlign: 'center', color: '#C25C50' }]}>Produkt löschen</Text></Pressable> : null}
        </KeyboardAvoidingView>
      </View>
    </Modal>
  </SafeAreaView>;
}

const s = StyleSheet.create({
  full: { flex: 1 },
  main: { flex: 1, width: '100%', alignSelf: 'center' },
  content: { paddingHorizontal: 17, paddingTop: 24, gap: 13 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 3 },
  heading: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 30, letterSpacing: -.8, lineHeight: 37, fontWeight: '500' },
  subtitle: { fontSize: 12.5, marginTop: 3, lineHeight: 18 },
  iconButton: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  searchbar: { height: 43, borderRadius: 12, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, gap: 9 },
  searchInput: { flex: 1, fontSize: 13, paddingVertical: 7 },
  primaryButton: { minHeight: 44, borderRadius: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  primaryLabel: { fontSize: 13, fontWeight: '700' },
  chips: { gap: 7, paddingVertical: 1, paddingRight: 14 },
  chip: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 16 },
  chipText: { fontSize: 11, fontWeight: '700' },
  dishRow: { minHeight: 91, borderWidth: 1, borderRadius: 17, padding: 10, flexDirection: 'row', gap: 12, alignItems: 'center' },
  flex: { flex: 1 },
  dishTitle: { fontSize: 14, fontWeight: '700', lineHeight: 19 },
  tiny: { fontSize: 10.5, lineHeight: 15 },
  badge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  badgeText: { fontSize: 10, fontWeight: '700' },
  section: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 20, marginTop: 8 },
  empty: { padding: 27, borderWidth: 1, borderRadius: 18, gap: 9, alignItems: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  smallText: { fontSize: 12.5, lineHeight: 19 },
  nav: { flexDirection: 'row', borderTopWidth: 1, paddingTop: 11, paddingHorizontal: 3 },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4, paddingHorizontal: 1 },
  navText: { fontSize: 9.7 },
  weekToolbar: { flexDirection: 'row', alignItems: 'center', gap: 13, marginBottom: 4 },
  weekDate: { fontSize: 13.5, fontWeight: '700' },
  weekSummary: { borderRadius: 14, padding: 13, flexDirection: 'row', gap: 12, alignItems: 'center' },
  dayRow: { borderWidth: 1, borderRadius: 16, padding: 9 },
  dayDate: { alignItems: 'center', justifyContent: 'center', paddingVertical: 9, width: 49, borderRadius: 11, position: 'absolute', left: 9, top: 9 },
  dayShort: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 17, fontWeight: '600' },
  dayDish: { minHeight: 58, marginLeft: 57, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dayDishName: { fontSize: 12, fontWeight: '700', lineHeight: 17 },
  plusPhoto: { width: 51, height: 51, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  secondaryMeal: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10, flexDirection: 'row', gap: 8, marginLeft: 57, marginTop: 7, alignItems: 'center' },
  progressBox: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 8 },
  progressLabels: { flexDirection: 'row', justifyContent: 'space-between' },
  progressRail: { height: 7, borderRadius: 7, overflow: 'hidden' },
  progressFill: { height: 7, borderRadius: 7 },
  notice: { padding: 12, borderRadius: 12, flexDirection: 'row', gap: 10, alignItems: 'center' },
  shoppingGroup: { borderWidth: 1, borderRadius: 15, overflow: 'hidden' },
  shoppingGroupHeader: { padding: 12, flexDirection: 'row', alignItems: 'center', gap: 9 },
  groupTitle: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 16, flex: 1 },
  shoppingItem: { flexDirection: 'row', alignItems: 'center', minHeight: 42, paddingHorizontal: 11, gap: 9, borderTopWidth: StyleSheet.hairlineWidth },
  checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  shopName: { fontSize: 12, flex: 1, lineHeight: 16 },
  shopQuantity: { fontSize: 11, minWidth: 46, textAlign: 'right' },
  settingsCard: { borderRadius: 17, borderWidth: 1, padding: 17 },
  settingRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingIcon: { borderRadius: 15, width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
  settingTitle: { fontSize: 14, fontWeight: '700' },
  segment: { padding: 4, borderRadius: 13, flexDirection: 'row', gap: 3 },
  segmentItem: { flex: 1, minHeight: 37, alignItems: 'center', justifyContent: 'center', borderRadius: 10 },
  invite: { fontSize: 21, fontWeight: '700', letterSpacing: 2, textAlign: 'center', padding: 14, borderRadius: 12 },
  modalFull: { flex: 1 },
  modalTop: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, gap: 12 },
  modalTitle: { fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif', fontSize: 19, flex: 1 },
  saveText: { fontSize: 12, fontWeight: '700' },
  imageHero: { height: 155, width: '100%', alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  fieldTitle: { fontSize: 12, fontWeight: '700', marginTop: 5 },
  input: { borderWidth: 1, borderRadius: 12, height: 47, paddingHorizontal: 12, fontSize: 13, minWidth: 0 },
  twoCols: { flexDirection: 'row', gap: 12 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepControl: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  stepNumber: { fontSize: 14, fontWeight: '700', minWidth: 17, textAlign: 'center' },
  editCard: { borderRadius: 15, borderWidth: 1, paddingHorizontal: 12 },
  ingredientLine: { minHeight: 43, flexDirection: 'row', gap: 9, alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth },
  ingredientText: { flex: 1, fontSize: 12, minHeight: 39, paddingVertical: 10 },
  stepLine: { borderRadius: 12, borderWidth: 1, flexDirection: 'row', alignItems: 'center', padding: 10, gap: 9 },
  stepBadge: { width: 23, height: 23, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  overlay: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,.44)', paddingHorizontal: 17 },
  dialog: { borderWidth: 1, borderRadius: 21, padding: 17, gap: 13, maxWidth: 570, width: '100%', alignSelf: 'center', maxHeight: '92%' },
  planPick: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth }
});