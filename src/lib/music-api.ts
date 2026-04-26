import type { Track } from "@/types/music";

// iTunes Search API - fully public, CORS-enabled, no API key, no proxy needed.
// Provides 30-second preview clips for millions of tracks (same model as Freefy/Deezer previews).
const ITUNES_BASE = "https://itunes.apple.com";

interface ITunesTrack {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName?: string;
  artworkUrl100?: string;
  artworkUrl60?: string;
  previewUrl?: string;
  trackTimeMillis?: number;
  wrapperType?: string;
  kind?: string;
}

const upgradeArtwork = (url?: string) =>
  url ? url.replace(/\/\d+x\d+bb\.(jpg|png)$/i, "/600x600bb.$1") : "/placeholder.svg";

const mapITunes = (t: ITunesTrack): Track => ({
  id: `it-${t.trackId}`,
  title: t.trackName,
  artist: t.artistName || "Unknown",
  album: t.collectionName || "",
  artwork: upgradeArtwork(t.artworkUrl100 || t.artworkUrl60),
  audioUrl: t.previewUrl!,
  duration: t.trackTimeMillis ? Math.round(t.trackTimeMillis / 1000) : 30,
  source: "deezer", // keep type compatible
});

async function itunesFetch(params: Record<string, string>, throwOnError = false): Promise<ITunesTrack[]> {
  const qs = new URLSearchParams({ media: "music", entity: "song", ...params }).toString();
  try {
    const res = await fetch(`${ITUNES_BASE}/search?${qs}`);
    if (!res.ok) {
      if (throwOnError) throw new Error(`Music service returned ${res.status}`);
      return [];
    }
    const data = await res.json();
    return (data.results || []).filter(
      (t: ITunesTrack) => t.previewUrl && (t.kind === "song" || t.wrapperType === "track"),
    );
  } catch (err) {
    if (throwOnError) throw err instanceof Error ? err : new Error("Network error");
    return [];
  }
}

export async function searchTracks(query: string, limit = 30): Promise<Track[]> {
  if (!query.trim()) return [];
  const tracks = await itunesFetch({ term: query, limit: String(limit) }, true);
  return tracks.map(mapITunes);
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
  chillout: "chillout",
  ambient: "ambient",
  acoustic: "acoustic",
  love: "love songs",
  instrumental: "instrumental",
};

export async function tracksByTag(tag: string, limit = 30): Promise<Track[]> {
  const q = TAG_TO_QUERY[tag.toLowerCase()] || tag;
  const tracks = await itunesFetch({ term: q, limit: String(limit) });
  return tracks.map(mapITunes);
}

export async function topTracks(limit = 30): Promise<Track[]> {
  // iTunes search for current top hits
  const tracks = await itunesFetch({ term: "top hits", limit: String(limit) });
  if (tracks.length) return tracks.map(mapITunes);
  const fallback = await itunesFetch({ term: "pop", limit: String(limit) });
  return fallback.map(mapITunes);
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
