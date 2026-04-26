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
        // Skip live (0s) and very long (>20min: likely full albums/podcasts)
        if (duration > 0 && duration < 1200) {
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
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

    const items = await searchCategory(q, category, limit);

    // For music searches, top up with broader videos if we got too few music
    // hits — keeps obscure tracks discoverable.
    if (category === "music" && items.filter((i) => i.type === "video").length < 8) {
      try {
        const extra = await searchCategory(q, "videos", limit);
        const seen = new Set(
          items.map((i) => (i.type === "video" ? i.id : `${i.type}:${(i as ChannelItem | PlaylistItem).id}`)),
        );
        for (const it of extra) {
          const key = it.type === "video" ? it.id : `${it.type}:${it.id}`;
          if (!seen.has(key)) {
            items.push(it);
            seen.add(key);
          }
          if (items.length >= limit + 15) break;
        }
      } catch { /* ignore */ }
    }

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
