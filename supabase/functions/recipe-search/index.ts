Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) return new Response('Unauthorized', { status: 401 });
  const { q } = await req.json();
  if (typeof q !== 'string' || q.trim().length < 2) return Response.json({ recipes: [] });

  const appId = Deno.env.get('EDAMAM_APP_ID');
  const appKey = Deno.env.get('EDAMAM_APP_KEY');
  if (!appId || !appKey) return Response.json({ recipes: [] }, { status: 503 });

  const url = new URL('https://api.edamam.com/api/recipes/v2');
  url.searchParams.set('type', 'public');
  url.searchParams.set('q', q.trim());
  url.searchParams.set('app_id', appId);
  url.searchParams.set('app_key', appKey);
  url.searchParams.append('field', 'uri');
  url.searchParams.append('field', 'label');
  url.searchParams.append('field', 'image');
  url.searchParams.append('field', 'source');
  url.searchParams.append('field', 'url');
  url.searchParams.append('field', 'totalTime');
  url.searchParams.append('field', 'ingredients');

  const response = await fetch(url);
  if (!response.ok) return Response.json({ recipes: [] }, { status: 502 });
  const data = await response.json();
  const recipes = (data.hits ?? []).slice(0, 20).map((hit: any) => ({
    id: hit.recipe.uri,
    title: hit.recipe.label,
    image: hit.recipe.image,
    source: hit.recipe.source,
    url: hit.recipe.url,
    minutes: hit.recipe.totalTime || undefined,
    ingredients: (hit.recipe.ingredients ?? []).map((ingredient: any) => ({
      name: ingredient.food,
      amount: ingredient.quantity,
      unit: ingredient.measure,
    })),
  }));
  return Response.json({ recipes }, { headers: { 'Cache-Control': 'private, max-age=300' } });
});
