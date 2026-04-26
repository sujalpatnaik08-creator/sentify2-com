import type { Track } from "@/types/music";
import { supabase } from "@/integrations/supabase/client";

// =============================================================================
// Music sources
// =============================================================================
// Sentify uses TWO sources, all free, no API key, CORS-enabled, FULL-LENGTH:
//   1. YouTube — primary source, has every Bollywood/Hollywood/global song.
//      Searched server-side via the `yt-search` edge function (avoids the CORS
//      and IP blocks that kill public Piped/Invidious instances). Played
//      full-length via the YouTube IFrame player.
//   2. Audius — fallback for indie/electronic catalog when YouTube fails.
// =============================================================================

const AUDIUS_HOST = "https://discoveryprovider.audius.co";
const APP_NAME = "sentify";

// ---------- YouTube (server-side via edge function) ----------

interface YtItem {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
}

const mapYt = (item: YtItem): Track => ({
  id: `yt-${item.id}`,
  title: item.title,
  artist: item.artist || "YouTube",
  album: "",
  artwork: item.thumbnail || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
  audioUrl: item.id, // store youtube video id; PlayerBar plays via IFrame
  duration: item.duration > 0 ? item.duration : 0,
  source: "youtube",
});

async function youtubeSearch(query: string, limit: number): Promise<Track[]> {
  try {
    const { data, error } = await supabase.functions.invoke("yt-search", {
      body: null,
      method: "GET",
      headers: {},
      // pass query via URL params
    } as never);
    // The supabase-js invoke helper doesn't expose query string for GET easily;
    // fall through to direct fetch for reliability.
    if (!error && data?.items?.length) {
      return (data.items as YtItem[]).slice(0, limit).map(mapYt);
    }
  } catch {
    /* fall through to direct fetch below */
  }

  // Direct fetch — reliable and supports query params cleanly
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yt-search?q=${encodeURIComponent(
      query,
    )}&limit=${limit}`;
    const res = await fetch(url, {
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!Array.isArray(data?.items)) return [];
    return (data.items as YtItem[]).slice(0, limit).map(mapYt);
  } catch {
    return [];
  }
}

async function youtubeTrending(limit: number): Promise<Track[]> {
  return youtubeSearch("top hits 2024", limit);
}

// ---------- Audius fallback ----------

interface AudiusUser { name?: string; handle?: string }
interface AudiusTrack {
  id: string;
  title: string;
  duration: number;
  user?: AudiusUser;
  artwork?: { "150x150"?: string; "480x480"?: string; "1000x1000"?: string } | null;
  genre?: string;
}

const mapAudius = (t: AudiusTrack): Track => ({
  id: `au-${t.id}`,
  title: t.title,
  artist: t.user?.name || t.user?.handle || "Unknown",
  album: t.genre || "",
  artwork:
    t.artwork?.["1000x1000"] ||
    t.artwork?.["480x480"] ||
    t.artwork?.["150x150"] ||
    "/placeholder.svg",
  audioUrl: `${AUDIUS_HOST}/v1/tracks/${t.id}/stream?app_name=${APP_NAME}`,
  duration: t.duration || 0,
  source: "audius",
});

async function audiusFetch(path: string): Promise<AudiusTrack[]> {
  try {
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetch(`${AUDIUS_HOST}${path}${sep}app_name=${APP_NAME}`);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.data || []).filter((t: AudiusTrack) => t && t.id && t.title);
  } catch {
    return [];
  }
}

// ---------- Public API ----------

export async function searchTracks(query: string, limit = 30): Promise<Track[]> {
  if (!query.trim()) return [];
  // Try YouTube first (full Bollywood/Hollywood/world catalog).
  const yt = await youtubeSearch(query, limit);
  if (yt.length > 0) return yt;
  // Fallback to Audius.
  const au = await audiusFetch(
    `/v1/tracks/search?query=${encodeURIComponent(query)}&limit=${limit}`,
  );
  if (au.length > 0) return au.map(mapAudius);
  throw new Error("Music service is unreachable. Please try again.");
}

export async function tracksByTag(tag: string, limit = 30): Promise<Track[]> {
  const yt = await youtubeSearch(tag, limit);
  if (yt.length > 0) return yt;
  const au = await audiusFetch(
    `/v1/tracks/search?query=${encodeURIComponent(tag)}&limit=${limit}`,
  );
  return au.map(mapAudius);
}

export async function topTracks(limit = 30): Promise<Track[]> {
  const yt = await youtubeTrending(limit);
  if (yt.length > 0) return yt;
  const au = await audiusFetch(`/v1/tracks/trending?limit=${limit}`);
  return au.map(mapAudius);
}

// ---------- Lyrics (synced) ----------

export interface LyricLine { time: number; text: string }
export interface LyricsResult {
  plain: string | null;
  synced: LyricLine[] | null;
}

const parseLrc = (lrc: string): LyricLine[] => {
  const lines: LyricLine[] = [];
  for (const raw of lrc.split(/\r?\n/)) {
    const matches = [...raw.matchAll(/\[(\d+):(\d+(?:\.\d+)?)\]/g)];
    if (!matches.length) continue;
    const text = raw.replace(/\[\d+:\d+(?:\.\d+)?\]/g, "").trim();
    for (const m of matches) {
      const min = parseInt(m[1], 10);
      const sec = parseFloat(m[2]);
      lines.push({ time: min * 60 + sec, text });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
};

export async function fetchLyrics(
  artist: string,
  title: string,
  duration?: number,
): Promise<LyricsResult> {
  // Clean up YouTube-style titles like "Song Name (Official Video) [HD]"
  const cleanTitle = title
    .replace(/\([^)]*\)/g, "")
    .replace(/\[[^\]]*\]/g, "")
    .replace(/\b(official|video|audio|lyric|lyrics|hd|4k|mv|m\/v)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const cleanArtist = artist
    .replace(/\s*-\s*topic$/i, "")
    .replace(/vevo$/i, "")
    .trim();

  // Try LRCLIB (synced lyrics, free, CORS-enabled)
  try {
    const params = new URLSearchParams({
      artist_name: cleanArtist,
      track_name: cleanTitle,
    });
    if (duration && duration > 0) params.set("duration", String(Math.round(duration)));
    const res = await fetch(`https://lrclib.net/api/get?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      const synced = data.syncedLyrics ? parseLrc(data.syncedLyrics) : null;
      const plain = data.plainLyrics || (synced ? synced.map((l) => l.text).join("\n") : null);
      if (synced || plain) return { synced, plain };
    }
  } catch {
    /* ignore */
  }

  // Fallback: search LRCLIB by query
  try {
    const res = await fetch(
      `https://lrclib.net/api/search?q=${encodeURIComponent(`${cleanArtist} ${cleanTitle}`)}`,
    );
    if (res.ok) {
      const arr = await res.json();
      if (Array.isArray(arr) && arr.length > 0) {
        const hit = arr[0];
        const synced = hit.syncedLyrics ? parseLrc(hit.syncedLyrics) : null;
        const plain = hit.plainLyrics || (synced ? synced.map((l: LyricLine) => l.text).join("\n") : null);
        if (synced || plain) return { synced, plain };
      }
    }
  } catch {
    /* ignore */
  }

  // Final fallback: lyrics.ovh (plain only)
  try {
    const res = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(cleanTitle)}`,
    );
    if (res.ok) {
      const data = await res.json();
      if (data.lyrics) return { plain: data.lyrics, synced: null };
    }
  } catch {
    /* ignore */
  }

  return { plain: null, synced: null };
}
