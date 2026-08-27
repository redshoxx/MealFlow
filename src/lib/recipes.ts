import { supabase } from './supabase';

export type Recipe = {
  id: string;
  title: string;
  image?: string;
  source?: string;
  url?: string;
  minutes?: number;
  ingredients: { name: string; amount?: number; unit?: string }[];
};

export async function searchRecipes(query: string): Promise<Recipe[]> {
  const q = query.trim();
  if (!q) return [];

  if (supabase) {
    const { data, error } = await supabase.functions.invoke('recipe-search', {
      body: { q },
    });
    if (!error && Array.isArray(data?.recipes)) return data.recipes;
  }

  const response = await fetch(
    `https://www.themealdb.com/api/json/v1/1/search.php?s=${encodeURIComponent(q)}`,
  );
  if (!response.ok) throw new Error(`Rezeptsuche fehlgeschlagen (${response.status})`);
  const body = await response.json();
  return (body.meals ?? []).slice(0, 12).map((meal: any) => {
    const ingredients: Recipe['ingredients'] = [];
    for (let index = 1; index <= 20; index += 1) {
      const name = String(meal[`strIngredient${index}`] ?? '').trim();
      const measure = String(meal[`strMeasure${index}`] ?? '').trim();
      if (name) ingredients.push({ name, unit: measure || undefined });
    }
    return {
      id: String(meal.idMeal),
      title: String(meal.strMeal),
      image: meal.strMealThumb,
      source: 'TheMealDB',
      url: meal.strSource || meal.strYoutube || undefined,
      ingredients,
    };
  });
}
