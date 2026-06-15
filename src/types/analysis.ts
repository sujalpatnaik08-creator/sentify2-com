import type { Mood } from "./music";

export interface AnalysisResult {
  trackId: string;
  source: "ai" | "dsp" | "hybrid";
  title?: string;
  artist?: string;
  genre?: string;
  subgenre?: string;
  bpm?: number;          // 40–220
  key?: string;          // e.g. "C# minor"
  instruments?: string[];
  mood?: Mood;
  moodLabel?: string;    // free-form label when AI returned an unknown mood
  explicit?: boolean;
  explicitReasons?: string[];
  goldenStartSec?: number;
  goldenEndSec?: number;
  confidence?: number;   // 0–1
  analyzedAt: number;    // epoch ms
}

export interface LocalUpload {
  trackId: string;       // sentify_upload_<hash>
  title: string;
  artist: string;
  durationSec: number;
  mime: string;
  size: number;
  addedAt: number;
  blob: Blob;            // stored in IndexedDB
}
