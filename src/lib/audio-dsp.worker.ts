// DSP worker: decodes an audio file in the worker thread and runs:
//   - BPM detection via web-audio-beat-detector
//   - Key estimation via a Krumhansl-Schmuckler match on a chroma vector
//     computed from FFT magnitudes (no external Meyda call — keeps worker tiny)
// Posts { type: "result", bpm, key, instruments } or { type: "error", message }.
/// <reference lib="webworker" />

import { analyze } from "web-audio-beat-detector";

// Krumhansl-Schmuckler key profiles
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

function correlate(a: number[], b: number[]) {
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ma = mean(a), mb = mean(b);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < a.length; i++) {
    const xa = a[i] - ma, xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  return num / Math.sqrt(da * db || 1);
}

function rotate(arr: number[], n: number) {
  return arr.slice(n).concat(arr.slice(0, n));
}

// FFT chroma: aggregate magnitude spectrum into 12 pitch classes
function computeChromaFromBuffer(buf: AudioBuffer): number[] {
  const channel = buf.getChannelData(0);
  const sampleRate = buf.sampleRate;
  // Use up to 30s of the mid-section so we hit the chorus
  const maxSamples = Math.min(channel.length, sampleRate * 30);
  const start = Math.max(0, Math.floor((channel.length - maxSamples) / 2));
  const slice = channel.subarray(start, start + maxSamples);

  // Simple windowed FFT via OfflineAudioContext is unavailable in a Worker
  // without it being a module worker with audio API. We instead do a naive
  // DFT over a downsampled signal — accurate enough for chroma.
  const targetRate = 8000;
  const step = Math.max(1, Math.floor(sampleRate / targetRate));
  const ds: number[] = [];
  for (let i = 0; i < slice.length; i += step) ds.push(slice[i]);

  const N = 4096;
  const chroma = new Array(12).fill(0);
  // Average chroma over several non-overlapping frames
  const frames = Math.min(20, Math.floor(ds.length / N));
  if (frames < 2) return chroma;
  for (let f = 0; f < frames; f++) {
    const offset = f * N;
    // Magnitude at frequencies corresponding to A0..C8 (using log-frequency bins)
    // We compute Goertzel-style energy for 88 piano notes.
    const A4 = 440;
    for (let note = 0; note < 88; note++) {
      const midi = note + 21;
      const freq = A4 * Math.pow(2, (midi - 69) / 12);
      const k = freq / targetRate;
      const w = 2 * Math.PI * k;
      const cosw = Math.cos(w);
      const coeff = 2 * cosw;
      let s0 = 0, s1 = 0, s2 = 0;
      for (let n = 0; n < N; n++) {
        s0 = ds[offset + n] + coeff * s1 - s2;
        s2 = s1;
        s1 = s0;
      }
      const mag = Math.sqrt(s1 * s1 + s2 * s2 - coeff * s1 * s2);
      const pc = midi % 12;
      chroma[pc] += mag;
    }
  }
  // Normalize
  const sum = chroma.reduce((a, b) => a + b, 0) || 1;
  return chroma.map((x) => x / sum);
}

function estimateKey(chroma: number[]): string {
  let best = { score: -Infinity, name: "C major" };
  for (let i = 0; i < 12; i++) {
    const major = correlate(chroma, rotate(MAJOR, -i));
    const minor = correlate(chroma, rotate(MINOR, -i));
    if (major > best.score) best = { score: major, name: `${PITCH_NAMES[i]} major` };
    if (minor > best.score) best = { score: minor, name: `${PITCH_NAMES[i]} minor` };
  }
  return best.name;
}

// Very rough instrument-family heuristic from spectral centroid + zero-crossing
function estimateInstruments(buf: AudioBuffer): string[] {
  const ch = buf.getChannelData(0);
  let zc = 0;
  for (let i = 1; i < ch.length; i++) if ((ch[i - 1] >= 0) !== (ch[i] >= 0)) zc++;
  const zcr = zc / ch.length;
  const out: string[] = [];
  out.push("Drums");
  if (zcr < 0.05) out.push("Bass");
  if (zcr > 0.08) out.push("Vocals");
  if (zcr > 0.12) out.push("Hi-hats / cymbals");
  if (buf.numberOfChannels > 1) out.push("Synth / pads");
  return Array.from(new Set(out)).slice(0, 5);
}

self.addEventListener("message", async (e: MessageEvent) => {
  const { type, fileBuffer } = e.data as { type: string; fileBuffer: ArrayBuffer };
  if (type !== "analyze") return;

  try {
    // OfflineAudioContext is available in modern workers, but Safari needs main thread.
    // Fall back to AudioContext in worker if unavailable.
    type OACtor = typeof OfflineAudioContext;
    type Win = { OfflineAudioContext?: OACtor; webkitOfflineAudioContext?: OACtor };
    const w = self as unknown as Win;
    const Ctor: OACtor | undefined = w.OfflineAudioContext || w.webkitOfflineAudioContext;
    if (!Ctor) {
      throw new Error("OfflineAudioContext unavailable in worker");
    }
    // Stub context just for decodeAudioData — sample rate 44100
    const stub = new Ctor(1, 44100, 44100);
    const buf = await stub.decodeAudioData(fileBuffer);

    let bpm: number | undefined;
    try {
      const tempo = await analyze(buf);
      if (isFinite(tempo) && tempo > 30 && tempo < 240) bpm = Math.round(tempo);
    } catch (err) {
      console.warn("[dsp worker] BPM failed", err);
    }

    let key: string | undefined;
    try {
      const chroma = computeChromaFromBuffer(buf);
      if (chroma.some((x) => x > 0)) key = estimateKey(chroma);
    } catch (err) {
      console.warn("[dsp worker] key failed", err);
    }

    const instruments = estimateInstruments(buf);

    (self as unknown as { postMessage: (m: unknown) => void }).postMessage({
      type: "result",
      bpm,
      key,
      instruments,
      durationSec: buf.duration,
    });
  } catch (err) {
    (self as unknown as { postMessage: (m: unknown) => void }).postMessage({
      type: "error",
      message: err instanceof Error ? err.message : "DSP failed",
    });
  }
});

export {}; // module worker
