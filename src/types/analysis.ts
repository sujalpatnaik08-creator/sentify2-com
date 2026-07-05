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
  /** Credits derived from title / lyrics — role + name pairs. */
  credits?: { role: string; name: string }[];
  /** AI-generated visual mood prompt used for the looping Canvas backdrop. */
  canvasPrompt?: string;
  /** User-set canvas override (image URL or short text prompt) — takes precedence over `canvasPrompt`. */
  canvasOverride?: string;
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
