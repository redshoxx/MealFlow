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

const IMAGE_ENRICH_LIMIT = 12;
const HTML_LIMIT_BYTES = 800_000;
const PAGE_FETCH_TIMEOUT_MS = 2_200;

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

function isPrivateHostname(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  if (host === "0.0.0.0" || host === "::" || host === "::1") return true;

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    if (parts.some((part) => part < 0 || part > 255)) return true;
    const [a, b] = parts;
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }

  if (host.includes(":")) {
    if (host.startsWith("fc") || host.startsWith("fd") || /^fe[89ab]/.test(host)) return true;
  }

  return false;
}

function safeExternalUrl(url: string) {
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const parsed = new URL(url);
    return !isPrivateHostname(parsed.hostname);
  } catch {
    return false;
  }
}

function allowedUrl(url: string) {
  if (!safeExternalUrl(url)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return !blockedHosts.some((blocked) => host.includes(blocked));
  } catch {
    return false;
  }
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(parseInt(code, 16)));
}

function parseAttributes(tag: string) {
  const attributes: Record<string, string> = {};
  const pattern = /([^\s=\/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(tag))) {
    attributes[match[1].toLowerCase()] = decodeHtmlEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attributes;
}

function normalizeImageUrl(value: unknown, baseUrl: string) {
  const raw = decodeHtmlEntities(String(value ?? "").trim());
  if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) return undefined;
  try {
    const url = new URL(raw, baseUrl).toString();
    if (!safeExternalUrl(url)) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

function imageFromValue(value: any): string | undefined {
  if (!value) return undefined;
  if (typeof value === "string") return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = imageFromValue(item);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value === "object") {
    return imageFromValue(value.url) || imageFromValue(value.contentUrl) || imageFromValue(value.thumbnailUrl);
  }
  return undefined;
}

function hasRecipeType(value: any) {
  const type = value?.["@type"];
  if (typeof type === "string") return type.toLowerCase() === "recipe";
  if (Array.isArray(type)) return type.some((item) => String(item).toLowerCase() === "recipe");
  return false;
}

function findRecipeImage(value: any, depth = 0): string | undefined {
  if (depth > 7 || value == null) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findRecipeImage(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value !== "object") return undefined;

  if (hasRecipeType(value)) {
    const image = imageFromValue(value.image) || imageFromValue(value.thumbnailUrl);
    if (image) return image;
  }

  if (value["@graph"]) {
    const graphImage = findRecipeImage(value["@graph"], depth + 1);
    if (graphImage) return graphImage;
  }

  for (const [key, child] of Object.entries(value)) {
    if (key === "image" || key === "thumbnailUrl" || key === "@context") continue;
    if (typeof child === "object" && child !== null) {
      const found = findRecipeImage(child, depth + 1);
      if (found) return found;
    }
  }

  return undefined;
}

function extractSchemaRecipeImage(html: string, baseUrl: string) {
  const scriptPattern = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptPattern.exec(html))) {
    const raw = match[1].trim().replace(/^<!--|-->$/g, "").trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      const candidate = findRecipeImage(parsed);
      const normalized = normalizeImageUrl(candidate, baseUrl);
      if (normalized) return normalized;
    } catch {
      // Invalid JSON-LD on third-party sites is ignored; meta tags remain as fallback.
    }
  }
  return undefined;
}

function extractMetaImage(html: string, baseUrl: string) {
  const priorities = ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src", "image"];
  const found = new Map<string, string>();
  const metaPattern = /<meta\b[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = metaPattern.exec(html))) {
    const attrs = parseAttributes(match[0]);
    const key = String(attrs.property || attrs.name || attrs.itemprop || "").toLowerCase();
    const content = attrs.content;
    if (key && content && !found.has(key)) found.set(key, content);
  }
  for (const key of priorities) {
    const normalized = normalizeImageUrl(found.get(key), baseUrl);
    if (normalized) return normalized;
  }

  const linkPattern = /<link\b[^>]*>/gi;
  while ((match = linkPattern.exec(html))) {
    const attrs = parseAttributes(match[0]);
    const rel = String(attrs.rel || "").toLowerCase().split(/\s+/);
    if (rel.includes("image_src")) {
      const normalized = normalizeImageUrl(attrs.href, baseUrl);
      if (normalized) return normalized;
    }
  }

  const imagePattern = /<img\b[^>]*>/gi;
  while ((match = imagePattern.exec(html))) {
    const attrs = parseAttributes(match[0]);
    if (String(attrs.itemprop || "").toLowerCase() === "image") {
      const normalized = normalizeImageUrl(attrs.src || attrs["data-src"], baseUrl);
      if (normalized) return normalized;
    }
  }

  return undefined;
}

async function readTextLimited(response: Response, maxBytes: number) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      text += decoder.decode(value, { stream: true });
      if (total >= maxBytes) {
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
    text += decoder.decode();
    return text;
  } finally {
    reader.releaseLock();
  }
}

async function fetchRecipeHtml(url: string): Promise<{ html: string; finalUrl: string } | null> {
  if (!allowedUrl(url)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PAGE_FETCH_TIMEOUT_MS);
  let current = url;

  try {
    for (let redirectCount = 0; redirectCount <= 3; redirectCount += 1) {
      if (!allowedUrl(current)) return null;
      const response = await fetch(current, {
        redirect: "manual",
        signal: controller.signal,
        headers: {
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "de-AT,de;q=0.9,en;q=0.7",
          "User-Agent": "Mozilla/5.0 (compatible; MealFlow/2.1.2; +https://github.com/redshoxx/MealFlow)",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) return null;
        const next = new URL(location, current).toString();
        if (!allowedUrl(next)) return null;
        current = next;
        continue;
      }

      if (!response.ok) return null;
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml")) return null;
      const contentLength = Number(response.headers.get("content-length") || 0);
      if (contentLength > 3_000_000) return null;

      const html = await readTextLimited(response, HTML_LIMIT_BYTES);
      return html ? { html, finalUrl: current } : null;
    }
    return null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function enrichWithOriginalImage<T extends { url: string; image?: string }>(result: T): Promise<T & { imageSource?: string; imageFallback?: string }> {
  const page = await fetchRecipeHtml(result.url);
  if (!page) return { ...result, imageSource: result.image ? "search" : undefined };

  const original = extractSchemaRecipeImage(page.html, page.finalUrl) || extractMetaImage(page.html, page.finalUrl);
  if (!original) return { ...result, imageSource: result.image ? "search" : undefined };

  return {
    ...result,
    image: original,
    imageFallback: result.image,
    imageSource: "original",
  };
}

async function enrichResultImages<T extends { url: string; image?: string }>(results: T[]) {
  return await Promise.all(results.map(async (result, index) => {
    if (index >= IMAGE_ENRICH_LIMIT) return result;
    try {
      return await enrichWithOriginalImage(result);
    } catch {
      return result;
    }
  }));
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
  const mapped = organic
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

  const results = await enrichResultImages(mapped);
  return {
    provider: "serper",
    results,
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
  const mapped = rawResults
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

  const results = await enrichResultImages(mapped);
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
