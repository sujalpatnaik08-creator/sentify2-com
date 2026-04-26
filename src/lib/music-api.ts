import type { Track } from "@/types/music";

// =============================================================================
// Music sources
// =============================================================================
// Sentify uses TWO sources, all free, no API key, CORS-enabled, FULL-LENGTH:
//   1. YouTube (via Piped public instances) — primary source, has every
//      Bollywood/Hollywood/global song. Full-length. Played via YouTube IFrame.
//   2. Audius — fallback for indie/electronic catalog.
// =============================================================================

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.adminforge.de",
  "https://api-piped.mha.fi",
  "https://pipedapi.reallyaweso.me",
];

const AUDIUS_HOST = "https://discoveryprovider.audius.co";
const APP_NAME = "sentify";

// ---------- YouTube via Piped ----------

interface PipedItem {
  type?: string;
  url?: string;        // "/watch?v=XXXX"
  title?: string;
  thumbnail?: string;
  uploaderName?: string;
  uploader?: string;
  duration?: number;
}

const ytIdFromUrl = (url?: string): string | null => {
  if (!url) return null;
  const m = url.match(/[?&]v=([\w-]{11})/);
  return m ? m[1] : null;
};

const mapPiped = (item: PipedItem): Track | null => {
  const id = ytIdFromUrl(item.url);
  if (!id || !item.title) return null;
  return {
    id: `yt-${id}`,
    title: item.title,
    artist: item.uploaderName || item.uploader || "YouTube",
    album: "",
    artwork:
      item.thumbnail ||
      `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    audioUrl: id, // store youtube video id
    duration: item.duration && item.duration > 0 ? item.duration : 0,
    source: "youtube",
  };
};

async function pipedFetch(path: string): Promise<PipedItem[]> {
  for (const host of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${host}${path}`);
      if (!res.ok) continue;
      const data = await res.json();
      // search returns { items: [...] }, trending returns array directly
      if (Array.isArray(data)) return data;
      if (Array.isArray(data.items)) return data.items;
      return [];
    } catch {
      continue;
    }
  }
  return [];
}

async function youtubeSearch(query: string, limit: number): Promise<Track[]> {
  const items = await pipedFetch(
    `/search?q=${encodeURIComponent(query)}&filter=music_songs`,
  );
  const tracks: Track[] = [];
  for (const it of items) {
    if (it.type && it.type !== "stream") continue;
    const t = mapPiped(it);
    if (t) tracks.push(t);
    if (tracks.length >= limit) break;
  }
  return tracks;
}

async function youtubeTrending(limit: number): Promise<Track[]> {
  // Piped trending isn't music-filtered, so search popular charts instead.
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
