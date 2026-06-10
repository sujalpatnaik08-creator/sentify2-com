import { useEffect, useRef, useState, useCallback } from "react";
import { Mic, Square, Music2, Loader2, Radio, RadioTower } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { searchTracks } from "@/lib/music-api";
import type { Track } from "@/types/music";
import { TrackCard } from "@/components/TrackCard";

interface Match {
  title: string;
  artist?: string;
  album?: string;
  searchQuery: string;
  identifiedAt: number;
  tracks: Track[];
}

/**
 * HumToSearch — record up to 8s of humming/whistling, render a live waveform,
 * call recognize-song (mode=hum), then fetch playable tracks for the match.
 *
 * Continuous mode: keep recording 8-second chunks back-to-back and identify
 * each chunk so multiple songs can be detected in sequence (e.g. radio).
 */
export const HumToSearch = () => {
  const [recording, setRecording] = useState(false);
  const [identifying, setIdentifying] = useState(false);
  const [continuous, setContinuous] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [level, setLevel] = useState(0);

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const continuousRef = useRef(false);
  const stopAllRef = useRef(false);
  const chunkPeakRef = useRef(0);

  // Draw waveform on canvas while a stream is active
  const drawWave = useCallback(() => {
    const canvas = canvasRef.current;
    const analyser = analyserRef.current;
    if (!canvas || !analyser) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const data = new Uint8Array(analyser.fftSize);

    const tick = () => {
      analyser.getByteTimeDomainData(data);
      ctx.clearRect(0, 0, W, H);
      const grd = ctx.createLinearGradient(0, 0, W, 0);
      grd.addColorStop(0, "hsl(var(--primary))");
      grd.addColorStop(1, "hsl(var(--primary-glow, var(--primary)))");
      ctx.lineWidth = 2;
      ctx.strokeStyle = grd;
      ctx.beginPath();
      const slice = W / data.length;
      let x = 0;
      let peak = 0;
      for (let i = 0; i < data.length; i++) {
        const v = data[i] / 128 - 1;
        if (Math.abs(v) > peak) peak = Math.abs(v);
        const y = H / 2 + v * (H / 2) * 0.9;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        x += slice;
      }
      ctx.stroke();
      setLevel(peak);
      if (peak > chunkPeakRef.current) chunkPeakRef.current = peak;
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();
  }, []);

  const cleanupStream = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    try { audioCtxRef.current?.close(); } catch { /* */ }
    audioCtxRef.current = null;
    analyserRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLevel(0);
    const canvas = canvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  };

  useEffect(() => () => { stopAllRef.current = true; cleanupStream(); }, []);

  // Audio clean-up + melody digitisation pipeline before sending to the
  // database-matching engine (AudD). Steps:
  //   1) Decode the recorded webm/opus blob via OfflineAudioContext.
  //   2) Apply a 80Hz high-pass to drop room rumble + mic handling noise.
  //   3) Peak-normalize so quiet humming has the same loudness as music.
  //   4) Render to 16kHz mono WAV — the canonical fingerprint sample rate.
  // Fingerprinting accuracy on hummed melodies improves dramatically because
  // the matcher receives a clean, consistent signal.
  const cleanAudio = async (blob: Blob): Promise<Blob> => {
    try {
      const arr = await blob.arrayBuffer();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      const tmpCtx = new AC();
      const decoded = await tmpCtx.decodeAudioData(arr.slice(0));
      try { tmpCtx.close(); } catch { /* */ }
      const targetRate = 16000;
      const length = Math.ceil(decoded.duration * targetRate);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const OAC: any = (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
      const off = new OAC(1, length, targetRate);
      const src = off.createBufferSource();
      src.buffer = decoded;
      const hp = off.createBiquadFilter();
      hp.type = "highpass"; hp.frequency.value = 80; hp.Q.value = 0.707;
      const lp = off.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 5500; lp.Q.value = 0.707;
      const comp = off.createDynamicsCompressor();
      comp.threshold.value = -28; comp.knee.value = 18; comp.ratio.value = 4;
      comp.attack.value = 0.005; comp.release.value = 0.15;
      const gain = off.createGain(); gain.gain.value = 1;
      src.connect(hp); hp.connect(lp); lp.connect(comp); comp.connect(gain); gain.connect(off.destination);
      src.start(0);
      const rendered: AudioBuffer = await off.startRendering();
      // Peak-normalize to -1 dBFS
      const data = rendered.getChannelData(0);
      let peak = 0;
      for (let i = 0; i < data.length; i++) { const v = Math.abs(data[i]); if (v > peak) peak = v; }
      const norm = peak > 0 ? 0.92 / peak : 1;
      const pcm = new Int16Array(data.length);
      for (let i = 0; i < data.length; i++) {
        const s = Math.max(-1, Math.min(1, data[i] * norm));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      // WAV header (PCM16, mono, 16kHz)
      const wav = new ArrayBuffer(44 + pcm.length * 2);
      const view = new DataView(wav);
      const writeStr = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
      writeStr(0, "RIFF"); view.setUint32(4, 36 + pcm.length * 2, true);
      writeStr(8, "WAVE"); writeStr(12, "fmt ");
      view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
      view.setUint32(24, targetRate, true); view.setUint32(28, targetRate * 2, true);
      view.setUint16(32, 2, true); view.setUint16(34, 16, true);
      writeStr(36, "data"); view.setUint32(40, pcm.length * 2, true);
      new Int16Array(wav, 44).set(pcm);
      return new Blob([wav], { type: "audio/wav" });
    } catch {
      return blob; // Fallback to raw recording
    }
  };

  // Confidence thresholds — only auto-accept a strong match. Borderline
  // matches surface as a "did you mean?" toast so the user can confirm or
  // retry with a longer/cleaner sample.
  const AUTO_ACCEPT = 0.65; // ≥ → auto-add
  const SUGGEST_MIN = 0.4;  // ≥ but < AUTO_ACCEPT → confirm
  // Calibration — reject the sample early when the captured signal was
  // too quiet to fingerprint. Saves an API call and gives a clear message.
  const MIN_LEVEL = 0.04;

  const identifyBlob = async (blob: Blob, peakLevel: number): Promise<Match | null> => {
    if (blob.size < 2000) {
      toast({ title: "Sample too short", description: "Hum for a bit longer and try again." });
      return null;
    }
    if (peakLevel < MIN_LEVEL) {
      toast({ title: "Too quiet to match", description: "Move closer to the mic and retry." });
      return null;
    }
    const cleaned = await cleanAudio(blob);
    const buf = new Uint8Array(await cleaned.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const audioBase64 = btoa(bin);
    const { data, error } = await supabase.functions.invoke("recognize-song", {
      body: { audioBase64, mimeType: cleaned.type, mode: "hum" },
    });
    if (error) throw error;
    if (data?.error) {
      toast({ title: "Couldn't identify", description: data.error });
      return null;
    }
    const m = data?.match;
    if (!m?.searchQuery) return null;
    const confidence: number = typeof m.confidence === "number" ? m.confidence : 0;
    if (confidence < SUGGEST_MIN) {
      toast({
        title: "No confident match",
        description: "Try humming the chorus again for a cleaner match.",
      });
      return null;
    }
    let tracks: Track[] = [];
    try {
      const res = await searchTracks(m.searchQuery, 4);
      tracks = res.slice(0, 4);
    } catch { /* keep match without tracks */ }
    const match: Match = {
      title: m.title,
      artist: m.artist,
      album: m.album,
      searchQuery: m.searchQuery,
      identifiedAt: Date.now(),
      tracks,
    };
    if (confidence < AUTO_ACCEPT) {
      toast({
        title: `Maybe: ${m.title}`,
        description: `${Math.round(confidence * 100)}% match — hum again to confirm or accept below.`,
      });
    }
    return match;
  };

  const recordChunk = (durationMs: number): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const stream = streamRef.current;
      if (!stream) return reject(new Error("No stream"));
      chunkPeakRef.current = 0;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recRef.current = rec;
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
      rec.onerror = (e: any) => reject(e?.error || new Error("Recorder error"));
      rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
      rec.start();
      setTimeout(() => { try { rec.state === "recording" && rec.stop(); } catch { /* */ } }, durationMs);
    });

  const startStream = async () => {
    if (streamRef.current) return true;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast({ title: "Not supported", description: "Audio recording isn't supported here." });
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const AC: any = (window as any).AudioContext || (window as any).webkitAudioContext;
      const ctx = new AC();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      src.connect(analyser);
      analyserRef.current = analyser;
      drawWave();
      return true;
    } catch {
      toast({ title: "Microphone blocked", description: "Allow mic access to hum to search." });
      return false;
    }
  };

  const stopAll = () => {
    stopAllRef.current = true;
    continuousRef.current = false;
    setContinuous(false);
    setRecording(false);
    setIdentifying(false);
    try { recRef.current?.state === "recording" && recRef.current.stop(); } catch { /* */ }
    cleanupStream();
  };

  const runOnce = async () => {
    if (recording || identifying) return;
    stopAllRef.current = false;
    const ok = await startStream();
    if (!ok) return;
    setRecording(true);
    toast({ title: "Hum or whistle…", description: "Recording 8 seconds." });
    try {
      const blob = await recordChunk(8000);
      setRecording(false);
      setIdentifying(true);
      const match = await identifyBlob(blob, chunkPeakRef.current);
      if (match) {
        setMatches((prev) => [match, ...prev].slice(0, 12));
        toast({ title: `Found: ${match.title}`, description: match.artist || "" });
      } else {
        toast({ title: "No match", description: "Try a longer or clearer hum." });
      }
    } catch (e: any) {
      toast({ title: "Recognition failed", description: e?.message || "Please try again." });
    } finally {
      setIdentifying(false);
      if (!continuousRef.current) cleanupStream();
    }
  };

  const startContinuous = async () => {
    if (continuous) {
      stopAll();
      return;
    }
    stopAllRef.current = false;
    const ok = await startStream();
    if (!ok) return;
    continuousRef.current = true;
    setContinuous(true);
    toast({
      title: "Background listening on",
      description: "Sentify will keep identifying songs in sequence.",
    });
    while (continuousRef.current && !stopAllRef.current) {
      try {
        setRecording(true);
        const blob = await recordChunk(8000);
        setRecording(false);
        if (!continuousRef.current) break;
        setIdentifying(true);
        const match = await identifyBlob(blob);
        if (match) {
          setMatches((prev) => {
            // Dedupe consecutive identical matches
            if (prev[0]?.searchQuery === match.searchQuery) return prev;
            return [match, ...prev].slice(0, 12);
          });
        }
      } catch (e: any) {
        toast({ title: "Background identify error", description: e?.message || "Pausing." });
        break;
      } finally {
        setIdentifying(false);
      }
    }
    cleanupStream();
    continuousRef.current = false;
    setContinuous(false);
  };

  return (
    <section className="rounded-2xl border border-border/60 bg-card/60 backdrop-blur p-5 md:p-6 shadow-elegant">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-gradient-primary flex items-center justify-center shadow-glow">
            <Music2 className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-bold">Hum to Search</h2>
            <p className="text-xs md:text-sm text-muted-foreground">
              Hum, sing or whistle a tune — or turn on background listening to identify multiple songs in a row.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            onClick={runOnce}
            disabled={continuous || identifying}
            className="rounded-full gap-2 px-4 h-10 font-semibold"
            aria-label="Hum to search once"
          >
            {recording && !continuous ? (
              <Square className="w-4 h-4" />
            ) : identifying && !continuous ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
            {recording && !continuous ? "Listening…" : identifying && !continuous ? "Matching…" : "Hum to Search"}
          </Button>
          <Button
            onClick={startContinuous}
            variant={continuous ? "default" : "outline"}
            className="rounded-full gap-2 px-4 h-10 font-semibold"
            aria-label={continuous ? "Stop background listening" : "Start background listening"}
            title={continuous ? "Stop background listening" : "Background identification (continuous)"}
          >
            {continuous ? <RadioTower className="w-4 h-4 animate-pulse" /> : <Radio className="w-4 h-4" />}
            {continuous ? "Listening… Stop" : "Background"}
          </Button>
        </div>
      </div>

      {/* Waveform */}
      <div className="mt-5 rounded-xl border border-border/60 bg-secondary/40 overflow-hidden">
        <canvas
          ref={canvasRef}
          width={1200}
          height={120}
          className="block w-full h-[120px]"
          aria-label="Microphone waveform"
        />
        <div className="px-4 py-2 flex items-center justify-between text-xs text-muted-foreground border-t border-border/60">
          <span>
            {streamRef.current ? (continuous ? "Background mode" : recording ? "Recording 8s sample" : "Mic ready") : "Mic idle"}
          </span>
          <span aria-hidden>Level: {Math.round(level * 100)}%</span>
        </div>
      </div>

      {/* Results */}
      <div className="mt-5">
        {matches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Identified songs will appear here. Each match becomes playable instantly.
          </p>
        ) : (
          <ul className="space-y-4">
            {matches.map((m, idx) => (
              <li key={`${m.searchQuery}-${m.identifiedAt}-${idx}`} className="rounded-xl border border-border/60 bg-background/50 p-4">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-semibold">{m.title}</p>
                    {m.artist && <p className="text-sm text-muted-foreground">{m.artist}{m.album ? ` · ${m.album}` : ""}</p>}
                  </div>
                  <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {new Date(m.identifiedAt).toLocaleTimeString()}
                  </span>
                </div>
                {m.tracks.length > 0 && (
                  <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {m.tracks.map((t) => (
                      <TrackCard key={t.id} track={t} queue={m.tracks} />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
};

export default HumToSearch;
