// Lightweight Zustand store for player state.
// Keeps "what" (state) cleanly separated from "how" (audio engine side-effects).
// Selector subscriptions = each component re-renders only when its slice changes,
// preventing UI lag during high-frequency progress updates.

import { create } from "zustand";
import type { Track } from "@/types/music";

export type RepeatMode = "off" | "all" | "one";

export interface PlayerState {
  current: Track | null;
  queue: Track[];
  history: Track[];
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: RepeatMode;
  // Spotify-style playback enhancements
  crossfadeSec: number;       // 0 = off, default 5
  normalize: boolean;         // ReplayGain-style ~-14 LUFS target
  autoplayContinuity: boolean; // auto-fetch similar tracks when queue ends

  // setters used by the engine
  _set: (patch: Partial<PlayerState>) => void;
  _setQueue: (q: Track[]) => void;
  _pushHistory: (t: Track) => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  current: null,
  queue: [],
  history: [],
  isPlaying: false,
  progress: 0,
  duration: 0,
  volume: 0.8,
  shuffle: false,
  repeat: "off",
  crossfadeSec: 5,
  normalize: true,
  autoplayContinuity: true,

  _set: (patch) => set(patch),
  _setQueue: (q) => set({ queue: q }),
  _pushHistory: (t) => set((s) => ({ history: [t, ...s.history].slice(0, 50) })),
}));

// Convenience selectors — components subscribe to just what they need.
export const selectCurrent = (s: PlayerState) => s.current;
export const selectIsPlaying = (s: PlayerState) => s.isPlaying;
export const selectProgress = (s: PlayerState) => s.progress;
export const selectDuration = (s: PlayerState) => s.duration;
