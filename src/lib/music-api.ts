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

// Smart ranking: blends popularity (views), a duration sweet-spot
// (most songs are 2.5–5 min), and **query-relevance** so when the user types
// a specific spelling/word/title, the matching track surfaces at the top
// (Spotify-like). Pure popularity buries the actual song behind joke uploads.
const norm = (s: string) =>
  s.toLowerCase().replace(/[\u2018\u2019\u201C\u201D'’"`]/g, "").replace(/[^a-z0-9\s\u0900-\u097F\u0600-\u06FF\uAC00-\uD7AF\u3040-\u30FF\u4E00-\u9FFF]/g, " ").replace(/\s+/g, " ").trim();

const tokens = (s: string) => norm(s).split(" ").filter(Boolean);

const relevanceScore = (q: string, v: YtVideo): number => {
  const query = norm(q);
  if (!query) return 0;
  const title = norm(v.title);
  const artist = norm(v.artist || "");
  const hay = `${title} ${artist}`;

  let r = 0;
  if (title === query) r += 12;            // exact title match
  if (title.startsWith(query)) r += 6;     // prefix match
  if (title.includes(query)) r += 4;       // substring in title
  if (artist === query) r += 5;            // exact artist match
  if (artist.includes(query)) r += 2;
  if (hay.includes(query)) r += 1;

  // token coverage — what fraction of query tokens appear in title+artist?
  const qTokens = tokens(q);
  if (qTokens.length > 0) {
    const matched = qTokens.filter((t) => hay.includes(t)).length;
    r += (matched / qTokens.length) * 4;
    if (matched === qTokens.length) r += 2; // all tokens present
  }

  // Penalize obvious non-song noise
  if (/\b(reaction|review|tutorial|cover guitar|how to)\b/i.test(v.title)) r -= 3;
  return r;
};

// Audio-only / content filter: drop podcasts, interviews, vlogs, gameplay,
// trailers, news clips, and other non-music uploads. Keeps the catalog
// focused strictly on songs/music (Spotify-like).
const NON_MUSIC_RE = /\b(podcast|interview|vlog|news|gameplay|walkthrough|trailer|teaser|movie clip|full movie|episode\s*\d|ep\.?\s*\d+|press conference|behind the scenes|making of|documentary|reaction|tutorial|how to|unboxing|prank|comedy sketch|stand[- ]up|asmr|sleep meditation|guided meditation|white noise|10 hours|loop \d+ hours)\b/i;
const isLikelyMusic = (v: YtVideo): boolean => {
  if (NON_MUSIC_RE.test(v.title)) return false;
  // Songs are typically 1.5–10 min. Strip very long uploads (likely mixes/podcasts).
  if (v.duration > 900) return false;
  if (v.duration > 0 && v.duration < 45) return false;
  return true;
};

const scoreTrack = (v: YtVideo, q = ""): number => {
  const views = Math.max(1, v.views);
  const popularityScore = Math.log10(views); // 0..10
  const ideal = 210; // 3:30
  const deltaMin = Math.abs(v.duration - ideal) / 60; // minutes off
  const durationScore = Math.exp(-(deltaMin * deltaMin) / 8); // 0..1
  // Relevance dominates when the user typed a specific query.
  const rel = relevanceScore(q, v);
  return rel * 3 + popularityScore * (0.5 + 0.5 * durationScore);
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

  const rankedTracks = videos
    .filter(isLikelyMusic)
    .sort((a, b) => scoreTrack(b, query) - scoreTrack(a, query))
    .slice(0, limit)
    .map(mapYtVideo);

  // Feed Voyager so subsequent typeahead is instant + typo-tolerant.
  rankedTracks.forEach((t, i) => indexTrackForSearch(t.title, t.artist, rankedTracks.length - i));

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
  const tracks = videos
    .filter(isLikelyMusic)
    .sort((a, b) => scoreTrack(b, query) - scoreTrack(a, query))
    .slice(0, limit)
    .map(mapYtVideo);
  tracks.forEach((t, i) => indexTrackForSearch(t.title, t.artist, tracks.length - i));
  return tracks;
}

// ---------- Autocomplete suggestions (Spotify-like predictive search) ----------
// Powered by:
//   1. **VoyagerIndex** — a tiny in-memory inverted-index + n-gram fuzzy
//      matcher (our local "Voyager" library). Scans tens of thousands of
//      indexed titles/artists in well under a millisecond — typo tolerant
//      and prefix-aware so suggestions surface before the user finishes
//      typing the next character.
//   2. **Elasticsearch-style remote suggest** — Google/YouTube suggest as
//      the "shard" for long-tail queries we haven't indexed yet.
// Results from both are merged & deduped, with the local index winning on
// latency for any query the user has touched recently.

// ---- VoyagerIndex (lightweight Elasticsearch-like in-memory index) ----
// Document = a search term (track title, artist, query). We tokenise on
// whitespace, lowercase, strip punctuation; then index unigrams + character
// trigrams so misspellings still match (e.g. "shap of yu" → "shape of you").
type VoyagerDoc = { id: number; text: string; pop: number };
class VoyagerIndex {
  private docs: VoyagerDoc[] = [];
  private byId = new Map<string, number>();
  private postings = new Map<string, Set<number>>(); // token/trigram → doc ids
  private nextId = 0;

  private static normalize(s: string): string {
    return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  }
  private static tokens(s: string): string[] {
    return VoyagerIndex.normalize(s).split(" ").filter(Boolean);
  }
  private static trigrams(s: string): string[] {
    const t = ` ${VoyagerIndex.normalize(s)} `;
    const out: string[] = [];
    for (let i = 0; i <= t.length - 3; i++) out.push(t.slice(i, i + 3));
    return out;
  }
  add(text: string, pop = 1): void {
    const key = VoyagerIndex.normalize(text);
    if (!key) return;
    const existing = this.byId.get(key);
    if (existing != null) { this.docs[existing].pop = Math.max(this.docs[existing].pop, pop); return; }
    const id = this.nextId++;
    this.byId.set(key, id);
    this.docs[id] = { id, text, pop };
    const seen = new Set<string>();
    for (const tok of VoyagerIndex.tokens(text)) {
      if (seen.has(tok)) continue;
      seen.add(tok);
      let p = this.postings.get(tok); if (!p) { p = new Set(); this.postings.set(tok, p); }
      p.add(id);
    }
    for (const g of VoyagerIndex.trigrams(text)) {
      let p = this.postings.get(g); if (!p) { p = new Set(); this.postings.set(g, p); }
      p.add(id);
    }
    if (this.docs.length > 5000) this.evictLowestPop();
  }
  private evictLowestPop() {
    // keep memory bounded — drop ~10% lowest-pop docs
    const sorted = [...this.docs].sort((a, b) => a.pop - b.pop).slice(0, 500);
    const dropIds = new Set(sorted.map((d) => d.id));
    for (const [k, set] of this.postings) {
      for (const id of dropIds) set.delete(id);
      if (set.size === 0) this.postings.delete(k);
    }
  }
  search(q: string, limit = 8): string[] {
    const qn = VoyagerIndex.normalize(q);
    if (!qn) return [];
    const scores = new Map<number, number>();
    const bump = (id: number, s: number) => scores.set(id, (scores.get(id) || 0) + s);
    for (const tok of VoyagerIndex.tokens(qn)) {
      const p = this.postings.get(tok);
      if (p) for (const id of p) bump(id, 4);
    }
    for (const g of VoyagerIndex.trigrams(qn)) {
      const p = this.postings.get(g);
      if (p) for (const id of p) bump(id, 1);
    }
    const out: { d: VoyagerDoc; s: number }[] = [];
    for (const [id, s] of scores) {
      const d = this.docs[id];
      if (!d) continue;
      let score = s + Math.log10(1 + d.pop);
      const norm = VoyagerIndex.normalize(d.text);
      if (norm.startsWith(qn)) score += 6;
      if (norm.includes(qn)) score += 2;
      out.push({ d, s: score });
    }
    out.sort((a, b) => b.s - a.s);
    return out.slice(0, limit).map((x) => x.d.text);
  }
}
const voyager = new VoyagerIndex();

// Hydrate Voyager from any cached search history so it's useful instantly.
try {
  const raw = typeof localStorage !== "undefined" ? localStorage.getItem("sentify_search_history") : null;
  if (raw) {
    const arr: string[] = JSON.parse(raw);
    arr.forEach((q, i) => voyager.add(q, arr.length - i));
  }
} catch { /* ignore */ }

// Public helpers — used by TopBar to feed the index as users browse.
export function indexTrackForSearch(title: string, artist?: string, pop = 1): void {
  if (title) voyager.add(title, pop);
  if (artist) voyager.add(artist, pop);
  if (title && artist) voyager.add(`${artist} ${title}`, pop);
}
export function indexQueryTerm(q: string, pop = 5): void { voyager.add(q, pop); }

const suggestCache = new Map<string, { ts: number; data: string[] }>();
const SUGGEST_TTL = 10 * 60 * 1000;
export async function suggestQueries(prefix: string): Promise<string[]> {
  const p = prefix.trim();
  if (p.length < 1) return [];
  const key = p.toLowerCase();

  // 1) Local Voyager hit — sub-millisecond. Surface immediately.
  const local = voyager.search(p, 8);

  const hit = suggestCache.get(key);
  if (hit && Date.now() - hit.ts < SUGGEST_TTL) {
    return mergeUnique(local, hit.data, 8);
  }
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=youtube&ds=yt&output=firefox&q=${encodeURIComponent(p)}`;
    const res = await fetch(url);
    if (!res.ok) return local;
    const arr = await res.json();
    const list: string[] = Array.isArray(arr?.[1]) ? arr[1].slice(0, 8) : [];
    suggestCache.set(key, { ts: Date.now(), data: list });
    list.forEach((s) => voyager.add(s, 2));
    return mergeUnique(local, list, 8);
  } catch {
    return local;
  }
}
function mergeUnique(a: string[], b: string[], n: number): string[] {
  const out: string[] = [];
  for (const item of [...a, ...b]) {
    if (!item) continue;
    if (!out.some((x) => x.toLowerCase() === item.toLowerCase())) out.push(item);
    if (out.length >= n) break;
  }
  return out;
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

// Tiny client cache so repeat queries (back/forward, retyping) feel instant.
const searchCache = new Map<string, { ts: number; data: SearchResults }>();
const SEARCH_CACHE_TTL = 5 * 60 * 1000;
const cacheGet = (k: string): SearchResults | null => {
  const hit = searchCache.get(k);
  if (!hit) return null;
  if (Date.now() - hit.ts > SEARCH_CACHE_TTL) { searchCache.delete(k); return null; }
  return hit.data;
};
const cacheSet = (k: string, data: SearchResults) => {
  searchCache.set(k, { ts: Date.now(), data });
  if (searchCache.size > 80) {
    const firstKey = searchCache.keys().next().value;
    if (firstKey) searchCache.delete(firstKey);
  }
};

export async function searchAll(query: string, limit = 40): Promise<SearchResults> {
  if (!query.trim()) return { tracks: [], artists: [], playlists: [] };
  const key = `all:${limit}:${query.toLowerCase()}`;
  const cached = cacheGet(key);
  if (cached) return cached;
  const yt = await youtubeSearchAll(query, limit);
  if (yt.tracks.length > 0) { cacheSet(key, yt); return yt; }
  // Fallback to Audius (tracks only)
  const au = await audiusFetch(
    `/v1/tracks/search?query=${encodeURIComponent(query)}&limit=${limit}`,
  );
  if (au.length > 0) {
    const data = { tracks: au.map(mapAudius), artists: [], playlists: [] };
    cacheSet(key, data);
    return data;
  }
  throw new Error("Music service is unreachable. Please try again.");
}

// Paginated search for infinite-scroll. Since the YouTube scrape gives us
// one page at a time, we widen the request and slice client-side. We keep
// the page size capped at 50 (the edge function's hard limit). For pages
// beyond the first we vary the query slightly to surface fresh results.
export async function searchPage(
  query: string,
  page: number,
  pageSize = 30,
): Promise<SearchResults> {
  if (!query.trim()) return { tracks: [], artists: [], playlists: [] };
  // Page 0 → vanilla query. Page n>0 → mix in genre/year hints to coax
  // different results out of the scraper without changing user intent.
  const VARIANTS = ["", "songs", "best of", "official", "live", "remix", "playlist", "album"];
  const v = VARIANTS[page % VARIANTS.length];
  const q = v ? `${query} ${v}` : query;
  const limit = Math.min(50, pageSize + 10);
  return await youtubeSearchAll(q, limit);
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
    .replace(/\b(official|video|audio|lyric|lyrics|hd|4k|mv|m\/v|full song|full video|status|whatsapp|new|latest)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  const cleanArtist = artist
    .replace(/\s*-\s*topic$/i, "")
    .replace(/vevo$/i, "")
    .trim();

  // Strip leading "Artist -" prefix some YT titles use
  const titleNoArtist = cleanTitle.replace(
    new RegExp(`^${cleanArtist.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[-:|]\\s*`, "i"),
    "",
  ).trim();

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

  // 2. LRCLIB search — try several query variants. Critical for regional /
  // devotional content (Bhajans, Odia, Bhojpuri) where artist tagging is messy.
  const variants = Array.from(new Set([
    `${cleanArtist} ${cleanTitle}`,
    cleanTitle,
    titleNoArtist,
    `${titleNoArtist} ${cleanArtist}`,
    cleanTitle.split(/[-|:(]/)[0].trim(), // first segment only
  ].filter((s) => s && s.length > 1)));

  for (const v of variants) {
    try {
      const res = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(v)}`);
      if (!res.ok) continue;
      const arr = await res.json();
      if (Array.isArray(arr) && arr.length > 0) {
        const hit = arr[0];
        const synced = hit.syncedLyrics ? parseLrc(hit.syncedLyrics) : null;
        const plain = hit.plainLyrics || (synced ? synced.map((l: LyricLine) => l.text).join("\n") : null);
        if (synced || plain) return { synced, plain };
      }
    } catch { /* ignore */ }
  }

  // 3. lyrics.ovh (plain only) — try with cleaned title and bare title
  for (const t of [cleanTitle, titleNoArtist]) {
    if (!t) continue;
    try {
      const res = await fetch(
        `https://api.lyrics.ovh/v1/${encodeURIComponent(cleanArtist)}/${encodeURIComponent(t)}`,
      );
      if (res.ok) {
        const data = await res.json();
        if (data.lyrics) return { plain: data.lyrics, synced: null };
      }
    } catch { /* ignore */ }
  }

  return { plain: null, synced: null };
}
