import type { Track } from "@/types/music";
import { supabase } from "@/integrations/supabase/client";

// =============================================================================
// Music sources
// =============================================================================
// Sentify uses YouTube as the primary source (full Bollywood/Hollywood/world
// catalog, full-length playback via the IFrame player) and Audius as a
// fallback for indie/electronic catalog. Search is done server-side via the
// `yt-search` edge function to avoid CORS and IP blocks.
// =============================================================================

const AUDIUS_HOST = "https://discoveryprovider.audius.co";
const APP_NAME = "sentify";

// ---------- Shared types ----------

export type Language = "hindi" | "english" | "spanish" | "korean" | "japanese" | "arabic" | "other";

export interface ArtistResult {
  id: string;
  name: string;
  thumbnail: string;
  subscribers?: string;
  description?: string;
}

export interface PlaylistResult {
  id: string;
  title: string;
  thumbnail: string;
  videoCount: number;
  author?: string;
}

export interface SearchResults {
  tracks: Track[];
  artists: ArtistResult[];
  playlists: PlaylistResult[];
}

// ---------- Language detection ----------

const HINDI_RE = /[\u0900-\u097F]/;
const ARABIC_RE = /[\u0600-\u06FF]/;
const HANGUL_RE = /[\uAC00-\uD7AF]/;
const HIRAGANA_KATAKANA_RE = /[\u3040-\u30FF]/;
const HINDI_KEYWORDS = /\b(hindi|bollywood|punjabi|tamil|telugu|bhojpuri|arijit|shreya|atif|honey singh|kk|sonu nigam|lata|kishore|rahat|sidhu)\b/i;
const SPANISH_KEYWORDS = /\b(latin|espanol|reggaeton|bachata|bad bunny|shakira|maluma|ozuna)\b/i;

export const detectLanguage = (text: string): Language => {
  if (HINDI_RE.test(text)) return "hindi";
  if (ARABIC_RE.test(text)) return "arabic";
  if (HANGUL_RE.test(text)) return "korean";
  if (HIRAGANA_KATAKANA_RE.test(text)) return "japanese";
  if (HINDI_KEYWORDS.test(text)) return "hindi";
  if (SPANISH_KEYWORDS.test(text)) return "spanish";
  // Mostly latin alphabet → English (best-effort default for global pop)
  return "english";
};

// ---------- YouTube (server-side via edge function) ----------

interface YtVideo {
  type: "video";
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
  views: number;
  publishedText?: string;
}
interface YtChannel {
  type: "channel";
  id: string;
  name: string;
  thumbnail: string;
  subscribers?: string;
  description?: string;
}
interface YtPlaylist {
  type: "playlist";
  id: string;
  title: string;
  thumbnail: string;
  videoCount: number;
  author?: string;
}
type YtItem = YtVideo | YtChannel | YtPlaylist;

const mapYtVideo = (item: YtVideo): Track => ({
  id: `yt-${item.id}`,
  title: item.title,
  artist: item.artist || "YouTube",
  album: "",
  artwork: item.thumbnail || `https://i.ytimg.com/vi/${item.id}/hqdefault.jpg`,
  audioUrl: item.id, // store youtube video id; PlayerBar plays via IFrame
  duration: item.duration > 0 ? item.duration : 0,
  source: "youtube",
});

// Smart ranking: blends popularity (views) with a duration sweet-spot
// (most songs are 2.5–5 min). Pure-views ranking buries good tracks behind
// joke uploads, so we apply a soft Gaussian-ish weight around 210s.
const scoreTrack = (v: YtVideo): number => {
  const views = Math.max(1, v.views);
  const popularityScore = Math.log10(views); // 0..10
  const ideal = 210; // 3:30
  const deltaMin = Math.abs(v.duration - ideal) / 60; // minutes off
  const durationScore = Math.exp(-(deltaMin * deltaMin) / 8); // 0..1
  return popularityScore * (0.5 + 0.5 * durationScore);
};

async function fetchYt(
  query: string,
  category: "music" | "videos" | "playlists" | "channels" | "all",
  limit: number,
): Promise<YtItem[]> {
  // Try supabase-js helper first (works in dev), fall back to direct fetch
  // (more reliable for query-string GETs).
  try {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/yt-search?q=${encodeURIComponent(
      query,
    )}&limit=${limit}&category=${category}`;
    const res = await fetch(url, {
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
      },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.items) ? (data.items as YtItem[]) : [];
  } catch {
    return [];
  }
}

async function youtubeSearchAll(query: string, limit: number): Promise<SearchResults> {
  // Single edge-function call returns videos + channels + playlists from
  // the music-category page. That gives us everything in one network round-trip.
  const items = await fetchYt(query, "music", limit);

  const videos = items.filter((i): i is YtVideo => i.type === "video");
  const channels = items.filter((i): i is YtChannel => i.type === "channel");
  const playlists = items.filter((i): i is YtPlaylist => i.type === "playlist");

  // If no playlists/channels came back from music page, hit the dedicated
  // playlists page so the Albums/Artists tabs aren't empty for niche queries.
  let extraPlaylists: YtPlaylist[] = [];
  if (playlists.length === 0) {
    const pl = await fetchYt(query, "playlists", 12);
    extraPlaylists = pl.filter((i): i is YtPlaylist => i.type === "playlist");
  }
  let extraChannels: YtChannel[] = [];
  if (channels.length === 0) {
    const ch = await fetchYt(query, "channels", 8);
    extraChannels = ch.filter((i): i is YtChannel => i.type === "channel");
  }

  const rankedTracks = [...videos]
    .sort((a, b) => scoreTrack(b) - scoreTrack(a))
    .slice(0, limit)
    .map(mapYtVideo);

  return {
    tracks: rankedTracks,
    artists: [...channels, ...extraChannels].slice(0, 12).map((c) => ({
      id: c.id,
      name: c.name,
      thumbnail: c.thumbnail,
      subscribers: c.subscribers,
      description: c.description,
    })),
    playlists: [...playlists, ...extraPlaylists].slice(0, 12).map((p) => ({
      id: p.id,
      title: p.title,
      thumbnail: p.thumbnail,
      videoCount: p.videoCount,
      author: p.author,
    })),
  };
}

async function youtubeSearchVideos(query: string, limit: number): Promise<Track[]> {
  const items = await fetchYt(query, "music", limit);
  const videos = items.filter((i): i is YtVideo => i.type === "video");
  return videos
    .sort((a, b) => scoreTrack(b) - scoreTrack(a))
    .slice(0, limit)
    .map(mapYtVideo);
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

export async function searchAll(query: string, limit = 40): Promise<SearchResults> {
  if (!query.trim()) return { tracks: [], artists: [], playlists: [] };
  const yt = await youtubeSearchAll(query, limit);
  if (yt.tracks.length > 0) return yt;
  // Fallback to Audius (tracks only)
  const au = await audiusFetch(
    `/v1/tracks/search?query=${encodeURIComponent(query)}&limit=${limit}`,
  );
  if (au.length > 0) {
    return { tracks: au.map(mapAudius), artists: [], playlists: [] };
  }
  throw new Error("Music service is unreachable. Please try again.");
}

export async function searchTracks(query: string, limit = 30): Promise<Track[]> {
  if (!query.trim()) return [];
  const yt = await youtubeSearchVideos(query, limit);
  if (yt.length > 0) return yt;
  const au = await audiusFetch(
    `/v1/tracks/search?query=${encodeURIComponent(query)}&limit=${limit}`,
  );
  if (au.length > 0) return au.map(mapAudius);
  throw new Error("Music service is unreachable. Please try again.");
}

export async function tracksByTag(tag: string, limit = 30): Promise<Track[]> {
  const yt = await youtubeSearchVideos(tag, limit);
  if (yt.length > 0) return yt;
  const au = await audiusFetch(
    `/v1/tracks/search?query=${encodeURIComponent(tag)}&limit=${limit}`,
  );
  return au.map(mapAudius);
}

export async function topTracks(limit = 30): Promise<Track[]> {
  const yt = await youtubeSearchVideos("top hits 2024", limit);
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
  // Clean YouTube-style titles like "Song Name (Official Video) [HD]"
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

  // 1. LRCLIB exact (synced)
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
  } catch { /* ignore */ }

  // 2. LRCLIB search
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
  } catch { /* ignore */ }

  // 3. lyrics.ovh (plain only)
  try {
    const res = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(cleanTitle)}`,
    );
    if (res.ok) {
      const data = await res.json();
      if (data.lyrics) return { plain: data.lyrics, synced: null };
    }
  } catch { /* ignore */ }

  return { plain: null, synced: null };
}
