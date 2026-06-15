## Goal

Add an automated musicologist that extracts genre, subgenre, key, BPM, instruments, mood, explicit flag, and "golden minute" for any track — both streamed YouTube tracks and locally uploaded files — and surfaces the data as track badges and a Smart Playlists page.

## Architecture

```
Streamed track (Now Playing)
  → analyze-track edge fn  → AI (title+artist+lyrics) → genre/mood/explicit/instruments/golden-minute
                                                       → BPM/key best-effort from lyrics tempo cues

Uploaded local file
  → browser DSP (web-audio-beat-detector + Meyda)     → exact BPM + key + dominant instruments
  → analyze-track edge fn (parallel)                  → genre/mood/explicit/golden-minute
  → merged AnalysisResult, cached in IndexedDB
```

All analyses cached per-track-id in IndexedDB (`sentify_analysis_v1` store) so re-opens are instant.

## Backend

**New edge fn `supabase/functions/analyze-track/index.ts`** (verify_jwt = true)
- Body: `{ trackId, title, artist, lyrics?, durationSec? }` with Zod-style validation + 30-char allowlist on optional `language` field
- Calls Lovable AI Gateway `google/gemini-2.5-flash` with `response_format: json_object` and a strict system prompt asking for:
  ```ts
  { genre, subgenre, mood: Mood, bpmEstimate, keyEstimate, instruments: string[],
    explicit: boolean, explicitReasons: string[], goldenStartSec, goldenEndSec, confidence }
  ```
- Returns generic 500 error message (no raw `e.message`) — same pattern as the security-hardened functions
- Rate-limit + 402 handling identical to translate-lyrics

## Frontend

**Library**
- `src/lib/musicologist.ts` — `analyzeTrack(track, opts)` orchestrator. Calls edge fn for AI side; if `audioFile` provided, runs DSP in a Web Worker.
- `src/lib/audio-dsp.worker.ts` — Web Worker that decodes the file via OfflineAudioContext, runs `web-audio-beat-detector` for BPM, a small Krumhansl key-detector over chroma from `meyda`, and a basic spectral-centroid → instrument-family heuristic.
- `src/lib/analysis-store.ts` — IndexedDB get/set/list of `AnalysisResult` keyed by `trackId`. Adds `useAnalysis(trackId)` hook.
- `src/types/analysis.ts` — shared `AnalysisResult` type.

**Components**
- `src/components/AnalysisBadges.tsx` — chips for genre / BPM / key / mood / explicit. Used in `TrackCard`, `NowPlayingView`, `Library`.
- `src/components/GoldenMinuteButton.tsx` — "Play golden minute" jumps player to `goldenStartSec`.
- `src/components/UploadDropzone.tsx` — drag-drop audio (mp3/m4a/wav/flac), kicks off analysis, persists file blob in IndexedDB so uploads survive reloads, queues the local track into the player.

**Pages**
- `src/pages/Upload.tsx` (new route `/upload`) — dropzone + list of analyzed local tracks with badges and per-track re-analyze action.
- `src/pages/SmartPlaylists.tsx` (new route `/smart-playlists`) — auto-grouped sections (By Mood, By Genre, By BPM range, Explicit-free) with MoodFilter-style chip filters. Pulls from analysis-store + current library.

**Wiring**
- `src/App.tsx` — register `/upload` and `/smart-playlists` (protected routes).
- `src/components/Sidebar.tsx` — add nav entries with new icons (Sparkles for Smart Playlists, UploadCloud for Upload).
- `src/contexts/PlayerContext.tsx` — on track change, fire `analyzeTrack` in the background (debounced, skip if cached). Expose `currentAnalysis` for NowPlaying/PlayerBar consumers.
- `src/components/NowPlayingView.tsx` — show `<AnalysisBadges>` + `<GoldenMinuteButton>` under metadata.
- `src/components/TrackCard.tsx` — show compact badge row when analysis cached.

## Dependencies

- `web-audio-beat-detector` (~6 KB) — robust BPM detection from `AudioBuffer`
- `meyda` (~80 KB) — chroma/MFCC/spectral features for key + instrument heuristic
- `idb` (~3 KB) — typed IndexedDB wrapper for analysis-store

## Data shape

```ts
type AnalysisResult = {
  trackId: string;
  source: "ai" | "dsp" | "hybrid";
  genre?: string;
  subgenre?: string;
  bpm?: number;          // 40–220
  key?: string;          // e.g. "C# minor"
  instruments?: string[];
  mood?: Mood;
  explicit?: boolean;
  explicitReasons?: string[];
  goldenStartSec?: number;
  goldenEndSec?: number;
  confidence?: number;   // 0–1
  analyzedAt: number;    // epoch ms
};
```

## Edge cases handled

- Edge fn auth failure → toast "Sign in to analyze tracks"
- DSP failure (unsupported codec, decode error) → fall back to AI-only result, source = "ai"
- Lyrics unavailable → AI still returns genre/mood/explicit from title+artist with lower confidence
- Re-analysis: button on track row clears cache entry and refetches
- 402/429 from gateway → user-visible toast, no silent fail
- Memory: OfflineAudioContext decoded buffers freed after worker run; uploaded blobs capped at 30 MB

## Out of scope (call out to user)

- Cloud-syncing analysis across devices (currently per-device IndexedDB).
- Album-level / playlist-level aggregate analysis.
- Stem separation / per-instrument waveform.

## Order of work

1. Types + edge fn + deploy + curl-test
2. Analysis store (IndexedDB) + musicologist orchestrator + Worker DSP
3. AnalysisBadges + GoldenMinuteButton
4. Upload page + dropzone
5. Smart Playlists page
6. Wire into App routes, Sidebar, NowPlayingView, TrackCard, PlayerContext background trigger
7. Manual smoke test: stream a track (AI-only), upload an mp3 (hybrid), open Smart Playlists, jump to golden minute
