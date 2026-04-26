import type { Track } from "@/types/music";

// Jamendo: free, legal, full-length tracks from independent artists.
// Public client_id documented in Jamendo API quickstart.
const JAMENDO_CLIENT_ID = "8a59f08d";
const JAMENDO_BASE = "https://api.jamendo.com/v3.0";

interface JamendoTrack {
  id: string;
  name: string;
  artist_name: string;
  album_name: string;
  album_image: string;
  image: string;
  audio: string;
  duration: number;
}

const mapJamendo = (t: JamendoTrack): Track => ({
  id: `j-${t.id}`,
  title: t.name,
  artist: t.artist_name,
  album: t.album_name,
  artwork: t.album_image || t.image || "/placeholder.svg",
  audioUrl: t.audio,
  duration: t.duration,
  source: "jamendo",
});

export async function searchTracks(query: string, limit = 30): Promise<Track[]> {
  if (!query.trim()) return [];
  const url = `${JAMENDO_BASE}/tracks/?client_id=${JAMENDO_CLIENT_ID}&format=json&limit=${limit}&search=${encodeURIComponent(
    query,
  )}&audioformat=mp32&include=musicinfo`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Search failed");
  const data = await res.json();
  return (data.results || []).map(mapJamendo);
}

export async function tracksByTag(tag: string, limit = 30): Promise<Track[]> {
  const url = `${JAMENDO_BASE}/tracks/?client_id=${JAMENDO_CLIENT_ID}&format=json&limit=${limit}&tags=${encodeURIComponent(
    tag,
  )}&audioformat=mp32&order=popularity_total`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Fetch failed");
  const data = await res.json();
  return (data.results || []).map(mapJamendo);
}

export async function topTracks(limit = 30): Promise<Track[]> {
  const url = `${JAMENDO_BASE}/tracks/?client_id=${JAMENDO_CLIENT_ID}&format=json&limit=${limit}&order=popularity_total&audioformat=mp32`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Fetch failed");
  const data = await res.json();
  return (data.results || []).map(mapJamendo);
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
