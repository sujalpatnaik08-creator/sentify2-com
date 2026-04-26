import type { Track } from "@/types/music";

// Deezer public API via CORS proxy (no API key needed).
// Provides global music catalog with 30-second preview clips.
const DEEZER_BASE = "https://api.deezer.com";
const CORS_PROXY = "https://corsproxy.io/?url=";

interface DeezerTrack {
  id: number;
  title: string;
  duration: number;
  preview: string;
  artist: { name: string };
  album: { title: string; cover_medium: string; cover_big: string };
}

const mapDeezer = (t: DeezerTrack): Track => ({
  id: `d-${t.id}`,
  title: t.title,
  artist: t.artist?.name || "Unknown",
  album: t.album?.title || "",
  artwork: t.album?.cover_big || t.album?.cover_medium || "/placeholder.svg",
  audioUrl: t.preview,
  duration: t.duration,
  source: "deezer",
});

const proxied = (url: string) => `${CORS_PROXY}${encodeURIComponent(url)}`;

async function deezerFetch(path: string, throwOnError = false): Promise<DeezerTrack[]> {
  try {
    const res = await fetch(proxied(`${DEEZER_BASE}${path}`));
    if (!res.ok) {
      if (throwOnError) throw new Error(`Music service returned ${res.status}`);
      return [];
    }
    const data = await res.json();
    return (data.data || data.tracks?.data || []).filter((t: DeezerTrack) => t.preview);
  } catch (err) {
    if (throwOnError) throw err instanceof Error ? err : new Error("Network error");
    return [];
  }
}

export async function searchTracks(query: string, limit = 30): Promise<Track[]> {
  if (!query.trim()) return [];
  const tracks = await deezerFetch(`/search?q=${encodeURIComponent(query)}&limit=${limit}`, true);
  return tracks.map(mapDeezer);
}

const TAG_TO_QUERY: Record<string, string> = {
  happy: "happy hits",
  chill: "chill",
  focus: "focus instrumental",
  workout: "workout",
  sad: "sad songs",
  party: "party hits",
  romance: "love songs",
  sleep: "sleep relax",
  pop: "pop hits",
  rock: "rock hits",
  electronic: "electronic dance",
  hiphop: "hip hop",
  jazz: "jazz",
  classical: "classical music",
};

export async function tracksByTag(tag: string, limit = 30): Promise<Track[]> {
  const q = TAG_TO_QUERY[tag.toLowerCase()] || tag;
  const tracks = await deezerFetch(`/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  return tracks.map(mapDeezer);
}

export async function topTracks(limit = 30): Promise<Track[]> {
  // Deezer's "Top tracks" chart playlist
  const tracks = await deezerFetch(`/chart/0/tracks?limit=${limit}`);
  if (tracks.length) return tracks.map(mapDeezer);
  // fallback
  const fallback = await deezerFetch(`/search?q=top hits&limit=${limit}`);
  return fallback.map(mapDeezer);
}

export async function fetchLyrics(artist: string, title: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(title)}`,
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.lyrics || null;
  } catch {
    return null;
  }
}
