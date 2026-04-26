import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from "react";
import type { Track } from "@/types/music";

interface PlayerContextValue {
  current: Track | null;
  queue: Track[];
  history: Track[];
  isPlaying: boolean;
  progress: number;
  duration: number;
  volume: number;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  playTrack: (track: Track, queue?: Track[]) => void;
  togglePlay: () => void;
  next: () => void;
  prev: () => void;
  seek: (s: number) => void;
  setVolume: (v: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  addToQueue: (t: Track) => void;
  removeFromQueue: (id: string) => void;
}

const PlayerContext = createContext<PlayerContextValue | null>(null);

export const usePlayer = () => {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
};

export const PlayerProvider = ({ children }: { children: ReactNode }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [current, setCurrent] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [history, setHistory] = useState<Track[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<"off" | "all" | "one">("off");

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audioRef.current = audio;

    const onTime = () => setProgress(audio.currentTime);
    const onMeta = () => setDuration(audio.duration || 0);
    const onEnd = () => handleEnd();
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.volume = volume;

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleEnd = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (repeat === "one") {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    nextRef.current?.();
  }, [repeat]);

  const playTrack = useCallback(
    (track: Track, newQueue?: Track[]) => {
      const audio = audioRef.current;
      if (!audio) return;
      if (current) setHistory((h) => [current, ...h].slice(0, 50));
      setCurrent(track);
      if (newQueue) {
        const idx = newQueue.findIndex((t) => t.id === track.id);
        setQueue(newQueue.slice(idx + 1));
      }
      audio.src = track.audioUrl;
      audio.play().catch((e) => console.warn("Playback failed", e));
    },
    [current],
  );

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !current) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }, [current]);

  const next = useCallback(() => {
    if (queue.length === 0) {
      if (repeat === "all" && current) {
        const audio = audioRef.current;
        if (audio) {
          audio.currentTime = 0;
          audio.play().catch(() => {});
        }
      }
      return;
    }
    const nextIdx = shuffle ? Math.floor(Math.random() * queue.length) : 0;
    const nextTrack = queue[nextIdx];
    const newQueue = queue.filter((_, i) => i !== nextIdx);
    if (current) setHistory((h) => [current, ...h].slice(0, 50));
    setCurrent(nextTrack);
    setQueue(newQueue);
    const audio = audioRef.current;
    if (audio) {
      audio.src = nextTrack.audioUrl;
      audio.play().catch(() => {});
    }
  }, [queue, current, shuffle, repeat]);

  const nextRef = useRef(next);
  useEffect(() => {
    nextRef.current = next;
  }, [next]);

  const prev = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    if (history.length === 0) return;
    const [prevTrack, ...rest] = history;
    if (current) setQueue((q) => [current, ...q]);
    setCurrent(prevTrack);
    setHistory(rest);
    audio.src = prevTrack.audioUrl;
    audio.play().catch(() => {});
  }, [history, current]);

  const seek = (s: number) => {
    if (audioRef.current) audioRef.current.currentTime = s;
  };
  const setVolume = (v: number) => {
    setVolumeState(v);
    if (audioRef.current) audioRef.current.volume = v;
  };
  const toggleShuffle = () => setShuffle((s) => !s);
  const cycleRepeat = () =>
    setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"));
  const addToQueue = (t: Track) => setQueue((q) => [...q, t]);
  const removeFromQueue = (id: string) => setQueue((q) => q.filter((t) => t.id !== id));

  return (
    <PlayerContext.Provider
      value={{
        current,
        queue,
        history,
        isPlaying,
        progress,
        duration,
        volume,
        shuffle,
        repeat,
        playTrack,
        togglePlay,
        next,
        prev,
        seek,
        setVolume,
        toggleShuffle,
        cycleRepeat,
        addToQueue,
        removeFromQueue,
      }}
    >
      {children}
    </PlayerContext.Provider>
  );
};
