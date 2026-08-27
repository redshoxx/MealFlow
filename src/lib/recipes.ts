import { supabase } from './supabase';

export type Recipe = {
  id: string;
  title: string;
  image?: string;
  imageFallback?: string;
  imageSource?: 'original' | 'search';
  source?: string;
  sourceKind: 'online' | 'web';
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

export type RecipeSearchPage = {
  recipes: Recipe[];
  page: number;
  hasMore: boolean;
  webConfigured: boolean;
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
  curry: 'curry',
  pasta: 'pasta',
  pizza: 'pizza',
};

const POPULAR_WEB_QUERY = 'beliebte rezepte einfach schnell familie';

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
    if (excluded.has(normalizeText(recipe.title))) return false;
    if (recipe.sourceKind === 'web') return true;
    if (filters.maxMinutes && (!recipe.minutes || recipe.minutes > filters.maxMinutes)) return false;
    if (filters.vegetarianOnly && recipe.vegetarian !== true) return false;
    if (filters.ingredient?.trim() && !matchesIngredient(recipe, filters.ingredient)) return false;
    return true;
  });
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

async function searchWeb(query: string, filters: RecipeFilters, page: number): Promise<{ recipes: Recipe[]; hasMore: boolean; configured: boolean }> {
  const clean = query.trim() || POPULAR_WEB_QUERY;
  const { data, error } = await supabase.functions.invoke('recipe-web-search', {
    body: {
      query: clean,
      page,
      maxMinutes: filters.maxMinutes ?? null,
      vegetarianOnly: Boolean(filters.vegetarianOnly),
      ingredient: filters.ingredient?.trim() ?? '',
    },
  });

  if (error) return { recipes: [], hasMore: false, configured: false };

  const recipes = (Array.isArray(data?.results) ? data.results : []).map((row: any): Recipe => ({
    id: String(row.id),
    title: String(row.title || 'Rezept'),
    image: row.image ? String(row.image) : undefined,
    imageFallback: row.imageFallback ? String(row.imageFallback) : undefined,
    imageSource: row.imageSource === 'original' ? 'original' : row.imageSource === 'search' ? 'search' : undefined,
    source: String(row.source || 'Web'),
    sourceKind: 'web',
    url: row.url ? String(row.url) : undefined,
    description: row.description ? String(row.description) : undefined,
    ingredients: [],
  }));

  return {
    recipes,
    hasMore: Boolean(data?.hasMore),
    configured: data?.configured !== false,
  };
}

function dedupe(recipes: Recipe[]) {
  const seen = new Set<string>();
  return recipes.filter((recipe) => {
    const key = recipe.url ? `url:${normalizeText(recipe.url)}` : `title:${recipeKey(recipe.title)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function searchRecipePage(query: string, filters: RecipeFilters = {}, page = 0): Promise<RecipeSearchPage> {
  const clean = query.trim();
  const safePage = Math.max(0, page);

  if (!clean) {
    const web = await searchWeb(POPULAR_WEB_QUERY, filters, safePage);
    return {
      recipes: applyFilters(dedupe(web.recipes), filters),
      page: safePage,
      hasMore: web.hasMore,
      webConfigured: web.configured,
    };
  }

  if (safePage > 0) {
    const web = await searchWeb(clean, filters, safePage);
    return {
      recipes: applyFilters(dedupe(web.recipes), filters),
      page: safePage,
      hasMore: web.hasMore,
      webConfigured: web.configured,
    };
  }

  const [webResult, onlineResult] = await Promise.allSettled([
    searchWeb(clean, filters, 0),
    searchTheMealDb(clean),
  ]);

  const web = webResult.status === 'fulfilled'
    ? webResult.value
    : { recipes: [] as Recipe[], hasMore: false, configured: false };
  const online = onlineResult.status === 'fulfilled' ? onlineResult.value : [];

  if (!web.recipes.length && !online.length && onlineResult.status === 'rejected') {
    throw onlineResult.reason;
  }

  return {
    recipes: applyFilters(dedupe([...web.recipes, ...online]), filters),
    page: 0,
    hasMore: web.hasMore,
    webConfigured: web.configured,
  };
}

export async function searchRecipes(query: string, filters: RecipeFilters = {}): Promise<Recipe[]> {
  const result = await searchRecipePage(query, filters, 0);
  return result.recipes;
}

export function getSeasonalQuickSearch() {
  return ['Schnelle Küche', 'Pasta', 'Hähnchen', 'Vegetarisch', 'Auflauf', 'Familienessen', 'Dessert'];
}
