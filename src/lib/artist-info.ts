// Lightweight artist-info fetcher.
// Uses Wikipedia REST API (no auth, CORS-friendly) to get a short bio +
// hero image for the "About the artist" card in the Now Playing view.
// All results cached in-memory for the session so re-opening NPV is instant.

export interface ArtistInfo {
  name: string;
  bio: string | null;
  image: string | null;
  url: string | null;
}

const cache = new Map<string, ArtistInfo>();

const cleanArtist = (raw: string): string =>
  raw
    .replace(/\s*-\s*topic$/i, "")
    .replace(/\bvevo\b/i, "")
    .replace(/\s*\(.*?\)\s*/g, " ")
    .replace(/[,&]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 6)
    .join(" ");

async function tryWiki(title: string): Promise<ArtistInfo | null> {
  try {
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.type === "disambiguation") return null;
    return {
      name: data.title || title,
      bio: data.extract || null,
      image: data.thumbnail?.source || data.originalimage?.source || null,
      url: data.content_urls?.desktop?.page || null,
    };
  } catch {
    return null;
  }
}

export async function getArtistInfo(artist: string): Promise<ArtistInfo> {
  const name = cleanArtist(artist) || artist;
  const key = name.toLowerCase();
  const hit = cache.get(key);
  if (hit) return hit;

  // Try a few title variants (Wikipedia disambiguates common names with
  // "(singer)", "(musician)", "(rapper)" suffixes).
  const candidates = [
    `${name} (singer)`,
    `${name} (musician)`,
    `${name} (rapper)`,
    `${name} (band)`,
    name,
  ];
  for (const c of candidates) {
    const info = await tryWiki(c);
    if (info && info.bio) {
      cache.set(key, info);
      return info;
    }
  }
  const fallback: ArtistInfo = { name, bio: null, image: null, url: null };
  cache.set(key, fallback);
  return fallback;
}
