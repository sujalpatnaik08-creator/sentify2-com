// Centralized localStorage helpers for user preferences:
// liked songs, search history, recently-played, and favorite artists.
// Pure browser storage — no backend needed.

import type { Track } from "@/types/music";

const K = {
  liked: "sentify_liked_v2",          // Track[]
  history: "sentify_search_history",   // string[]
  played: "sentify_recently_played",   // Track[]
  favArtists: "sentify_fav_artists",   // {id,name,thumbnail}[]
  perfMode: "sentify_perf_mode",       // "1" | "0"
  crossfade: "sentify_crossfade_sec",  // number 0..12
  normalize: "sentify_normalize",      // "1" | "0"
  autoplay: "sentify_autoplay_cont",   // "1" | "0"
};

// ---------- Spotify-style playback prefs ----------
export function getCrossfadeSec(): number {
  try {
    const v = parseInt(localStorage.getItem(K.crossfade) || "5", 10);
    return isFinite(v) && v >= 0 && v <= 12 ? v : 5;
  } catch { return 5; }
}
export function setCrossfadeSec(sec: number) {
  try { localStorage.setItem(K.crossfade, String(Math.max(0, Math.min(12, Math.round(sec))))); } catch { /* */ }
}
export function getNormalize(): boolean {
  try { return localStorage.getItem(K.normalize) !== "0"; } catch { return true; }
}
export function setNormalize(on: boolean) {
  try { localStorage.setItem(K.normalize, on ? "1" : "0"); } catch { /* */ }
}
export function getAutoplayContinuity(): boolean {
  try { return localStorage.getItem(K.autoplay) !== "0"; } catch { return true; }
}
export function setAutoplayContinuity(on: boolean) {
  try { localStorage.setItem(K.autoplay, on ? "1" : "0"); } catch { /* */ }
}

// ---------- Performance Mode ----------
// When ON: aggressive audio preloading, faster polling, fewer re-renders.
export function getPerfMode(): boolean {
  try { return localStorage.getItem(K.perfMode) !== "0"; } catch { return true; }
}
export function setPerfMode(on: boolean) {
  try { localStorage.setItem(K.perfMode, on ? "1" : "0"); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent("sentify:perf-mode", { detail: on }));
}

// ---------- liked songs ----------

export function getLikedTracks(): Track[] {
  try { return JSON.parse(localStorage.getItem(K.liked) || "[]"); } catch { return []; }
}

export function isLiked(id: string): boolean {
  return getLikedTracks().some((t) => t.id === id);
}

export function toggleLikedTrack(track: Track): boolean {
  const list = getLikedTracks();
  const idx = list.findIndex((t) => t.id === track.id);
  if (idx >= 0) list.splice(idx, 1);
  else list.unshift(track);
  localStorage.setItem(K.liked, JSON.stringify(list.slice(0, 500)));
  return idx < 0;
}

// ---------- search history ----------

export function getSearchHistory(): string[] {
  try { return JSON.parse(localStorage.getItem(K.history) || "[]"); } catch { return []; }
}

export function addSearchHistory(query: string) {
  const q = query.trim();
  if (!q) return;
  const list = getSearchHistory().filter((x) => x.toLowerCase() !== q.toLowerCase());
  list.unshift(q);
  localStorage.setItem(K.history, JSON.stringify(list.slice(0, 50)));
}

export function clearSearchHistory() {
  localStorage.removeItem(K.history);
}

// ---------- recently played ----------

export function addRecentlyPlayed(track: Track) {
  const list = getRecentlyPlayed().filter((t) => t.id !== track.id);
  list.unshift(track);
  localStorage.setItem(K.played, JSON.stringify(list.slice(0, 100)));
}

export function getRecentlyPlayed(): Track[] {
  try { return JSON.parse(localStorage.getItem(K.played) || "[]"); } catch { return []; }
}

// ---------- favorite artists ----------

export interface FavArtist { id: string; name: string; thumbnail: string }

export function getFavoriteArtists(): FavArtist[] {
  try { return JSON.parse(localStorage.getItem(K.favArtists) || "[]"); } catch { return []; }
}

export function setFavoriteArtists(artists: FavArtist[]) {
  localStorage.setItem(K.favArtists, JSON.stringify(artists.slice(0, 3)));
}

// ---------- security: validate YouTube video IDs ----------

const YT_ID_RE = /^[A-Za-z0-9_-]{11}$/;
export function isValidYouTubeId(id: string): boolean {
  return YT_ID_RE.test(id);
}
