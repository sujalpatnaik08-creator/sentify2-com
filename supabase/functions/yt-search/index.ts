// YouTube search proxy — runs server-side so there are no CORS / IP-block
// issues like Piped/Invidious public instances. No API key required.
// Scrapes the public YouTube search page and extracts video metadata.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

interface VideoItem {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
}

const parseDuration = (text: string): number => {
  // "3:45" or "1:02:33"
  const parts = text.split(":").map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) return 0;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
};

async function searchYouTube(query: string, limit: number): Promise<VideoItem[]> {
  // sp=EgIQAQ%253D%253D filters to videos only
  const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(
    query,
  )}&sp=EgIQAQ%253D%253D`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
  });
  if (!res.ok) throw new Error(`YouTube responded ${res.status}`);
  const html = await res.text();

  // Initial player data is embedded as: var ytInitialData = {...};
  const m = html.match(/var ytInitialData\s*=\s*({.+?});<\/script>/s);
  if (!m) throw new Error("Could not parse YouTube response");

  // deno-lint-ignore no-explicit-any
  const data: any = JSON.parse(m[1]);

  const results: VideoItem[] = [];
  // deno-lint-ignore no-explicit-any
  const walk = (node: any) => {
    if (!node || typeof node !== "object" || results.length >= limit) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
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
        v.lengthText?.simpleText ??
        v.lengthText?.runs?.[0]?.text;
      const thumbs = v.thumbnail?.thumbnails;
      const thumb: string | undefined =
        thumbs?.[thumbs.length - 1]?.url ??
        (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : undefined);

      if (id && title && durationText) {
        const duration = parseDuration(durationText);
        // Skip 0-second items (live streams, shorts can be 0) and >20min (likely full albums/podcasts)
        if (duration > 0 && duration < 1200) {
          results.push({
            id,
            title,
            artist: channel ?? "YouTube",
            thumbnail: thumb!,
            duration,
          });
        }
      }
    }
    for (const k of Object.keys(node)) walk(node[k]);
  };
  walk(data);
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const url = new URL(req.url);
    const q = url.searchParams.get("q")?.trim();
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "30", 10), 50);
    if (!q) {
      return new Response(JSON.stringify({ items: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const items = await searchYouTube(q, limit);
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
      {
        status: 200, // soft-fail so client can fallback
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
