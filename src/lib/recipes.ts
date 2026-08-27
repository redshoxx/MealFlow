export type Recipe = {
  id: string;
  title: string;
  image?: string;
  source?: string;
  url?: string;
  minutes?: number;
  instructions?: string;
  ingredients: { name: string; amount?: number; unit?: string }[];
};

const SEARCH_TRANSLATIONS: Record<string, string> = {
  hähnchen: 'chicken',
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
  nudeln: 'pasta',
  reis: 'rice',
  suppe: 'soup',
  salat: 'salad',
  vegetarisch: 'vegetarian',
  curry: 'curry',
  pasta: 'pasta',
  pizza: 'pizza',
};

function normalizeGermanQuery(query: string) {
  const words = query.trim().toLocaleLowerCase('de-AT').split(/\s+/);
  return words.map((word) => SEARCH_TRANSLATIONS[word] ?? word).join(' ');
}

export async function searchRecipes(query: string): Promise<Recipe[]> {
  const q = query.trim();
  if (!q) return [];

  const normalized = normalizeGermanQuery(q);
  const response = await fetch(`https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(normalized)}`);
  if (!response.ok) throw new Error(`Die Rezeptsuche ist derzeit nicht erreichbar (${response.status}).`);

  const body = await response.json();
  return (body.meals ?? []).slice(0, 16).map((meal: any) => {
    const ingredients: Recipe['ingredients'] = [];
    for (let index = 1; index <= 20; index += 1) {
      const localizedName = meal[`strIngredient${index}DE`] ?? meal[`strIngredient${index}`];
      const name = String(localizedName ?? '').trim();
      const measure = String(meal[`strMeasure${index}`] ?? '').trim();
      if (name) ingredients.push({ name, unit: measure || undefined });
    }

    return {
      id: String(meal.idMeal),
      title: String(meal.strMealDE || meal.strMealAlternate || meal.strMeal),
      image: meal.strMealThumb,
      source: 'Online-Rezept',
      url: meal.strSource || meal.strYoutube || undefined,
      instructions: String(meal.strInstructionsDE || meal.strInstructions || '').trim() || undefined,
      ingredients,
    };
  });
}
