import type { Track } from "@/types/music";

// Audius — decentralized music platform with full-length track streaming.
// Public API, CORS-enabled, no API key, no proxy. Streams full songs (not previews).
const AUDIUS_HOST = "https://discoveryprovider.audius.co";
const APP_NAME = "sentify";

interface AudiusUser {
  name?: string;
  handle?: string;
}
interface AudiusTrack {
  id: string;
  title: string;
  duration: number;
  user?: AudiusUser;
  artwork?: { "150x150"?: string; "480x480"?: string; "1000x1000"?: string } | null;
  genre?: string;
  mood?: string;
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
  source: "deezer",
});

async function audiusFetch(path: string, throwOnError = false): Promise<AudiusTrack[]> {
  try {
    const sep = path.includes("?") ? "&" : "?";
    const res = await fetch(`${AUDIUS_HOST}${path}${sep}app_name=${APP_NAME}`);
    if (!res.ok) {
      if (throwOnError) throw new Error(`Music service returned ${res.status}`);
      return [];
    }
    const data = await res.json();
    return (data.data || []).filter((t: AudiusTrack) => t && t.id && t.title);
  } catch (err) {
    if (throwOnError) throw err instanceof Error ? err : new Error("Network error");
    return [];
  }
}

export async function searchTracks(query: string, limit = 30): Promise<Track[]> {
  if (!query.trim()) return [];
  const tracks = await audiusFetch(
    `/v1/tracks/search?query=${encodeURIComponent(query)}&limit=${limit}`,
    true,
  );
  return tracks.map(mapAudius);
}

const TAG_TO_GENRE: Record<string, string> = {
  happy: "Pop",
  chill: "Electronic",
  focus: "Ambient",
  workout: "Electronic",
  sad: "Acoustic",
  party: "Electronic",
  romance: "R&B/Soul",
  sleep: "Ambient",
  pop: "Pop",
  rock: "Rock",
  electronic: "Electronic",
  hiphop: "Hip-Hop/Rap",
  jazz: "Jazz",
  classical: "Classical",
  chillout: "Electronic",
  ambient: "Ambient",
  acoustic: "Acoustic",
  love: "R&B/Soul",
  instrumental: "Ambient",
};

export async function tracksByTag(tag: string, limit = 30): Promise<Track[]> {
  const genre = TAG_TO_GENRE[tag.toLowerCase()] || tag;
  const tracks = await audiusFetch(
    `/v1/tracks/trending?genre=${encodeURIComponent(genre)}&limit=${limit}`,
  );
  if (tracks.length) return tracks.map(mapAudius);
  // fallback: search by tag
  const fallback = await audiusFetch(
    `/v1/tracks/search?query=${encodeURIComponent(tag)}&limit=${limit}`,
  );
  return fallback.map(mapAudius);
}

export async function topTracks(limit = 30): Promise<Track[]> {
  const tracks = await audiusFetch(`/v1/tracks/trending?limit=${limit}`);
  if (tracks.length) return tracks.map(mapAudius);
  const fallback = await audiusFetch(
    `/v1/tracks/search?query=${encodeURIComponent("top hits")}&limit=${limit}`,
  );
  return fallback.map(mapAudius);
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
