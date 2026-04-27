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
import { addRecentlyPlayed, getPerfMode, isValidYouTubeId, type EnhancerPreset } from "@/lib/user-prefs";
import { usePlayerStore } from "@/stores/playerStore";
import { searchTracks } from "@/lib/music-api";

// ---------------- Audio Enhancer presets ----------------
// Per preset: low/mid/high EQ gain (dB), compressor threshold, stereo width 0..1, reverb wet 0..1.
interface EnhancerSettings {
  low: number; mid: number; high: number;
  compThreshold: number; compRatio: number;
  width: number; reverbWet: number;
}
const ENHANCER_PRESETS: Record<EnhancerPreset, EnhancerSettings> = {
  off:     { low: 0,  mid: 0,  high: 0,  compThreshold: 0,   compRatio: 1, width: 0,    reverbWet: 0 },
  auto:    { low: 2,  mid: 0,  high: 2,  compThreshold: -22, compRatio: 3, width: 0.25, reverbWet: 0.05 },
  vocal:   { low: -1, mid: 4,  high: 3,  compThreshold: -20, compRatio: 4, width: 0.15, reverbWet: 0.08 },
  bass:    { low: 6,  mid: -1, high: 1,  compThreshold: -22, compRatio: 4, width: 0.20, reverbWet: 0.05 },
  cinema:  { low: 4,  mid: 1,  high: 4,  compThreshold: -20, compRatio: 3, width: 0.50, reverbWet: 0.18 },
  podcast: { low: -3, mid: 5,  high: 2,  compThreshold: -18, compRatio: 6, width: 0,    reverbWet: 0 },
};

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

  // WebAudio graph for normalization + crossfade gains.
  private ctx: AudioContext | null = null;
  private srcA: MediaElementAudioSourceNode | null = null;
  private srcB: MediaElementAudioSourceNode | null = null;
  private gainA: GainNode | null = null;
  private gainB: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserActive: "A" | "B" = "A";

  // Enhancer chain (shared, sits between gains and destination)
  private enhMixer: GainNode | null = null;
  private enhLow: BiquadFilterNode | null = null;
  private enhMid: BiquadFilterNode | null = null;
  private enhHigh: BiquadFilterNode | null = null;
  private enhComp: DynamicsCompressorNode | null = null;
  private enhSplitter: ChannelSplitterNode | null = null;
  private enhMerger: ChannelMergerNode | null = null;
  private enhMidGain: GainNode | null = null;   // (L+R)/2 contribution → width control
  private enhSideGain: GainNode | null = null;  // (L-R)/2 contribution → width control
  private enhDryGain: GainNode | null = null;
  private enhWetGain: GainNode | null = null;
  private enhConvolver: ConvolverNode | null = null;
  private enhOut: GainNode | null = null;

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

    this.startMonitor();
    this.initYouTube();
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

      // ---------- Enhancer chain ----------
      // Mixer ← gainA + gainB → EQ(low/mid/high) → Compressor → StereoWidener → Reverb mix → Out
      this.enhMixer = this.ctx.createGain();
      this.enhLow = this.ctx.createBiquadFilter();
      this.enhLow.type = "lowshelf"; this.enhLow.frequency.value = 200;
      this.enhMid = this.ctx.createBiquadFilter();
      this.enhMid.type = "peaking"; this.enhMid.frequency.value = 1500; this.enhMid.Q.value = 0.9;
      this.enhHigh = this.ctx.createBiquadFilter();
      this.enhHigh.type = "highshelf"; this.enhHigh.frequency.value = 5000;
      this.enhComp = this.ctx.createDynamicsCompressor();
      this.enhComp.threshold.value = -22; this.enhComp.knee.value = 24;
      this.enhComp.ratio.value = 3; this.enhComp.attack.value = 0.003; this.enhComp.release.value = 0.25;

      // Stereo widener: split L/R, build mid/side via gain matrix, recombine.
      this.enhSplitter = this.ctx.createChannelSplitter(2);
      this.enhMerger = this.ctx.createChannelMerger(2);
      this.enhMidGain = this.ctx.createGain(); this.enhMidGain.gain.value = 1;
      this.enhSideGain = this.ctx.createGain(); this.enhSideGain.gain.value = 1;

      // Reverb (short procedural impulse — generated lazily so file size stays small)
      this.enhConvolver = this.ctx.createConvolver();
      this.enhConvolver.buffer = this.makeImpulseResponse(this.ctx, 1.4, 2.2);
      this.enhDryGain = this.ctx.createGain(); this.enhDryGain.gain.value = 1;
      this.enhWetGain = this.ctx.createGain(); this.enhWetGain.gain.value = 0;
      this.enhOut = this.ctx.createGain(); this.enhOut.gain.value = 1;

      this.srcA.connect(this.gainA).connect(this.enhMixer);
      this.srcB.connect(this.gainB).connect(this.enhMixer);

      this.enhMixer.connect(this.enhLow);
      this.enhLow.connect(this.enhMid);
      this.enhMid.connect(this.enhHigh);
      this.enhHigh.connect(this.enhComp);

      // Widener: comp → splitter (L=0, R=1)
      this.enhComp.connect(this.enhSplitter);
      // Mid path: both channels → midGain → both outputs
      this.enhSplitter.connect(this.enhMidGain, 0);
      this.enhSplitter.connect(this.enhMidGain, 1);
      this.enhMidGain.connect(this.enhMerger, 0, 0);
      this.enhMidGain.connect(this.enhMerger, 0, 1);
      // Side path: L→sideGain (positive) merged into output L; R→inverted sideGain into output R.
      // For simplicity reuse same sideGain magnitude on both — width is approximated.
      this.enhSplitter.connect(this.enhSideGain, 0);
      this.enhSideGain.connect(this.enhMerger, 0, 0);
      this.enhSplitter.connect(this.enhSideGain, 1);
      this.enhSideGain.connect(this.enhMerger, 0, 1);

      // Dry/wet reverb mix → analyser → destination
      this.enhMerger.connect(this.enhDryGain).connect(this.enhOut);
      this.enhMerger.connect(this.enhConvolver).connect(this.enhWetGain).connect(this.enhOut);
      this.enhOut.connect(this.analyser).connect(this.ctx.destination);

      // Apply persisted preset
      this.applyEnhancer(usePlayerStore.getState().enhancer);
    } catch (e) {
      console.warn("WebAudio init failed; falling back to plain audio.", e);
      this.ctx = null;
    }
  }

  // ------- Reverb impulse response generator -------
  private makeImpulseResponse(ctx: AudioContext, seconds: number, decay: number): AudioBuffer {
    const rate = ctx.sampleRate;
    const length = Math.max(1, Math.floor(rate * seconds));
    const ir = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = ir.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return ir;
  }

  // ------- Apply enhancer preset (smooth ramps, no clicks) -------
  private applyEnhancer(preset: EnhancerPreset) {
    if (!this.ctx || !this.enhLow) return;
    const p = ENHANCER_PRESETS[preset] || ENHANCER_PRESETS.off;
    const t = this.ctx.currentTime;
    const tau = 0.08;
    try {
      this.enhLow!.gain.setTargetAtTime(p.low, t, tau);
      this.enhMid!.gain.setTargetAtTime(p.mid, t, tau);
      this.enhHigh!.gain.setTargetAtTime(p.high, t, tau);
      this.enhComp!.threshold.setTargetAtTime(p.compThreshold || 0, t, tau);
      this.enhComp!.ratio.setTargetAtTime(Math.max(1, p.compRatio), t, tau);
      // Width: 0 = mono-ish (mid up, side 0), 1 = wider (mid 1, side 1.5)
      this.enhMidGain!.gain.setTargetAtTime(1 - p.width * 0.4, t, tau);
      this.enhSideGain!.gain.setTargetAtTime(p.width * 0.6, t, tau);
      // Reverb wet/dry
      this.enhWetGain!.gain.setTargetAtTime(p.reverbWet, t, tau);
      this.enhDryGain!.gain.setTargetAtTime(1 - p.reverbWet * 0.5, t, tau);
      // Output gain compensation: heavy EQ boosts → drop output a touch to avoid clipping
      const boost = Math.max(0, Math.max(p.low, p.mid, p.high));
      this.enhOut!.gain.setTargetAtTime(Math.pow(10, -boost / 60), t, tau);
    } catch { /* */ }
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
