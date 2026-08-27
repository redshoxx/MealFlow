import { supabase } from './supabase';

export type Recipe = {
  id: string;
  title: string;
  image?: string;
  source?: string;
  sourceKind: 'mealflow' | 'online';
  url?: string;
  minutes?: number;
  instructions?: string;
  description?: string;
  vegetarian?: boolean;
  region?: string;
  tags?: string[];
  ingredients: { name: string; amount?: number; unit?: string }[];
};

export type RecipeFilters = {
  maxMinutes?: number | null;
  vegetarianOnly?: boolean;
  ingredient?: string;
  excludeTitles?: string[];
};

const SEARCH_TRANSLATIONS: Record<string, string> = {
  hähnchen: 'chicken',
  hendl: 'chicken',
  huhn: 'chicken',
  hühnchen: 'chicken',
  rind: 'beef',
  rindfleisch: 'beef',
  hackfleisch: 'minced beef',
  schweinefleisch: 'pork',
  fisch: 'fish',
  lachs: 'salmon',
  kartoffel: 'potato',
  kartoffeln: 'potato',
  erdäpfel: 'potato',
  nudeln: 'pasta',
  reis: 'rice',
  suppe: 'soup',
  salat: 'salad',
  vegetarisch: 'vegetarian',
  knödel: 'dumplings',
  eintopf: 'stew',
  ofengemüse: 'roasted vegetables',
  kürbis: 'pumpkin',
  eierschwammerl: 'mushrooms',
  pilze: 'mushrooms',
  curry: 'curry',
  pasta: 'pasta',
  pizza: 'pizza',
};

function normalizeText(value: string) {
  return value
    .toLocaleLowerCase('de-AT')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss')
    .trim();
}

function normalizeGermanQuery(query: string) {
  const words = query.trim().toLocaleLowerCase('de-AT').split(/\s+/);
  return words.map((word) => SEARCH_TRANSLATIONS[word] ?? word).join(' ');
}

function recipeKey(title: string) {
  return normalizeText(title).replace(/[^a-z0-9]+/g, '-');
}

function matchesIngredient(recipe: Recipe, ingredient: string) {
  const raw = normalizeText(ingredient);
  const translated = normalizeText(normalizeGermanQuery(ingredient));
  if (!raw) return true;
  return recipe.ingredients.some((item) => {
    const name = normalizeText(item.name);
    return name.includes(raw) || name.includes(translated) || raw.includes(name);
  });
}

function applyFilters(recipes: Recipe[], filters: RecipeFilters) {
  const excluded = new Set((filters.excludeTitles ?? []).map(normalizeText));
  return recipes.filter((recipe) => {
    if (filters.maxMinutes && (!recipe.minutes || recipe.minutes > filters.maxMinutes)) return false;
    if (filters.vegetarianOnly && recipe.vegetarian !== true) return false;
    if (filters.ingredient?.trim() && !matchesIngredient(recipe, filters.ingredient)) return false;
    if (excluded.has(normalizeText(recipe.title))) return false;
    return true;
  });
}

async function searchMealFlowCatalog(query: string): Promise<Recipe[]> {
  const { data, error } = await supabase
    .from('recipe_catalog')
    .select('id,title,description,duration_minutes,vegetarian,ingredients,instructions,tags,seasonal_months,region,source_name')
    .limit(100);
  if (error) throw error;

  const month = new Date().getMonth() + 1;
  const needle = normalizeText(query);
  return (data ?? [])
    .map((row: any): Recipe & { seasonal: boolean } => {
      const ingredients = Array.isArray(row.ingredients) ? row.ingredients.map((name: unknown) => ({ name: String(name) })) : [];
      const tags = Array.isArray(row.tags) ? row.tags.map(String) : [];
      const months = Array.isArray(row.seasonal_months) ? row.seasonal_months.map(Number) : [];
      return {
        id: `catalog:${row.id}`,
        title: String(row.title),
        source: String(row.source_name || 'MealFlow Österreich'),
        sourceKind: 'mealflow',
        minutes: Number(row.duration_minutes),
        instructions: String(row.instructions || ''),
        description: String(row.description || ''),
        vegetarian: Boolean(row.vegetarian),
        region: String(row.region || 'AT/DE'),
        tags,
        ingredients,
        seasonal: months.includes(month),
      };
    })
    .filter((recipe: Recipe & { seasonal: boolean }) => {
      if (!needle) return recipe.seasonal || recipe.tags?.some((tag) => ['österreich', 'klassisch'].includes(normalizeText(tag)));
      const haystack = normalizeText([
        recipe.title,
        recipe.description,
        ...(recipe.tags ?? []),
        ...recipe.ingredients.map((item) => item.name),
      ].join(' '));
      return haystack.includes(needle);
    })
    .sort((a: Recipe & { seasonal: boolean }, b: Recipe & { seasonal: boolean }) => Number(b.seasonal) - Number(a.seasonal))
    .map(({ seasonal: _seasonal, ...recipe }: Recipe & { seasonal: boolean }) => recipe);
}

async function searchTheMealDb(query: string): Promise<Recipe[]> {
  const q = query.trim();
  if (!q) return [];
  const normalized = normalizeGermanQuery(q);
  const response = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(normalized)}`);
  if (!response.ok) throw new Error(`Die Online-Rezeptsuche ist derzeit nicht erreichbar (${response.status}).`);

  const body = await response.json();
  return (body.meals ?? []).slice(0, 18).map((meal: any): Recipe => {
    const ingredients: Recipe['ingredients'] = [];
    for (let index = 1; index <= 20; index += 1) {
      const localizedName = meal[`strIngredient${index}DE`] ?? meal[`strIngredient${index}`];
      const name = String(localizedName ?? '').trim();
      const measure = String(meal[`strMeasure${index}`] ?? '').trim();
      if (name) ingredients.push({ name, unit: measure || undefined });
    }
    return {
      id: `themealdb:${String(meal.idMeal)}`,
      title: String(meal.strMealDE || meal.strMealAlternate || meal.strMeal),
      image: meal.strMealThumb,
      source: 'TheMealDB',
      sourceKind: 'online',
      url: meal.strSource || meal.strYoutube || undefined,
      instructions: String(meal.strInstructionsDE || meal.strInstructions || '').trim() || undefined,
      vegetarian: String(meal.strCategory || '').toLocaleLowerCase() === 'vegetarian',
      region: String(meal.strArea || ''),
      tags: String(meal.strTags || '').split(',').map((tag) => tag.trim()).filter(Boolean),
      ingredients,
    };
  });
}

export async function searchRecipes(query: string, filters: RecipeFilters = {}): Promise<Recipe[]> {
  const clean = query.trim();
  const [catalogResult, onlineResult] = await Promise.allSettled([
    searchMealFlowCatalog(clean),
    searchTheMealDb(clean),
  ]);

  const catalog = catalogResult.status === 'fulfilled' ? catalogResult.value : [];
  const online = onlineResult.status === 'fulfilled' ? onlineResult.value : [];
  if (!catalog.length && !online.length && catalogResult.status === 'rejected' && onlineResult.status === 'rejected') {
    throw catalogResult.reason ?? onlineResult.reason;
  }

  const seen = new Set<string>();
  const merged = [...catalog, ...online].filter((recipe) => {
    const key = recipeKey(recipe.title);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return applyFilters(merged, filters).slice(0, 30);
}

export function getSeasonalQuickSearch() {
  const month = new Date().getMonth() + 1;
  const seasonal: Record<number, string[]> = {
    1: ['Eintopf', 'Knödel'],
    2: ['Eintopf', 'Käsespätzle'],
    3: ['Bärlauch', 'Ofengemüse'],
    4: ['Spargel', 'Bärlauch'],
    5: ['Spargel', 'Gemüselaibchen'],
    6: ['Zucchini', 'Ofengemüse'],
    7: ['Eierschwammerl', 'Zucchini'],
    8: ['Eierschwammerl', 'Ofengemüse'],
    9: ['Kürbis', 'Knödel'],
    10: ['Kürbis', 'Eintopf'],
    11: ['Knödel', 'Eintopf'],
    12: ['Schnitzel', 'Knödel'],
  };
  return Array.from(new Set(['Schnitzel', 'Knödel', 'Eintopf', 'Ofengemüse', ...(seasonal[month] ?? [])])).slice(0, 7);
}
