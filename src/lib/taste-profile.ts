// Taste Profile — thumbs up/down a track to teach recommendations.
// Pure localStorage; surfaced to the ranker in music-api.ts so liked
// artists float to the top and disliked ones get pushed down.

import type { Track } from "@/types/music";
import { getTasteProfileEnabled } from "@/lib/user-prefs";

const K_UP = "sentify_taste_up";    // Track[] thumbed up
const K_DOWN = "sentify_taste_down"; // Track[] thumbed down

type Vote = "up" | "down" | null;

const safeRead = (k: string): Track[] => {
  try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; }
};
const safeWrite = (k: string, v: Track[]) => {
  try { localStorage.setItem(k, JSON.stringify(v.slice(0, 500))); } catch { /* */ }
};

export const getThumbedUp = (): Track[] => safeRead(K_UP);
export const getThumbedDown = (): Track[] => safeRead(K_DOWN);

export const getVote = (id: string): Vote => {
  if (!getTasteProfileEnabled()) return null;
  if (safeRead(K_UP).some((t) => t.id === id)) return "up";
  if (safeRead(K_DOWN).some((t) => t.id === id)) return "down";
  return null;
};

export const setVote = (track: Track, vote: Vote): Vote => {
  if (!getTasteProfileEnabled()) {
    // Privacy: silently no-op — user opted out of storing thumbs.
    window.dispatchEvent(new CustomEvent("sentify:taste-changed"));
    return null;
  }
  const ups = safeRead(K_UP).filter((t) => t.id !== track.id);
  const downs = safeRead(K_DOWN).filter((t) => t.id !== track.id);
  if (vote === "up") ups.unshift(track);
  if (vote === "down") downs.unshift(track);
  safeWrite(K_UP, ups);
  safeWrite(K_DOWN, downs);
  window.dispatchEvent(new CustomEvent("sentify:taste-changed"));
  return vote;
};

const norm = (s: string) => (s || "").toLowerCase().trim();

// Cached taste maps for the ranker.
let _cache: { ts: number; up: Set<string>; down: Set<string>; downIds: Set<string> } | null = null;
export const getTasteMaps = () => {
  if (!getTasteProfileEnabled()) {
    return { ts: Date.now(), up: new Set<string>(), down: new Set<string>(), downIds: new Set<string>() };
  }
  if (_cache && Date.now() - _cache.ts < 15_000) return _cache;
  const ups = safeRead(K_UP);
  const downs = safeRead(K_DOWN);
  const up = new Set<string>();
  const down = new Set<string>();
  const downIds = new Set<string>();
  for (const t of ups) if (t.artist) up.add(norm(t.artist));
  for (const t of downs) {
    if (t.artist) down.add(norm(t.artist));
    if (t.id) downIds.add(t.id);
  }
  _cache = { ts: Date.now(), up, down, downIds };
  return _cache;
};
export const invalidateTasteMaps = () => { _cache = null; };
