import { useEffect, useMemo, ReactNode } from "react";
import { usePlayerStore } from "@/stores/playerStore";
import { getEngine } from "@/lib/playback-engine";
import {
  getCrossfadeSec,
  getNormalize,
  getAutoplayContinuity,
  setCrossfadeSec,
  setNormalize,
  setAutoplayContinuity,
} from "@/lib/user-prefs";
import type { Track } from "@/types/music";

export const PlayerProvider = ({ children }: { children: ReactNode }) => {
  // Ensure engine instantiates exactly once and hydrates persisted prefs.
  useEffect(() => {
    const engine = getEngine();
    engine.setCrossfade(getCrossfadeSec());
    engine.setNormalize(getNormalize());
    engine.setAutoplayContinuity(getAutoplayContinuity());
  }, []);

  return (
    <>
      {/* Hidden YouTube player mount point — same id as before. */}
      <div style={{ position: "fixed", left: -9999, top: -9999, width: 0, height: 0, overflow: "hidden" }}>
        <div id="sentify-yt-player" />
      </div>
      {children}
    </>
  );
};

// ---- Public hook (back-compat surface) ----
export function usePlayer() {
  const current = usePlayerStore((s) => s.current);
  const queue = usePlayerStore((s) => s.queue);
  const history = usePlayerStore((s) => s.history);
  const isPlaying = usePlayerStore((s) => s.isPlaying);
  const progress = usePlayerStore((s) => s.progress);
  const duration = usePlayerStore((s) => s.duration);
  const volume = usePlayerStore((s) => s.volume);
  const shuffle = usePlayerStore((s) => s.shuffle);
  const repeat = usePlayerStore((s) => s.repeat);
  const crossfadeSec = usePlayerStore((s) => s.crossfadeSec);
  const normalize = usePlayerStore((s) => s.normalize);
  const autoplayContinuity = usePlayerStore((s) => s.autoplayContinuity);

  // Stable action handles.
  const actions = useMemo(() => {
    const engine = getEngine();
    return {
      playTrack: (track: Track, q?: Track[]) => engine.playTrack(track, q),
      togglePlay: () => engine.togglePlay(),
      next: () => engine.next(),
      prev: () => engine.prev(),
      seek: (s: number) => engine.seek(s),
      setVolume: (v: number) => engine.setVolume(v),
      toggleShuffle: () => engine.toggleShuffle(),
      cycleRepeat: () => engine.cycleRepeat(),
      addToQueue: (t: Track) => engine.addToQueue(t),
      removeFromQueue: (id: string) => engine.removeFromQueue(id),
      setCrossfade: (sec: number) => { setCrossfadeSec(sec); engine.setCrossfade(sec); },
      setNormalize: (on: boolean) => { setNormalize(on); engine.setNormalize(on); },
      setAutoplayContinuity: (on: boolean) => { setAutoplayContinuity(on); engine.setAutoplayContinuity(on); },
    };
  }, []);

  return {
    current, queue, history, isPlaying, progress, duration, volume,
    shuffle, repeat, crossfadeSec, normalize, autoplayContinuity,
    ...actions,
  };
}
