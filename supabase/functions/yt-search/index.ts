// YouTube search proxy — runs server-side so there are no CORS / IP-block
// issues like Piped/Invidious public instances. No API key required.
// Scrapes the public YouTube search page and extracts video, channel and
// playlist metadata so the client can build a Spotify-like browse experience.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface VideoItem {
  type: "video";
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
  views: number;
  publishedText?: string;
}
interface ChannelItem {
  type: "channel";
  id: string;
  name: string;
  thumbnail: string;
  subscribers?: string;
  description?: string;
}
interface PlaylistItem {
  type: "playlist";
  id: string;
  title: string;
  thumbnail: string;
  videoCount: number;
  author?: string;
}
type Item = VideoItem | ChannelItem | PlaylistItem;

const parseDuration = (text: string): number => {
  const parts = text.split(":").map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
};

const parseViews = (text: string): number => {
  // "1.2M views", "523K views", "1,234 views"
  const m = text.match(/([\d.,]+)\s*([KMB]?)/i);
  if (!m) return 0;
  const num = parseFloat(m[1].replace(/,/g, ""));
  if (isNaN(num)) return 0;
  const suffix = m[2]?.toUpperCase();
  const mult = suffix === "B" ? 1e9 : suffix === "M" ? 1e6 : suffix === "K" ? 1e3 : 1;
  return Math.round(num * mult);
};

// YouTube results-page filter params (?sp=...)
//   EgIQAQ%3D%3D       — Videos only
//   EgIQAw%3D%3D       — Playlists only
//   EgIQAg%3D%3D       — Channels only
//   EgWKAQIQAQ%3D%3D   — "Music" category videos (better quality for songs)
const FILTER = {
  music: "EgWKAQIQAQ%253D%253D",
  videos: "EgIQAQ%253D%253D",
  playlists: "EgIQAw%253D%253D",
  channels: "EgIQAg%253D%253D",
  all: "",
} as const;

type Category = keyof typeof FILTER;

async function fetchYTPage(query: string, filter: string): Promise<string> {
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}${
    filter ? `&sp=${filter}` : ""
  }`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`YouTube responded ${res.status}`);
  return await res.text();
}

function extractInitialData(html: string): unknown {
  const m = html.match(/var ytInitialData\s*=\s*({.+?});<\/script>/s);
  if (!m) throw new Error("Could not parse YouTube response");
  return JSON.parse(m[1]);
}

function extractItems(data: unknown, limit: number): Item[] {
  const items: Item[] = [];
  // deno-lint-ignore no-explicit-any
  const walk = (node: any) => {
    if (!node || typeof node !== "object" || items.length >= limit) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }

    // ---- Video ----
    if (node.videoRenderer) {
      const v = node.videoRenderer;
      const id: string | undefined = v.videoId;
      const title: string | undefined =
        v.title?.runs?.[0]?.text ?? v.title?.simpleText;
      const channel: string | undefined =
        v.ownerText?.runs?.[0]?.text ??
        v.longBylineText?.runs?.[0]?.text ??
        v.shortBylineText?.runs?.[0]?.text;
      const durationText: string | undefined =
        v.lengthText?.simpleText ?? v.lengthText?.runs?.[0]?.text;
      const viewsText: string | undefined =
        v.viewCountText?.simpleText ?? v.shortViewCountText?.simpleText;
      const published: string | undefined = v.publishedTimeText?.simpleText;
      const thumbs = v.thumbnail?.thumbnails;
      const thumb: string | undefined =
        thumbs?.[thumbs.length - 1]?.url ??
        (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined);

      if (id && title && durationText) {
        const duration = parseDuration(durationText);
        // Skip live/zero duration. Allow up to 35 min so long bhajans /
        // qawwalis / classical pieces are not dropped.
        if (duration > 0 && duration < 2100) {
          items.push({
            type: "video",
            id,
            title,
            artist: channel ?? "YouTube",
            thumbnail: thumb!,
            duration,
            views: viewsText ? parseViews(viewsText) : 0,
            publishedText: published,
          });
        }
      }
    }

    // ---- Channel (artist) ----
    if (node.channelRenderer) {
      const c = node.channelRenderer;
      const id: string | undefined = c.channelId;
      const name: string | undefined =
        c.title?.simpleText ?? c.title?.runs?.[0]?.text;
      const thumbs = c.thumbnail?.thumbnails;
      let thumb: string | undefined = thumbs?.[thumbs.length - 1]?.url;
      if (thumb && thumb.startsWith("//")) thumb = "https:" + thumb;
      const subs: string | undefined =
        c.videoCountText?.simpleText ?? c.subscriberCountText?.simpleText;
      const desc: string | undefined =
        c.descriptionSnippet?.runs?.map((r: { text: string }) => r.text).join("") ??
        c.descriptionSnippet?.simpleText;
      if (id && name && thumb) {
        items.push({ type: "channel", id, name, thumbnail: thumb, subscribers: subs, description: desc });
      }
    }

    // ---- Playlist ----
    if (node.playlistRenderer) {
      const p = node.playlistRenderer;
      const id: string | undefined = p.playlistId;
      const title: string | undefined = p.title?.simpleText;
      const thumbs = p.thumbnails?.[0]?.thumbnails;
      const thumb: string | undefined = thumbs?.[thumbs.length - 1]?.url;
      const videoCount: number = parseInt(p.videoCount ?? "0", 10) || 0;
      const author: string | undefined =
        p.shortBylineText?.runs?.[0]?.text ??
        p.longBylineText?.runs?.[0]?.text;
      if (id && title && thumb) {
        items.push({ type: "playlist", id, title, thumbnail: thumb, videoCount, author });
      }
    }

    for (const k of Object.keys(node)) walk(node[k]);
  };
  walk(data);
  return items;
}

async function searchCategory(query: string, category: Category, limit: number): Promise<Item[]> {
  const html = await fetchYTPage(query, FILTER[category]);
  const data = extractInitialData(html);
  return extractItems(data, limit);
}

// ---------- In-memory response cache ----------
// Repeat queries (e.g. user backspaces & retypes) return instantly.
interface CacheEntry { ts: number; items: Item[] }
const CACHE = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 min
const cacheKey = (q: string, cat: Category, lim: number) => `${cat}:${lim}:${q.toLowerCase()}`;
const getCached = (k: string): Item[] | null => {
  const hit = CACHE.get(k);
  if (!hit) return null;
  if (Date.now() - hit.ts > CACHE_TTL_MS) { CACHE.delete(k); return null; }
  return hit.items;
};
const setCached = (k: string, items: Item[]) => {
  CACHE.set(k, { ts: Date.now(), items });
  // Bound memory: simple FIFO trim
  if (CACHE.size > 500) {
    const firstKey = CACHE.keys().next().value;
    if (firstKey) CACHE.delete(firstKey);
  }
};

// Detect regional / devotional intent so we can broaden the catalogue.
// Crucially: Odia, Bhajan, Bhojpuri, Marathi, Tamil, Telugu, etc. are not
// well-covered by YouTube's "Music" filter alone — we need parallel fan-out.
const REGIONAL_RE = /\b(bhajan|kirtan|aarti|mantra|chant|odia|oriya|jagannath|krishna|ram|hanuman|shiva|durga|saraswati|ganesh|sai baba|bhojpuri|marathi|gujarati|punjabi|tamil|telugu|kannada|malayalam|bengali|assamese|nepali|sanskrit|qawwali|naat|hamd|ghazal|sufi)\b/i;
const isRegionalQuery = (q: string) => REGIONAL_RE.test(q) || /[\u0900-\u097F\u0980-\u09FF\u0B00-\u0B7F\u0A80-\u0AFF\u0A00-\u0A7F\u0B80-\u0BFF\u0C00-\u0C7F\u0C80-\u0CFF\u0D00-\u0D7F]/.test(q);

async function searchCategoryCached(query: string, category: Category, limit: number): Promise<Item[]> {
  const key = cacheKey(query, category, limit);
  const cached = getCached(key);
  if (cached) return cached;
  try {
    const items = await searchCategory(query, category, limit);
    setCached(key, items);
    return items;
  } catch {
    return [];
  }
}

// Fan-out: run several searches in parallel and merge unique results.
// This dramatically widens coverage so obscure / regional / devotional
// titles surface on the first request — Spotify-style breadth.
async function fanoutSearch(query: string, limit: number): Promise<Item[]> {
  const queries: Array<{ q: string; cat: Category }> = [
    { q: query, cat: "music" },
    { q: query, cat: "videos" },
  ];
  if (isRegionalQuery(query)) {
    queries.push({ q: `${query} song`, cat: "videos" });
    queries.push({ q: `${query} bhajan`, cat: "videos" });
    queries.push({ q: `${query} audio`, cat: "videos" });
  } else {
    queries.push({ q: `${query} song`, cat: "music" });
  }

  const results = await Promise.all(
    queries.map(({ q, cat }) => searchCategoryCached(q, cat, limit)),
  );

  // Dedupe preserving insertion order (music first => higher rank)
  const seen = new Set<string>();
  const merged: Item[] = [];
  for (const arr of results) {
    for (const it of arr) {
      const key = it.type === "video" ? `v:${it.id}` : it.type === "channel" ? `c:${it.id}` : `p:${it.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(it);
      if (merged.length >= limit + 25) break;
    }
    if (merged.length >= limit + 25) break;
  }
  return merged;
}

// --- Per-IP sliding-window rate limit ---------------------------------
// Caps anonymous scraping abuse (Sentify's home page needs guest access,
// so we can't require a JWT). 60 requests / minute / IP is plenty for
// real users typing in the search box.
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 60;
const RATE_BUCKETS = new Map<string, number[]>();
const clientIp = (req: Request): string => {
  const xff = req.headers.get("x-forwarded-for") ?? "";
  return xff.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown";
};
const rateLimited = (ip: string): boolean => {
  const now = Date.now();
  const arr = (RATE_BUCKETS.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX) {
    RATE_BUCKETS.set(ip, arr);
    return true;
  }
  arr.push(now);
  RATE_BUCKETS.set(ip, arr);
  // Bound memory
  if (RATE_BUCKETS.size > 5000) {
    const k = RATE_BUCKETS.keys().next().value;
    if (k) RATE_BUCKETS.delete(k);
  }
  return false;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    if (rateLimited(clientIp(req))) {
      return new Response(
        JSON.stringify({ items: [], error: "Rate limit exceeded" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim();
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "30", 10), 50);
    const requested = (url.searchParams.get("category") ?? "music") as Category;
    const category: Category = requested in FILTER ? requested : "music";
    if (!q) {
      return new Response(JSON.stringify({ items: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // For the default "music" category we run the wide fan-out so regional
    // / devotional / niche tracks (Odia bhajans, Sufi qawwalis, etc.) all
    // appear. Other explicit categories use the focused single search.
    const items =
      category === "music"
        ? await fanoutSearch(q, limit)
        : await searchCategoryCached(q, category, limit);

    return new Response(JSON.stringify({ items }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ items: [], error: (err as Error).message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
