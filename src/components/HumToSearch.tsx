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

  const identifyBlob = async (blob: Blob): Promise<Match | null> => {
    if (blob.size < 2000) return null;
    const buf = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const audioBase64 = btoa(bin);
    const { data, error } = await supabase.functions.invoke("recognize-song", {
      body: { audioBase64, mimeType: blob.type, mode: "hum" },
    });
    if (error) throw error;
    if (data?.error) {
      toast({ title: "Couldn't identify", description: data.error });
      return null;
    }
    const m = data?.match;
    if (!m?.searchQuery) return null;
    let tracks: Track[] = [];
    try {
      const res = await searchTracks(m.searchQuery, { limit: 4 });
      tracks = res.tracks.slice(0, 4);
    } catch { /* keep match without tracks */ }
    return {
      title: m.title,
      artist: m.artist,
      album: m.album,
      searchQuery: m.searchQuery,
      identifiedAt: Date.now(),
      tracks,
    };
  };

  const recordChunk = (durationMs: number): Promise<Blob> =>
    new Promise((resolve, reject) => {
      const stream = streamRef.current;
      if (!stream) return reject(new Error("No stream"));
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
      const match = await identifyBlob(blob);
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
