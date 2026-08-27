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

function cleanText(value: unknown) {
  return String(value ?? "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function allowedUrl(url: string) {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return !blockedHosts.some((blocked) => host.includes(blocked));
  } catch {
    return false;
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

async function searchSerper(apiKey: string, searchQuery: string, page: number) {
  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-KEY": apiKey,
    },
    body: JSON.stringify({
      q: searchQuery,
      gl: "at",
      hl: "de",
      num: 20,
      page: page + 1,
      autocorrect: true,
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw Object.assign(new Error("SERPER_FAILED"), { status: response.status, detail });
  }

  const payload = await response.json();
  const organic = Array.isArray(payload?.organic) ? payload.organic : [];
  const results = organic
    .filter((result: any) => allowedUrl(String(result?.link ?? "")))
    .map((result: any, index: number) => {
      const url = String(result.link);
      return {
        id: `serper:${page}:${index}:${url}`,
        title: cleanText(result?.title || "Rezept"),
        description: cleanText(result?.snippet || result?.attributes?.description || ""),
        image: result?.imageUrl ? String(result.imageUrl) : undefined,
        source: cleanText(result?.source || sourceName(url)),
        sourceKind: "web",
        url,
        ingredients: [],
      };
    });

  return {
    provider: "serper",
    results,
    // Serper supports page-based pagination. Continue while a full-ish result page is returned.
    hasMore: organic.length >= 8,
  };
}

async function searchBrave(apiKey: string, searchQuery: string, logicalPage: number) {
  const page = Math.max(0, Math.min(9, logicalPage));
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
    throw Object.assign(new Error("BRAVE_FAILED"), { status: response.status, detail });
  }

  const payload = await response.json();
  const rawResults = Array.isArray(payload?.web?.results) ? payload.web.results : [];
  const results = rawResults
    .filter((result: any) => allowedUrl(String(result?.url ?? "")))
    .map((result: any, index: number) => {
      const url = String(result.url);
      const thumbnail = result?.thumbnail?.src || result?.thumbnail?.original || undefined;
      return {
        id: `brave:${page}:${index}:${url}`,
        title: cleanText(result?.title || "Rezept"),
        description: cleanText(result?.description || result?.extra_snippets?.[0] || ""),
        image: thumbnail ? String(thumbnail) : undefined,
        source: cleanText(result?.profile?.long_name || sourceName(url)),
        sourceKind: "web",
        url,
        ingredients: [],
      };
    });

  return {
    provider: "brave",
    results,
    hasMore: Boolean(payload?.query?.more_results_available) && page < 9,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }

  const query = String(body?.query ?? "").trim();
  if (!query) return json({ results: [], hasMore: false, configured: true, page: 0 });
  if (query.length > 240) return json({ error: "QUERY_TOO_LONG" }, 400);

  const page = Math.max(0, Number(body?.page ?? 0) || 0);
  const searchQuery = buildQuery({
    query,
    maxMinutes: body?.maxMinutes == null ? null : Number(body.maxMinutes),
    vegetarianOnly: Boolean(body?.vegetarianOnly),
    ingredient: String(body?.ingredient ?? ""),
  });

  const serperKey = Deno.env.get("SERPER_API_KEY");
  const braveKey = Deno.env.get("BRAVE_SEARCH_API_KEY");

  if (!serperKey && !braveKey) {
    return json({
      error: "WEB_SEARCH_NOT_CONFIGURED",
      message: "Die Web-Rezeptsuche ist noch nicht konfiguriert.",
      configured: false,
      results: [],
      hasMore: false,
    }, 503);
  }

  try {
    const result = serperKey
      ? await searchSerper(serperKey, searchQuery, page)
      : await searchBrave(braveKey!, searchQuery, page);

    return json({
      configured: true,
      provider: result.provider,
      page,
      results: result.results,
      hasMore: result.hasMore,
    });
  } catch (error: any) {
    // If Serper is temporarily unavailable and Brave is configured as a second provider,
    // fall back without surfacing an error to the mobile app.
    if (serperKey && braveKey) {
      try {
        const fallback = await searchBrave(braveKey, searchQuery, page);
        return json({ configured: true, provider: fallback.provider, page, results: fallback.results, hasMore: fallback.hasMore });
      } catch {
        // Fall through to the common error response below.
      }
    }

    const status = Number(error?.status ?? 502);
    return json({
      error: "WEB_SEARCH_FAILED",
      status,
      message: status === 429 ? "Das Suchkontingent ist gerade ausgeschöpft." : "Die Web-Rezeptsuche ist gerade nicht erreichbar.",
      detail: String(error?.detail ?? "").slice(0, 300),
    }, status === 429 ? 429 : 502);
  }
});
