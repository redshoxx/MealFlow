import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const blockedHosts = [
  "pinterest.",
  "instagram.com",
  "facebook.com",
  "tiktok.com",
  "youtube.com",
  "youtu.be",
  "x.com",
  "twitter.com",
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function sourceName(url: string) {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");
    return hostname.split(".").slice(-2).join(".");
  } catch {
    return "Web";
  }
}

function buildQuery(input: {
  query: string;
  maxMinutes?: number | null;
  vegetarianOnly?: boolean;
  ingredient?: string;
}) {
  const parts = [input.query.trim(), "Rezept"];
  if (input.vegetarianOnly) parts.push("vegetarisch");
  if (input.ingredient?.trim()) parts.push(`mit ${input.ingredient.trim()}`);
  if (input.maxMinutes && input.maxMinutes > 0) parts.push(`unter ${input.maxMinutes} Minuten`);
  return parts.join(" ").trim();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  const apiKey = Deno.env.get("BRAVE_SEARCH_API_KEY");
  if (!apiKey) {
    return json({
      error: "WEB_SEARCH_NOT_CONFIGURED",
      message: "Die Web-Rezeptsuche ist noch nicht konfiguriert.",
      configured: false,
      results: [],
      hasMore: false,
    }, 503);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }

  const query = String(body?.query ?? "").trim();
  if (!query) return json({ results: [], hasMore: false, configured: true, page: 0 });
  if (query.length > 240) return json({ error: "QUERY_TOO_LONG" }, 400);

  const page = Math.max(0, Math.min(9, Number(body?.page ?? 0) || 0));
  const searchQuery = buildQuery({
    query,
    maxMinutes: body?.maxMinutes == null ? null : Number(body.maxMinutes),
    vegetarianOnly: Boolean(body?.vegetarianOnly),
    ingredient: String(body?.ingredient ?? ""),
  });

  const params = new URLSearchParams({
    q: searchQuery,
    count: "20",
    offset: String(page),
    country: "AT",
    search_lang: "de",
    ui_lang: "de-DE",
    safesearch: "strict",
    text_decorations: "false",
    extra_snippets: "true",
    result_filter: "web",
    units: "metric",
  });

  const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip",
      "X-Subscription-Token": apiKey,
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    return json({
      error: "WEB_SEARCH_FAILED",
      status: response.status,
      message: "Die Web-Rezeptsuche ist gerade nicht erreichbar.",
      detail: detail.slice(0, 300),
    }, response.status === 429 ? 429 : 502);
  }

  const payload = await response.json();
  const rawResults = Array.isArray(payload?.web?.results) ? payload.web.results : [];
  const results = rawResults
    .filter((result: any) => {
      const url = String(result?.url ?? "");
      if (!/^https?:\/\//i.test(url)) return false;
      const host = (() => { try { return new URL(url).hostname.toLowerCase(); } catch { return ""; } })();
      return !blockedHosts.some((blocked) => host.includes(blocked));
    })
    .map((result: any, index: number) => {
      const url = String(result.url);
      const thumbnail = result?.thumbnail?.src || result?.thumbnail?.original || undefined;
      return {
        id: `web:${page}:${index}:${url}`,
        title: String(result?.title ?? "Rezept").replace(/<[^>]+>/g, "").trim(),
        description: String(result?.description ?? result?.extra_snippets?.[0] ?? "").replace(/<[^>]+>/g, "").trim(),
        image: thumbnail ? String(thumbnail) : undefined,
        source: String(result?.profile?.long_name || sourceName(url)),
        sourceKind: "web",
        url,
        ingredients: [],
      };
    });

  return json({
    configured: true,
    page,
    results,
    hasMore: Boolean(payload?.query?.more_results_available) && page < 9,
  });
});
