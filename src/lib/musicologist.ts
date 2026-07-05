// Musicologist orchestrator: combines AI metadata analysis (edge function)
// with optional in-browser DSP (BPM/key/instruments) for uploaded audio files.
// Results are cached in IndexedDB so re-opens are instant.

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AnalysisResult } from "@/types/analysis";
import { fetchLyrics } from "@/lib/music-api";
import {
  getAnalysis,
  putAnalysis,
} from "./analysis-store";

interface AnalyzeOpts {
  trackId: string;
  title: string;
  artist: string;
  durationSec?: number;
  /** Optional audio file (or blob) — when present, runs in-browser DSP for BPM/key. */
  audioFile?: Blob;
  /** Bypass cache and re-run analysis from scratch. */
  force?: boolean;
}

let workerRef: Worker | null = null;
const getWorker = () => {
  if (!workerRef) {
    workerRef = new Worker(
      new URL("./audio-dsp.worker.ts", import.meta.url),
      { type: "module" },
    );
  }
  return workerRef;
};

interface DspResult {
  bpm?: number;
  key?: string;
  instruments?: string[];
  durationSec?: number;
}

function runDsp(blob: Blob): Promise<DspResult> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const onMessage = (e: MessageEvent) => {
      const data = e.data as { type: string } & DspResult & { message?: string };
      w.removeEventListener("message", onMessage);
      if (data.type === "result") {
        resolve({ bpm: data.bpm, key: data.key, instruments: data.instruments, durationSec: data.durationSec });
      } else {
        reject(new Error(data.message || "DSP failed"));
      }
    };
    w.addEventListener("message", onMessage);
    blob.arrayBuffer().then((buffer) => {
      w.postMessage({ type: "analyze", fileBuffer: buffer }, [buffer]);
    }).catch(reject);
  });
}

interface AiAnalysis {
  genre?: string;
  subgenre?: string;
  mood?: AnalysisResult["mood"];
  moodLabel?: string;
  bpm?: number;
  key?: string;
  instruments?: string[];
  explicit?: boolean;
  explicitReasons?: string[];
  goldenStartSec?: number;
  goldenEndSec?: number;
  confidence?: number;
  credits?: { role: string; name: string }[];
  canvasPrompt?: string;
  error?: string;
}

async function runAi(opts: AnalyzeOpts, lyrics?: string): Promise<AiAnalysis | null> {
  try {
    const { data, error } = await supabase.functions.invoke("analyze-track", {
      body: {
        trackId: opts.trackId,
        title: opts.title,
        artist: opts.artist,
        lyrics: lyrics || undefined,
        durationSec: opts.durationSec,
      },
    });
    if (error) {
      console.warn("[musicologist] AI error", error);
      return null;
    }
    return data as AiAnalysis;
  } catch (e) {
    console.warn("[musicologist] AI invoke failed", e);
    return null;
  }
}

export async function analyzeTrack(opts: AnalyzeOpts): Promise<AnalysisResult | null> {
  if (!opts.force) {
    const cached = await getAnalysis(opts.trackId);
    if (cached) return cached;
  }

  // Try to fetch lyrics for richer AI analysis (best-effort, ignore failures).
  let lyricsText: string | undefined;
  try {
    const res = await fetchLyrics(opts.artist, opts.title, opts.durationSec);
    if (res.plain) lyricsText = res.plain;
    else if (res.synced?.length) lyricsText = res.synced.map((l) => l.text).join("\n");
  } catch {
    /* lyrics optional */
  }

  // Run AI + DSP in parallel
  const [ai, dsp] = await Promise.allSettled([
    runAi(opts, lyricsText),
    opts.audioFile ? runDsp(opts.audioFile) : Promise.resolve(null),
  ]);

  const aiVal = ai.status === "fulfilled" ? ai.value : null;
  const dspVal = dsp.status === "fulfilled" ? dsp.value : null;

  if (!aiVal && !dspVal) return null;

  const source: AnalysisResult["source"] =
    aiVal && dspVal ? "hybrid" : aiVal ? "ai" : "dsp";

  const result: AnalysisResult = {
    trackId: opts.trackId,
    source,
    title: opts.title,
    artist: opts.artist,
    genre: aiVal?.genre,
    subgenre: aiVal?.subgenre,
    bpm: dspVal?.bpm ?? aiVal?.bpm,
    key: dspVal?.key ?? aiVal?.key,
    instruments:
      dspVal?.instruments && dspVal.instruments.length
        ? Array.from(new Set([...(dspVal.instruments || []), ...(aiVal?.instruments || [])])).slice(0, 6)
        : aiVal?.instruments,
    mood: aiVal?.mood,
    moodLabel: aiVal?.moodLabel,
    explicit: aiVal?.explicit ?? false,
    explicitReasons: aiVal?.explicitReasons,
    goldenStartSec: aiVal?.goldenStartSec,
    goldenEndSec: aiVal?.goldenEndSec,
    confidence: aiVal?.confidence,
    analyzedAt: Date.now(),
  };

  await putAnalysis(result);
  return result;
}

/** React hook — returns the cached AnalysisResult for a track id (live-updates on changes). */
export function useAnalysis(trackId: string | undefined): AnalysisResult | undefined {
  const [data, setData] = useState<AnalysisResult | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (!trackId) {
      setData(undefined);
      return;
    }
    getAnalysis(trackId).then((r) => { if (!cancelled) setData(r); });
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<{ trackId: string }>).detail;
      if (!detail || detail.trackId === trackId) {
        getAnalysis(trackId).then((r) => { if (!cancelled) setData(r); });
      }
    };
    window.addEventListener("sentify:analysis-changed", onChange);
    return () => {
      cancelled = true;
      window.removeEventListener("sentify:analysis-changed", onChange);
    };
  }, [trackId]);

  return data;
}
