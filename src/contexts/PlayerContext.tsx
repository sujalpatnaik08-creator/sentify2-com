import { createContext, useContext, useEffect, useRef, useState, ReactNode, useCallback } from "react";
import type { Track } from "@/types/music";
import { addRecentlyPlayed, isValidYouTubeId, getPerfMode } from "@/lib/user-prefs";

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

// ----- YouTube IFrame API loader -----
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare global { interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void } }

let ytApiPromise: Promise<void> | null = null;
const loadYouTubeAPI = (): Promise<void> => {
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve();
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
    window.onYouTubeIframeAPIReady = () => resolve();
  });
  return ytApiPromise;
};

export const PlayerProvider = ({ children }: { children: ReactNode }) => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ytPlayerRef = useRef<any>(null);
  const ytReadyRef = useRef(false);
  const ytIntervalRef = useRef<number | null>(null);

  const [current, setCurrent] = useState<Track | null>(null);
  const [queue, setQueue] = useState<Track[]>([]);
  const [history, setHistory] = useState<Track[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(0.8);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState<"off" | "all" | "one">("off");

  // ----- Audio element for Audius streams -----
  useEffect(() => {
    const audio = new Audio();
    // Performance Mode: aggressively preload entire track for instant seek.
    audio.preload = getPerfMode() ? "auto" : "metadata";
    audioRef.current = audio;

    // Throttle timeupdate -> setProgress to 4Hz to cut React renders ~75%.
    let lastTick = 0;
    const onTime = () => {
      const now = performance.now();
      if (now - lastTick < 250) return;
      lastTick = now;
      setProgress(audio.currentTime);
    };
    const onMeta = () => setDuration(audio.duration || 0);
    const onEnd = () => handleEndRef.current?.();
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onError = () => {
      // Try to skip to next track on hard playback error so the UI doesn't stall.
      console.warn("Audio playback error", audio.error);
      handleEndRef.current?.();
    };

    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);
    audio.volume = volume;

    const onPerfChange = (e: Event) => {
      const on = (e as CustomEvent<boolean>).detail;
      audio.preload = on ? "auto" : "metadata";
    };
    window.addEventListener("sentify:perf-mode", onPerfChange);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
      window.removeEventListener("sentify:perf-mode", onPerfChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- YouTube IFrame player (hidden) -----
  useEffect(() => {
    let cancelled = false;
    loadYouTubeAPI().then(() => {
      if (cancelled) return;
      ytPlayerRef.current = new window.YT.Player("sentify-yt-player", {
        height: "0",
        width: "0",
        host: "https://www.youtube-nocookie.com",
        playerVars: {
          autoplay: 0,
          controls: 0,
          playsinline: 1,
          modestbranding: 1,
          rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            ytReadyRef.current = true;
            try { ytPlayerRef.current.setVolume(volume * 100); } catch { /* */ }
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onStateChange: (e: any) => {
            const YT = window.YT;
            if (e.data === YT.PlayerState.PLAYING) {
              setIsPlaying(true);
              const d = ytPlayerRef.current.getDuration?.() || 0;
              setDuration(d);
              if (ytIntervalRef.current) window.clearInterval(ytIntervalRef.current);
              // 4Hz progress poll — smooth seek bar without thrashing React.
              ytIntervalRef.current = window.setInterval(() => {
                try {
                  setProgress(ytPlayerRef.current.getCurrentTime?.() || 0);
                } catch { /* */ }
              }, 250);
            } else if (e.data === YT.PlayerState.PAUSED) {
              setIsPlaying(false);
            } else if (e.data === YT.PlayerState.ENDED) {
              setIsPlaying(false);
              if (ytIntervalRef.current) window.clearInterval(ytIntervalRef.current);
              handleEndRef.current?.();
            }
          },
          // YT error codes 2, 5, 100, 101, 150 = bad id / unembeddable / removed.
          // Auto-skip so the user can keep listening (Spotify-like resilience).
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onError: (e: any) => {
            console.warn("YouTube playback error", e?.data);
            setIsPlaying(false);
            if (ytIntervalRef.current) window.clearInterval(ytIntervalRef.current);
            handleEndRef.current?.();
          },
        },
      });
    });
    return () => {
      cancelled = true;
      if (ytIntervalRef.current) window.clearInterval(ytIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopAll = useCallback(() => {
    try { audioRef.current?.pause(); } catch { /* */ }
    if (audioRef.current) audioRef.current.removeAttribute("src");
    try { ytPlayerRef.current?.stopVideo?.(); } catch { /* */ }
    if (ytIntervalRef.current) {
      window.clearInterval(ytIntervalRef.current);
      ytIntervalRef.current = null;
    }
  }, []);

  const handleEnd = useCallback(() => {
    if (repeat === "one" && current) {
      if (current.source === "youtube" && ytReadyRef.current) {
        ytPlayerRef.current.seekTo(0, true);
        ytPlayerRef.current.playVideo();
      } else if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
      return;
    }
    nextRef.current?.();
  }, [repeat, current]);

  const handleEndRef = useRef(handleEnd);
  useEffect(() => { handleEndRef.current = handleEnd; }, [handleEnd]);

  const playTrack = useCallback(
    (track: Track, newQueue?: Track[]) => {
      stopAll();
      if (current) setHistory((h) => [current, ...h].slice(0, 50));
      setCurrent(track);
      setProgress(0);
      setDuration(track.duration || 0);
      try { addRecentlyPlayed(track); } catch { /* storage may be unavailable */ }
      if (newQueue) {
        const idx = newQueue.findIndex((t) => t.id === track.id);
        setQueue(newQueue.slice(idx + 1));
      }
      if (track.source === "youtube") {
        // Strict validation: only accept canonical 11-char YouTube IDs.
        // Prevents injection of arbitrary URLs into the IFrame loader.
        if (!isValidYouTubeId(track.audioUrl)) {
          console.warn("Refusing to play invalid YouTube ID:", track.audioUrl);
          return;
        }
        const start = () => {
          try {
            ytPlayerRef.current.loadVideoById(track.audioUrl);
            ytPlayerRef.current.setVolume(volume * 100);
            ytPlayerRef.current.playVideo();
          } catch (e) { console.warn("YT play failed", e); }
        };
        if (ytReadyRef.current) start();
        else loadYouTubeAPI().then(() => setTimeout(start, 300));
      } else {
        const audio = audioRef.current;
        if (!audio) return;
        // Only allow http(s) audio sources.
        try {
          const url = new URL(track.audioUrl);
          if (url.protocol !== "https:" && url.protocol !== "http:") return;
        } catch { return; }
        audio.src = track.audioUrl;
        audio.play().catch((e) => console.warn("Playback failed", e));
      }
    },
    [current, volume, stopAll],
  );

  const togglePlay = useCallback(() => {
    if (!current) return;
    if (current.source === "youtube") {
      if (!ytReadyRef.current) return;
      const state = ytPlayerRef.current.getPlayerState?.();
      if (state === window.YT.PlayerState.PLAYING) ytPlayerRef.current.pauseVideo();
      else ytPlayerRef.current.playVideo();
    } else {
      const audio = audioRef.current;
      if (!audio) return;
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
    }
  }, [current]);

  const next = useCallback(() => {
    if (queue.length === 0) {
      if (repeat === "all" && current) {
        if (current.source === "youtube" && ytReadyRef.current) {
          ytPlayerRef.current.seekTo(0, true);
          ytPlayerRef.current.playVideo();
        } else if (audioRef.current) {
          audioRef.current.currentTime = 0;
          audioRef.current.play().catch(() => {});
        }
      }
      return;
    }
    const nextIdx = shuffle ? Math.floor(Math.random() * queue.length) : 0;
    const nextTrack = queue[nextIdx];
    const newQueue = queue.filter((_, i) => i !== nextIdx);
    setQueue(newQueue);
    playTrack(nextTrack);
  }, [queue, current, shuffle, repeat, playTrack]);

  const nextRef = useRef(next);
  useEffect(() => { nextRef.current = next; }, [next]);

  const prev = useCallback(() => {
    if (current?.source === "youtube" && ytReadyRef.current) {
      const t = ytPlayerRef.current.getCurrentTime?.() || 0;
      if (t > 3) { ytPlayerRef.current.seekTo(0, true); return; }
    } else if (audioRef.current && audioRef.current.currentTime > 3) {
      audioRef.current.currentTime = 0;
      return;
    }
    if (history.length === 0) return;
    const [prevTrack, ...rest] = history;
    if (current) setQueue((q) => [current, ...q]);
    setHistory(rest);
    playTrack(prevTrack);
  }, [history, current, playTrack]);

  const seek = (s: number) => {
    if (current?.source === "youtube" && ytReadyRef.current) {
      ytPlayerRef.current.seekTo(s, true);
      setProgress(s);
    } else if (audioRef.current) {
      audioRef.current.currentTime = s;
    }
  };
  const setVolume = (v: number) => {
    setVolumeState(v);
    if (audioRef.current) audioRef.current.volume = v;
    if (ytReadyRef.current) {
      try { ytPlayerRef.current.setVolume(v * 100); } catch { /* */ }
    }
  };
  const toggleShuffle = () => setShuffle((s) => !s);
  const cycleRepeat = () =>
    setRepeat((r) => (r === "off" ? "all" : r === "all" ? "one" : "off"));
  const addToQueue = (t: Track) => setQueue((q) => [...q, t]);
  const removeFromQueue = (id: string) => setQueue((q) => q.filter((t) => t.id !== id));

  return (
    <PlayerContext.Provider
      value={{
        current, queue, history, isPlaying, progress, duration, volume, shuffle, repeat,
        playTrack, togglePlay, next, prev, seek, setVolume, toggleShuffle, cycleRepeat,
        addToQueue, removeFromQueue,
      }}
    >
      {/* Hidden YouTube player mount point */}
      <div style={{ position: "fixed", left: -9999, top: -9999, width: 0, height: 0, overflow: "hidden" }}>
        <div id="sentify-yt-player" />
      </div>
      {children}
    </PlayerContext.Provider>
  );
};
