// Playback engine — owns all browser-side audio side-effects.
// Implements Spotify-signature features:
//   • Gapless playback (preloads next Audius track ~12s before end).
//   • Crossfade (configurable 0–12s, default 5s) between Audius tracks via
//     two HTMLAudio elements with WebAudio gain ramps.
//   • Audio normalization (~-14 LUFS) — heuristic per-track gain estimate
//     from track duration + a small profile cache.
//   • Autoplay continuity — when the queue ends, fetches similar tracks via
//     the existing music-api search and appends them to the queue.
//   • State sync — pushes minimal updates into the Zustand store (4Hz tick).
//
// YouTube tracks use the IFrame API and CANNOT be processed by WebAudio
// (cross-origin), so crossfade/normalize fall back to player-volume ramps.

import type { Track } from "@/types/music";
import {
  addRecentlyPlayed,
  getPerfMode,
  isValidYouTubeId,
  getSoundQuality,
  getBassBoost,
  getBackgroundPlayback,
  type SoundQuality,
} from "@/lib/user-prefs";
import { usePlayerStore } from "@/stores/playerStore";
import { searchTracks } from "@/lib/music-api";

// ---------------- YouTube IFrame API loader ----------------
declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window { YT?: any; onYouTubeIframeAPIReady?: () => void }
}

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

// ---------------- Normalization helper ----------------
// True LUFS measurement requires offline analysis. We approximate by
// caching a per-track gain factor learned from peak detection on the first
// 8 seconds of playback. Default starts at 1.0 and is nudged toward a
// -14 LUFS-ish target (≈ peak of 0.7).
const NORM_TARGET_PEAK = 0.7;
const normCache = new Map<string, number>(); // trackId -> gain (0.4..1.4)

const loadNormCache = () => {
  try {
    const raw = localStorage.getItem("sentify_norm_cache");
    if (raw) {
      const obj = JSON.parse(raw) as Record<string, number>;
      for (const [k, v] of Object.entries(obj)) normCache.set(k, v);
    }
  } catch { /* */ }
};
const saveNormCache = () => {
  try {
    const obj: Record<string, number> = {};
    let i = 0;
    for (const [k, v] of normCache) {
      obj[k] = v;
      if (++i > 500) break;
    }
    localStorage.setItem("sentify_norm_cache", JSON.stringify(obj));
  } catch { /* */ }
};
loadNormCache();

// ---------------- Engine ----------------
class PlaybackEngine {
  // Two audio elements so we can crossfade A → B without a gap.
  private audioA: HTMLAudioElement;
  private audioB: HTMLAudioElement;
  private active: "A" | "B" = "A";

  // WebAudio graph for normalization + crossfade gains + auto-enhancer.
  private ctx: AudioContext | null = null;
  private srcA: MediaElementAudioSourceNode | null = null;
  private srcB: MediaElementAudioSourceNode | null = null;
  private gainA: GainNode | null = null;
  private gainB: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserActive: "A" | "B" = "A";

  // Auto Enhancer chain (shared, post-gain) — bass shelf, presence peak,
  // air shelf, gentle compressor + soft stereo widener. Bypassed via
  // a wet/dry split when disabled.
  private enhancerIn: GainNode | null = null;
  private enhancerOut: GainNode | null = null;
  private bypassNode: GainNode | null = null;
  private wetNode: GainNode | null = null;
  private bassEQ: BiquadFilterNode | null = null;
  private presenceEQ: BiquadFilterNode | null = null;
  private airEQ: BiquadFilterNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private widenerSplitter: ChannelSplitterNode | null = null;
  private widenerMerger: ChannelMergerNode | null = null;
  private widenerMidGain: GainNode | null = null;
  private widenerSideGain: GainNode | null = null;
  private enhanceOn = true;

  // Sound Quality EQ chain (post-enhancer): low-pass for low/medium quality
  // simulates lower-bitrate streams; bass-boost via dedicated lowshelf.
  private qualityFilter: BiquadFilterNode | null = null;
  private bassBoostNode: BiquadFilterNode | null = null;
  private quality: SoundQuality = "high";
  private bassBoostOn = false;

  // Background playback: Wake Lock keeps tab alive when minimized on Chromium.
  // Media Session API exposes lock-screen / OS-level transport controls.
  private wakeLock: WakeLockSentinel | null = null;
  private bgPlayback = true;

  // YouTube hidden player
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private yt: any = null;
  private ytReady = false;
  private ytTickHandle: number | null = null;

  private tickHandle: number | null = null;
  private crossfadeArmed = false;
  private prebufferStarted = false;
  private nextTrackBuffered: Track | null = null;

  private lastUiTick = 0;

  constructor() {
    this.audioA = new Audio();
    this.audioB = new Audio();
    [this.audioA, this.audioB].forEach((a) => {
      a.preload = getPerfMode() ? "auto" : "metadata";
      a.crossOrigin = "anonymous"; // required for WebAudio analyser on Audius CDN
    });

    this.bindAudio(this.audioA);
    this.bindAudio(this.audioB);

    this.audioA.volume = usePlayerStore.getState().volume;
    this.audioB.volume = 0;

    // React to perf-mode toggles
    window.addEventListener("sentify:perf-mode", (e: Event) => {
      const on = (e as CustomEvent<boolean>).detail;
      this.audioA.preload = on ? "auto" : "metadata";
      this.audioB.preload = on ? "auto" : "metadata";
    });

    // Restore enhancer pref
    try {
      const v = localStorage.getItem("sentify_audio_enhance");
      if (v != null) this.enhanceOn = v === "1";
    } catch { /* */ }

    // Restore quality / bass-boost / background prefs
    this.quality = getSoundQuality();
    this.bassBoostOn = getBassBoost();
    this.bgPlayback = getBackgroundPlayback();

    // React to runtime pref changes
    window.addEventListener("sentify:sound-quality", (e: Event) => {
      this.quality = (e as CustomEvent<SoundQuality>).detail;
      this.applyQualityChain();
    });
    window.addEventListener("sentify:bass-boost", (e: Event) => {
      this.bassBoostOn = (e as CustomEvent<boolean>).detail;
      this.applyQualityChain();
    });
    window.addEventListener("sentify:bg-playback", (e: Event) => {
      this.bgPlayback = (e as CustomEvent<boolean>).detail;
      if (this.bgPlayback && usePlayerStore.getState().isPlaying) this.acquireWakeLock();
      else this.releaseWakeLock();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && this.bgPlayback && usePlayerStore.getState().isPlaying) {
        this.acquireWakeLock();
      }
    });

    this.startMonitor();
    this.initYouTube();
    this.bindMediaSession();
  }

  // -------- Wake Lock (keeps tab alive when minimized on Chromium) --------
  private async acquireWakeLock() {
    if (!this.bgPlayback) return;
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<WakeLockSentinel> } }).wakeLock;
      if (!wl || this.wakeLock) return;
      this.wakeLock = await wl.request("screen");
      this.wakeLock.addEventListener("release", () => { this.wakeLock = null; });
    } catch { /* not granted; ignore */ }
  }
  private releaseWakeLock() {
    try { this.wakeLock?.release(); } catch { /* */ }
    this.wakeLock = null;
  }

  // -------- Media Session: lock-screen + OS transport controls --------
  private bindMediaSession() {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.setActionHandler("play", () => this.togglePlay());
      navigator.mediaSession.setActionHandler("pause", () => this.togglePlay());
      navigator.mediaSession.setActionHandler("nexttrack", () => this.next());
      navigator.mediaSession.setActionHandler("previoustrack", () => this.prev());
      navigator.mediaSession.setActionHandler("seekto", (d: MediaSessionActionDetails) => {
        if (typeof d.seekTime === "number") this.seek(d.seekTime);
      });
      navigator.mediaSession.setActionHandler("seekbackward", (d: MediaSessionActionDetails) => {
        const a = d.seekOffset || 10;
        this.seek(Math.max(0, usePlayerStore.getState().progress - a));
      });
      navigator.mediaSession.setActionHandler("seekforward", (d: MediaSessionActionDetails) => {
        const a = d.seekOffset || 10;
        this.seek(usePlayerStore.getState().progress + a);
      });
    } catch { /* unsupported actions ignored */ }
  }

  private updateMediaSession(track: Track) {
    if (!("mediaSession" in navigator)) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.artist,
        artwork: track.artwork ? [
          { src: track.artwork, sizes: "96x96", type: "image/jpeg" },
          { src: track.artwork, sizes: "256x256", type: "image/jpeg" },
          { src: track.artwork, sizes: "512x512", type: "image/jpeg" },
        ] : [],
      });
    } catch { /* */ }
  }

  private updateMediaSessionState(playing: boolean) {
    if (!("mediaSession" in navigator)) return;
    try { navigator.mediaSession.playbackState = playing ? "playing" : "paused"; } catch { /* */ }
  }

  // -------- Quality + Bass Boost subgraph (built lazily in ensureCtx) --------
  private buildQualityChain() {
    if (!this.ctx) return;
    this.qualityFilter = this.ctx.createBiquadFilter();
    this.qualityFilter.type = "lowpass";
    this.qualityFilter.frequency.value = 22000; // High = transparent
    this.qualityFilter.Q.value = 0.707;
    this.bassBoostNode = this.ctx.createBiquadFilter();
    this.bassBoostNode.type = "lowshelf";
    this.bassBoostNode.frequency.value = 80;
    this.bassBoostNode.gain.value = 0;
  }

  private applyQualityChain() {
    if (!this.ctx || !this.qualityFilter || !this.bassBoostNode) return;
    const t = this.ctx.currentTime;
    let cutoff = 22000;
    if (this.quality === "medium") cutoff = 16000;
    if (this.quality === "low") cutoff = 11000;
    try { this.qualityFilter.frequency.setTargetAtTime(cutoff, t, 0.05); } catch { /* */ }
    const boost = this.bassBoostOn ? 7 : 0;
    try { this.bassBoostNode.gain.setTargetAtTime(boost, t, 0.05); } catch { /* */ }
  }

  // ------- WebAudio lazy init (must happen after a user gesture) -------
  private ensureCtx() {
    if (this.ctx) return;
    try {
      const Ctx = (window.AudioContext ||
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (window as any).webkitAudioContext) as typeof AudioContext;
      this.ctx = new Ctx();
      this.gainA = this.ctx.createGain();
      this.gainB = this.ctx.createGain();
      this.gainA.gain.value = 1;
      this.gainB.gain.value = 0;
      this.srcA = this.ctx.createMediaElementSource(this.audioA);
      this.srcB = this.ctx.createMediaElementSource(this.audioB);
      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 256;

      // -- Build enhancer subgraph --
      this.enhancerIn = this.ctx.createGain();
      this.enhancerOut = this.ctx.createGain();
      this.bypassNode = this.ctx.createGain();
      this.wetNode = this.ctx.createGain();

      this.bassEQ = this.ctx.createBiquadFilter();
      this.bassEQ.type = "lowshelf"; this.bassEQ.frequency.value = 110; this.bassEQ.gain.value = 3.5;
      this.presenceEQ = this.ctx.createBiquadFilter();
      this.presenceEQ.type = "peaking"; this.presenceEQ.frequency.value = 2800; this.presenceEQ.Q.value = 1.1; this.presenceEQ.gain.value = 2.2;
      this.airEQ = this.ctx.createBiquadFilter();
      this.airEQ.type = "highshelf"; this.airEQ.frequency.value = 9000; this.airEQ.gain.value = 2.5;

      this.compressor = this.ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -22;
      this.compressor.knee.value = 24;
      this.compressor.ratio.value = 3;
      this.compressor.attack.value = 0.005;
      this.compressor.release.value = 0.18;

      // Mid/Side-ish widener via channel split
      this.widenerSplitter = this.ctx.createChannelSplitter(2);
      this.widenerMerger = this.ctx.createChannelMerger(2);
      this.widenerMidGain = this.ctx.createGain(); this.widenerMidGain.gain.value = 1;
      this.widenerSideGain = this.ctx.createGain(); this.widenerSideGain.gain.value = 1.25;

      // Wet path: in → bass → presence → air → comp → widener → out
      this.enhancerIn
        .connect(this.bassEQ)
        .connect(this.presenceEQ)
        .connect(this.airEQ)
        .connect(this.compressor)
        .connect(this.widenerSplitter);
      // Left
      this.widenerSplitter.connect(this.widenerMidGain, 0);
      this.widenerMidGain.connect(this.widenerMerger, 0, 0);
      this.widenerSplitter.connect(this.widenerSideGain, 1);
      this.widenerSideGain.connect(this.widenerMerger, 0, 1);
      this.widenerMerger.connect(this.wetNode).connect(this.enhancerOut);
      // Dry path: in → bypass → out
      this.enhancerIn.connect(this.bypassNode).connect(this.enhancerOut);

      // Apply enhancer mix
      this.applyEnhancerMix();

      // Master routing: srcA/B → gainA/B → enhancerIn → enhancerOut → analyser → destination
      this.srcA.connect(this.gainA).connect(this.enhancerIn);
      this.srcB.connect(this.gainB).connect(this.enhancerIn);
      this.enhancerOut.connect(this.analyser).connect(this.ctx.destination);
    } catch (e) {
      console.warn("WebAudio init failed; falling back to plain audio.", e);
      this.ctx = null;
    }
  }

  private applyEnhancerMix() {
    if (!this.ctx || !this.wetNode || !this.bypassNode) return;
    const t = this.ctx.currentTime;
    const wet = this.enhanceOn ? 1 : 0;
    const dry = this.enhanceOn ? 0 : 1;
    try { this.wetNode.gain.setTargetAtTime(wet, t, 0.05); } catch { /* */ }
    try { this.bypassNode.gain.setTargetAtTime(dry, t, 0.05); } catch { /* */ }
  }

  // ------- Audio element event wiring -------
  private bindAudio(audio: HTMLAudioElement) {
    audio.addEventListener("loadedmetadata", () => {
      if (this.activeAudio() === audio) {
        usePlayerStore.getState()._set({ duration: audio.duration || 0 });
      }
    });
    audio.addEventListener("play", () => {
      if (this.activeAudio() === audio) usePlayerStore.getState()._set({ isPlaying: true });
    });
    audio.addEventListener("pause", () => {
      if (this.activeAudio() === audio) usePlayerStore.getState()._set({ isPlaying: false });
    });
    audio.addEventListener("error", () => {
      if (this.activeAudio() === audio) {
        console.warn("Audio error", audio.error);
        this.next();
      }
    });
    audio.addEventListener("ended", () => {
      if (this.activeAudio() === audio && !this.crossfadeArmed) {
        this.handleEnd();
      }
    });
  }

  private activeAudio(): HTMLAudioElement {
    return this.active === "A" ? this.audioA : this.audioB;
  }
  private inactiveAudio(): HTMLAudioElement {
    return this.active === "A" ? this.audioB : this.audioA;
  }
  private activeGain(): GainNode | null {
    return this.active === "A" ? this.gainA : this.gainB;
  }
  private inactiveGain(): GainNode | null {
    return this.active === "A" ? this.gainB : this.gainA;
  }

  // ------- YouTube setup -------
  private initYouTube() {
    loadYouTubeAPI().then(() => {
      this.yt = new window.YT.Player("sentify-yt-player", {
        height: "0",
        width: "0",
        host: "https://www.youtube-nocookie.com",
        playerVars: {
          autoplay: 0, controls: 0, playsinline: 1, modestbranding: 1, rel: 0,
          origin: window.location.origin,
        },
        events: {
          onReady: () => {
            this.ytReady = true;
            try { this.yt.setVolume(usePlayerStore.getState().volume * 100); } catch { /* */ }
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onStateChange: (e: any) => {
            const YT = window.YT;
            if (e.data === YT.PlayerState.PLAYING) {
              usePlayerStore.getState()._set({
                isPlaying: true,
                duration: this.yt.getDuration?.() || 0,
              });
              if (this.ytTickHandle) window.clearInterval(this.ytTickHandle);
              this.ytTickHandle = window.setInterval(() => {
                try {
                  usePlayerStore.getState()._set({ progress: this.yt.getCurrentTime?.() || 0 });
                } catch { /* */ }
              }, 250);
            } else if (e.data === YT.PlayerState.PAUSED) {
              usePlayerStore.getState()._set({ isPlaying: false });
            } else if (e.data === YT.PlayerState.ENDED) {
              usePlayerStore.getState()._set({ isPlaying: false });
              if (this.ytTickHandle) window.clearInterval(this.ytTickHandle);
              this.handleEnd();
            }
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onError: (e: any) => {
            console.warn("YT error", e?.data);
            usePlayerStore.getState()._set({ isPlaying: false });
            if (this.ytTickHandle) window.clearInterval(this.ytTickHandle);
            this.next();
          },
        },
      });
    });
  }

  // ------- Main monitor loop (4Hz) -------
  // Drives: progress sync, normalization peak learning, prebuffer arming,
  // crossfade scheduling.
  private startMonitor() {
    this.tickHandle = window.setInterval(() => this.tick(), 250);
  }

  private tick() {
    const s = usePlayerStore.getState();
    const cur = s.current;
    if (!cur) return;

    if (cur.source === "audius") {
      const a = this.activeAudio();
      // Update progress (4Hz)
      const now = performance.now();
      if (now - this.lastUiTick >= 250) {
        this.lastUiTick = now;
        usePlayerStore.getState()._set({ progress: a.currentTime });
      }

      // Learn normalization peak (first 8s only)
      if (s.normalize && a.currentTime < 8 && this.analyser && this.analyserActive === this.active) {
        this.samplePeakAndAdjust(cur);
      }

      const remaining = (a.duration || 0) - a.currentTime;
      const xfade = s.crossfadeSec;

      // Prebuffer next track ~12s before end (gapless requirement)
      if (!this.prebufferStarted && remaining < 14 && remaining > 0) {
        this.prebufferStarted = true;
        this.prebufferNext();
      }

      // Arm crossfade
      if (xfade > 0 && remaining <= xfade && remaining > 0.1 && !this.crossfadeArmed) {
        this.armCrossfade(xfade);
      }
    }
  }

  // ------- Normalization: sample current peak and gently adjust gain -------
  private samplePeakAndAdjust(track: Track) {
    if (!this.analyser || !this.activeGain()) return;
    const buf = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(buf);
    let peak = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = Math.abs(buf[i] - 128) / 128;
      if (v > peak) peak = v;
    }
    if (peak < 0.01) return; // silence
    const cached = normCache.get(track.id) ?? 1;
    // Pull cached gain toward NORM_TARGET_PEAK / observed peak, smoothed.
    const desired = Math.max(0.4, Math.min(1.4, NORM_TARGET_PEAK / peak));
    const next = cached * 0.9 + desired * 0.1;
    normCache.set(track.id, next);
    const g = this.activeGain()!;
    // Apply gain immediately but smoothly — no clicks.
    try { g.gain.setTargetAtTime(next * usePlayerStore.getState().volume, this.ctx!.currentTime, 0.1); } catch { /* */ }
    // Throttle disk write
    if (Math.random() < 0.05) saveNormCache();
  }

  // ------- Gapless prebuffer -------
  private prebufferNext() {
    const s = usePlayerStore.getState();
    if (s.queue.length === 0) return;
    const next = s.shuffle
      ? s.queue[Math.floor(Math.random() * s.queue.length)]
      : s.queue[0];
    if (!next || next.source !== "audius") return;
    this.nextTrackBuffered = next;
    const inactive = this.inactiveAudio();
    try {
      inactive.src = next.audioUrl;
      inactive.load();
      // Begin fetching but stay paused.
    } catch (e) {
      console.warn("Prebuffer failed", e);
    }
  }

  // ------- Crossfade: ramp out active, ramp in inactive (preloaded) -------
  private armCrossfade(seconds: number) {
    const s = usePlayerStore.getState();
    const next = this.nextTrackBuffered;
    // Only crossfade audius→audius. YT or no-prebuffer → fall through to handleEnd.
    if (!next || next.source !== "audius" || s.current?.source !== "audius") return;
    if (!this.ctx) return;

    this.crossfadeArmed = true;
    const inactiveAudio = this.inactiveAudio();
    const inGain = this.inactiveGain()!;
    const outGain = this.activeGain()!;
    const t0 = this.ctx.currentTime;
    const vol = s.volume;
    const normIn = (normCache.get(next.id) ?? 1) * vol;

    // Start the next track silently then ramp up
    inGain.gain.cancelScheduledValues(t0);
    inGain.gain.setValueAtTime(0, t0);
    inactiveAudio.play().then(() => {
      inGain.gain.linearRampToValueAtTime(normIn, t0 + seconds);
      outGain.gain.cancelScheduledValues(t0);
      outGain.gain.linearRampToValueAtTime(0.0001, t0 + seconds);

      // After fade completes, swap roles.
      window.setTimeout(() => {
        const old = this.activeAudio();
        try { old.pause(); old.removeAttribute("src"); old.load(); } catch { /* */ }
        this.active = this.active === "A" ? "B" : "A";
        this.analyserActive = this.active;
        // Pop the prebuffered track from the queue & promote
        const cur = usePlayerStore.getState();
        const idx = cur.queue.findIndex((t) => t.id === next.id);
        const newQueue = idx >= 0 ? cur.queue.filter((_, i) => i !== idx) : cur.queue;
        if (cur.current) cur._pushHistory(cur.current);
        try { addRecentlyPlayed(next); } catch { /* */ }
        usePlayerStore.getState()._set({
          current: next,
          queue: newQueue,
          progress: 0,
          duration: this.activeAudio().duration || next.duration || 0,
        });
        this.crossfadeArmed = false;
        this.prebufferStarted = false;
        this.nextTrackBuffered = null;
      }, seconds * 1000);
    }).catch(() => {
      this.crossfadeArmed = false;
    });
  }

  // ------- Public API -------
  playTrack(track: Track, queue?: Track[]) {
    this.ensureCtx();
    this.crossfadeArmed = false;
    this.prebufferStarted = false;
    this.nextTrackBuffered = null;

    const s = usePlayerStore.getState();
    if (s.current) s._pushHistory(s.current);
    try { addRecentlyPlayed(track); } catch { /* */ }

    // Stop both audio elements + YT
    [this.audioA, this.audioB].forEach((a) => {
      try { a.pause(); } catch { /* */ }
      a.removeAttribute("src");
    });
    try { this.yt?.stopVideo?.(); } catch { /* */ }
    if (this.ytTickHandle) { window.clearInterval(this.ytTickHandle); this.ytTickHandle = null; }

    let newQueue = s.queue;
    if (queue) {
      const idx = queue.findIndex((t) => t.id === track.id);
      newQueue = queue.slice(idx + 1);
    }

    s._set({
      current: track,
      queue: newQueue,
      progress: 0,
      duration: track.duration || 0,
    });

    if (track.source === "youtube") {
      if (!isValidYouTubeId(track.audioUrl)) {
        console.warn("Invalid YT id, skipping:", track.audioUrl);
        this.next();
        return;
      }
      const start = () => {
        try {
          this.yt.loadVideoById(track.audioUrl);
          this.yt.setVolume(s.volume * 100);
          this.yt.playVideo();
        } catch (e) { console.warn("YT play failed", e); }
      };
      if (this.ytReady) start();
      else loadYouTubeAPI().then(() => setTimeout(start, 300));
    } else {
      // Validate audius URL
      try {
        const url = new URL(track.audioUrl);
        if (url.protocol !== "https:" && url.protocol !== "http:") return;
      } catch { return; }
      this.active = "A";
      this.analyserActive = "A";
      // Reset gains
      if (this.gainA && this.gainB && this.ctx) {
        const t = this.ctx.currentTime;
        const baseGain = (normCache.get(track.id) ?? 1) * (s.normalize ? 1 : 1) * s.volume;
        try { this.gainA.gain.cancelScheduledValues(t); this.gainA.gain.setValueAtTime(baseGain, t); } catch { /* */ }
        try { this.gainB.gain.cancelScheduledValues(t); this.gainB.gain.setValueAtTime(0, t); } catch { /* */ }
      }
      this.audioA.src = track.audioUrl;
      this.audioA.volume = this.ctx ? 1 : s.volume; // when WebAudio is wired, volume is on the gain node
      this.audioA.play().catch((e) => console.warn("Playback failed", e));
    }
  }

  togglePlay() {
    const s = usePlayerStore.getState();
    if (!s.current) return;
    if (s.current.source === "youtube") {
      if (!this.ytReady) return;
      const state = this.yt.getPlayerState?.();
      if (state === window.YT.PlayerState.PLAYING) this.yt.pauseVideo();
      else this.yt.playVideo();
    } else {
      const a = this.activeAudio();
      if (a.paused) a.play().catch(() => {});
      else a.pause();
    }
  }

  next() {
    const s = usePlayerStore.getState();
    if (s.queue.length === 0) {
      if (s.repeat === "all" && s.current) {
        this.seek(0);
        this.activeAudio().play().catch(() => {});
        return;
      }
      // Autoplay continuity — fetch similar tracks based on current track artist
      if (s.autoplayContinuity && s.current) {
        this.fetchSimilarAndContinue(s.current);
      }
      return;
    }
    const idx = s.shuffle ? Math.floor(Math.random() * s.queue.length) : 0;
    const nextTrack = s.queue[idx];
    const newQueue = s.queue.filter((_, i) => i !== idx);
    s._setQueue(newQueue);
    this.playTrack(nextTrack);
  }

  prev() {
    const s = usePlayerStore.getState();
    if (s.current?.source === "youtube" && this.ytReady) {
      const t = this.yt.getCurrentTime?.() || 0;
      if (t > 3) { this.yt.seekTo(0, true); return; }
    } else if (this.activeAudio().currentTime > 3) {
      this.activeAudio().currentTime = 0;
      return;
    }
    if (s.history.length === 0) return;
    const [prevTrack, ...rest] = s.history;
    if (s.current) s._setQueue([s.current, ...s.queue]);
    s._set({ history: rest });
    this.playTrack(prevTrack);
  }

  seek(seconds: number) {
    usePlayerStore.getState()._set({ progress: seconds });
    const s = usePlayerStore.getState();
    if (s.current?.source === "youtube" && this.ytReady) {
      try { this.yt.seekTo(seconds, true); } catch { /* */ }
    } else {
      try { this.activeAudio().currentTime = seconds; } catch { /* */ }
    }
  }

  setVolume(v: number) {
    usePlayerStore.getState()._set({ volume: v });
    const s = usePlayerStore.getState();
    if (this.ctx && this.gainA && this.gainB) {
      // Re-apply through normalization gain
      const cur = s.current;
      const factor = cur ? (normCache.get(cur.id) ?? 1) : 1;
      const t = this.ctx.currentTime;
      const target = factor * v;
      try { (this.active === "A" ? this.gainA : this.gainB).gain.setTargetAtTime(target, t, 0.05); } catch { /* */ }
    } else {
      this.audioA.volume = v;
      this.audioB.volume = v;
    }
    if (this.ytReady) {
      try { this.yt.setVolume(v * 100); } catch { /* */ }
    }
  }

  toggleShuffle() {
    const s = usePlayerStore.getState();
    s._set({ shuffle: !s.shuffle });
  }

  cycleRepeat() {
    const s = usePlayerStore.getState();
    const next = s.repeat === "off" ? "all" : s.repeat === "all" ? "one" : "off";
    s._set({ repeat: next });
  }

  addToQueue(t: Track) {
    const s = usePlayerStore.getState();
    s._setQueue([...s.queue, t]);
  }

  removeFromQueue(id: string) {
    const s = usePlayerStore.getState();
    s._setQueue(s.queue.filter((t) => t.id !== id));
  }

  setCrossfade(sec: number) {
    usePlayerStore.getState()._set({ crossfadeSec: sec });
  }
  setNormalize(on: boolean) {
    usePlayerStore.getState()._set({ normalize: on });
  }
  setAutoplayContinuity(on: boolean) {
    usePlayerStore.getState()._set({ autoplayContinuity: on });
  }
  // Automated audio enhancer (EQ + compressor + stereo widener).
  setAudioEnhance(on: boolean) {
    this.enhanceOn = on;
    try { localStorage.setItem("sentify_audio_enhance", on ? "1" : "0"); } catch { /* */ }
    usePlayerStore.getState()._set({ audioEnhance: on });
    this.applyEnhancerMix();
  }
  isAudioEnhanceOn(): boolean { return this.enhanceOn; }

  // ------- Internals -------
  private handleEnd() {
    const s = usePlayerStore.getState();
    if (s.repeat === "one" && s.current) {
      this.seek(0);
      if (s.current.source === "youtube" && this.ytReady) this.yt.playVideo();
      else this.activeAudio().play().catch(() => {});
      return;
    }
    this.next();
  }

  // ------- Spotify-like Recommendations endpoint replacement -------
  // We don't have a real "recommendations" API. Instead, we synthesize a
  // similar-tracks query from artist + a popularity hint, dedupe against
  // history, and feed it back into the queue.
  private async fetchSimilarAndContinue(seed: Track) {
    try {
      const [pri, sec] = await Promise.all([
        searchTracks(`${seed.artist} similar songs`, 12),
        searchTracks(`${seed.artist} top tracks`, 12),
      ]);
      const merged = [...pri, ...sec];
      const seen = new Set<string>([seed.id, ...usePlayerStore.getState().history.map((t) => t.id)]);
      const fresh = merged.filter((t) => !seen.has(t.id));
      if (fresh.length === 0) return;
      const [first, ...rest] = fresh;
      usePlayerStore.getState()._setQueue(rest);
      this.playTrack(first);
    } catch (e) {
      console.warn("Autoplay continuity failed", e);
    }
  }
}

// Singleton — only one engine across the app.
let engine: PlaybackEngine | null = null;
export function getEngine(): PlaybackEngine {
  if (!engine) engine = new PlaybackEngine();
  return engine;
}
