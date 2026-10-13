import { getActiveHouseholdId, type OwnRecipe, type ShoppingItem } from './cloud';
import { supabase } from './supabase';

export type MealSlot = 'main' | 'saskia';
export type PlannedDay = { plannedDate: string; meal: string | null; mealSaskia: string | null; mealPortions: number; mealSaskiaPortions: number };
export type Dish = OwnRecipe & {
  source: 'saved' | 'planned' | 'catalog';
  category: string;
  minutes: number;
  difficulty: string;
  imageUrl: string;
};
export type Grocery = { key: string; name: string; amount: number; unit: string; source: 'planned' | 'manual'; saved?: ShoppingItem; done: boolean };

export const CATEGORY_NAMES = ['Alle', 'Hauptgerichte', 'Pasta', 'Frühstück', 'Suppen', 'Vegetarisch', 'Fisch'];
export const GROCERY_CATEGORIES = [
  { title: 'Gemüse & Obst', icon: 'food-apple-outline', words: ['tomat', 'zwiebel', 'knoblauch', 'paprika', 'avocado', 'zitrone', 'salat', 'karott', 'gurke', 'kartoffel', 'erdäpfel', 'brokkoli', 'gemüse', 'zucchini', 'apfel', 'banane', 'pilz', 'spinat', 'lauch', 'kürbis'] },
  { title: 'Milchprodukte', icon: 'cheese', words: ['käse', 'parmesan', 'feta', 'joghurt', 'milch', 'sahne', 'obers', 'butter', 'topfen', 'mozzarella', 'rahm'] },
  { title: 'Vorrat', icon: 'package-variant-closed', words: ['pasta', 'nudel', 'reis', 'öl', 'mehl', 'salz', 'pfeffer', 'linsen', 'kichererbse', 'gewürz', 'curry', 'brühe', 'zucker', 'dose', 'essig', 'hafer', 'brot', 'semme'] },
  { title: 'Fleisch & Fisch', icon: 'fish', words: ['huhn', 'hendl', 'hähnchen', 'chicken', 'fleisch', 'lachs', 'fisch', 'rind', 'schwein', 'schnitzel', 'speck', 'wurst', 'garnelen'] },
  { title: 'Backwaren & Eier', icon: 'bread-slice-outline', words: ['brot', 'toast', 'ei', 'brötchen', 'hefe', 'semmel'] },
] as const;
export function normalize(value: string): string {
  return value.toLocaleLowerCase('de-AT').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').trim().replace(/\s+/g, ' ');
}
export function iso(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}
export function weekStart(offset: number): Date {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - (date.getDay() + 6) % 7 + offset * 7);
  return date;
}
export function weekDates(start: Date): Date[] {
  return Array.from({ length: 7 }, (_, day) => {
    const result = new Date(start);
    result.setDate(start.getDate() + day);
    return result;
  });
}
export function formatAmount(amount: number): string {
  return Number(amount.toFixed(2)).toLocaleString('de-AT', { maximumFractionDigits: 2 });
}
const UNIT_ALIASES: Record<string, string> = {
  gramm: 'g', gr: 'g', kilogramm: 'kg', liter: 'l', st: 'Stk.', stk: 'Stk.',
  'stück': 'Stk.', stück: 'Stk.', zehe: 'Stk.', zehen: 'Stk.',
  esslöffel: 'EL', teelöffel: 'TL', prise: 'Prise', prisen: 'Prise',
  dosen: 'Dose', päckchen: 'Pkg.', packung: 'Pkg.'
};
export function parseIngredient(text: string): { name: string; amount: number; unit: string } | null {
  const clean = text.trim();
  if (!clean) return null;
  const match = clean.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l|EL|TL|Stk\.?|Stück|Zehen?|Dosen?|Dose|Bund|Prisen?|Prise|Pkg\.?|Packung|Päckchen)?\s+(.+)$/i);
  if (!match) return { name: clean, amount: 1, unit: 'Stk.' };
  const amount = Number(match[1].replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const rawUnit = (match[2] ?? 'Stk.').toLocaleLowerCase('de-AT');
  let unit = UNIT_ALIASES[rawUnit] || (rawUnit === 'el' ? 'EL' : rawUnit === 'tl' ? 'TL' : rawUnit);
  let quantity = amount;
  if (unit === 'kg') { unit = 'g'; quantity *= 1000; }
  if (unit === 'l') { unit = 'ml'; quantity *= 1000; }
  return { name: match[3].trim(), amount: quantity, unit };
}
export function groceryCategory(name: string): string {
  const word = normalize(name);
  return GROCERY_CATEGORIES.find((group) => group.words.some((part) => word.includes(normalize(part))))?.title ?? 'Sonstiges';
}
export function guessCategory(title: string): string {
  const name = normalize(title);
  if (name.includes('pasta') || name.includes('nudel') || name.includes('spaghetti')) return 'Pasta';
  if (name.includes('suppe') || name.includes('eintopf')) return 'Suppen';
  if (name.includes('toast') || name.includes('pancake') || name.includes('frühstück')) return 'Frühstück';
  if (name.includes('lachs') || name.includes('fisch') || name.includes('salmon')) return 'Fisch';
  if (name.includes('curry') || name.includes('gemüse') || name.includes('veggie') || name.includes('avocado')) return 'Vegetarisch';
  return 'Hauptgerichte';
}
function toDish(row: any, source: Dish['source']): Dish {
  return {
    id: String(row.id),
    title: String(row.title),
    ingredients: Array.isArray(row.ingredients) ? row.ingredients.map((value: any) => typeof value === 'string' ? value : String(value.name ?? '')) : [],
    instructions: String(row.instructions ?? ''),
    servings: Math.max(1, Number(row.servings ?? 2) || 2),
    source,
    category: String(row.category ?? guessCategory(String(row.title))),
    minutes: Math.max(0, Number(row.minutes ?? row.duration_minutes ?? 0)),
    difficulty: String(row.difficulty ?? 'Einfach'),
    imageUrl: String(row.image_url ?? ''),
    createdAt: String(row.created_at ?? '')
  };
}
export async function loadDishCollection(): Promise<Dish[]> {
  const householdId = await getActiveHouseholdId();
  const [ownResult, catalogResult] = await Promise.all([
    supabase.from('custom_recipes').select('*').eq('household_id', householdId).order('created_at', { ascending: false }),
    supabase.from('recipe_catalog').select('id,title,ingredients,instructions,duration_minutes')
  ]);
  if (ownResult.error) throw ownResult.error;
  // Catalog recipes are used for ingredients, not displayed unless the dish was planned.
  const catalog: Dish[] = catalogResult.error ? [] : (catalogResult.data ?? []).map((row: any) => toDish(row, 'catalog'));
  const stored = (ownResult.data ?? []).map((row: any) => toDish(row, 'saved'));
  const map = new Map<string, Dish>();
  for (const recipe of stored) map.set(normalize(recipe.title), recipe);
  const catalogLookup = new Map(catalog.map((recipe) => [normalize(recipe.title), recipe]));

  // Read the actual household history rather than just the four currently visible weeks.
  for (let page = 0; page < 20; page++) {
    const { data, error } = await supabase.from('meal_plan_entries')
      .select('meal,meal_saskia').eq('household_id', householdId)
      .order('planned_date', { ascending: false }).range(page * 500, page * 500 + 499);
    if (error) throw error;
    for (const row of data ?? []) {
      for (const title of [row.meal, row.meal_saskia]) {
        const name = String(title ?? '').trim();
        if (!name || map.has(normalize(name))) continue;
        const catalogDish = catalogLookup.get(normalize(name));
        map.set(normalize(name), catalogDish ?? {
          id: 'planned:' + normalize(name), title: name, ingredients: [], instructions: '',
          servings: 2, source: 'planned', category: guessCategory(name), minutes: 0, difficulty: 'Einfach', imageUrl: ''
        });
      }
    }
    if ((data ?? []).length < 500) break;
  }
  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title, 'de-AT'));
}
export async function saveDish(dish: Omit<Dish, 'id' | 'source' | 'createdAt'>, old?: Dish | null): Promise<void> {
  const householdId = await getActiveHouseholdId();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  const user = userData.user;
  if (!user) throw new Error('Bitte melde dich erneut an.');
  const title = dish.title.trim();
  if (!title) throw new Error('Bitte gib einen Gerichtsnamen ein.');
  if (old && normalize(old.title) !== normalize(title)) {
    const { data: sameName, error: searchError } = await supabase.from('custom_recipes')
      .select('id').eq('household_id', householdId).ilike('title', title);
    if (searchError) throw searchError;
    if (sameName?.some((item: any) => item.id !== old.id)) throw new Error('Dieses Gericht ist bereits gespeichert.');
  }
  const payload = {
    title, ingredients: dish.ingredients.map((item) => item.trim()).filter(Boolean),
    instructions: dish.instructions.trim(), servings: Math.max(1, dish.servings),
    category: dish.category, minutes: dish.minutes, difficulty: dish.difficulty, image_url: dish.imageUrl.trim()
  };
  if (old?.source === 'saved') {
    const { error } = await supabase.from('custom_recipes').update(payload)
      .eq('id', old.id).eq('household_id', householdId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('custom_recipes')
      .insert({ ...payload, owner_id: user.id, household_id: householdId });
    if (error) throw error;
  }
  // Keep planned days linked when a saved dish is renamed.
  if (old && normalize(old.title) !== normalize(title)) {
    for (const [column] of [['meal'], ['meal_saskia']] as const) {
      const { error } = await supabase.from('meal_plan_entries').update({ [column]: title })
        .eq('household_id', householdId).eq(column, old.title);
      if (error) throw error;
    }
  }
}
export async function loadWeek(start: Date): Promise<PlannedDay[]> {
  const householdId = await getActiveHouseholdId();
  const days = weekDates(start);
  const { data, error } = await supabase.from('meal_plan_entries')
    .select('planned_date,meal,meal_saskia,meal_portions,meal_saskia_portions').eq('household_id', householdId)
    .gte('planned_date', iso(days[0])).lte('planned_date', iso(days[6]));
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    plannedDate: String(row.planned_date),
    meal: row.meal ? String(row.meal) : null,
    mealSaskia: row.meal_saskia ? String(row.meal_saskia) : null,
    mealPortions: Number(row.meal_portions ?? 2), mealSaskiaPortions: Number(row.meal_saskia_portions ?? 2)
  }));
}
export function weeklyGroceries(days: PlannedDay[], recipes: Dish[], saved: ShoppingItem[]): { items: Grocery[]; missing: string[] } {
  const recipeMap = new Map(recipes.map((r) => [normalize(r.title), r]));
  const generated = new Map<string, Grocery>();
  const missing = new Set<string>();
  for (const day of days) {
    for (const [title, portions] of [[day.meal, day.mealPortions], [day.mealSaskia, day.mealSaskiaPortions]] as const) {
      if (!title) continue;
      const recipe = recipeMap.get(normalize(title));
      if (!recipe || recipe.ingredients.length === 0) { missing.add(title); continue; }
      for (const raw of recipe.ingredients) {
        const ingredient = parseIngredient(raw);
        if (!ingredient) continue;
        const key = normalize(ingredient.name) + '|' + ingredient.unit;
        const old = generated.get(key);
        const scaled = ingredient.amount * Math.max(1, portions || 2) / Math.max(1, recipe.servings);
        if (old) old.amount += scaled;
        else generated.set(key, { key, name: ingredient.name, amount: scaled, unit: ingredient.unit, done: false, source: 'planned' });
      }
    }
  }
  const matched = new Set<string>();
  const list: Grocery[] = [];
  for (const item of generated.values()) {
    // An already stored item represents the checkable state. Never silently duplicate it.
    const matching = saved.find((candidate) => normalize(candidate.name) + '|' + candidate.unit === item.key && !matched.has(candidate.id));
    if (matching) { item.saved = matching; item.done = matching.done; matched.add(matching.id); }
    list.push(item);
  }
  for (const item of saved) {
    if (matched.has(item.id)) continue;
    list.push({ key: 'saved:' + item.id, name: item.name, amount: item.amount, unit: item.unit, done: item.done, source: 'manual', saved: item });
  }
  return { items: list, missing: [...missing] };
}
