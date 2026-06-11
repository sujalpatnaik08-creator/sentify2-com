// Robustness checks for gapless playback when the user triggers rapid
// track switches (autocomplete clicks, voice commands). These tests focus
// on the engine's playSeq guard + previous-track teardown contract — the
// behavior that protects against double-audio bugs.

import { describe, it, expect, beforeEach, vi } from "vitest";

// JSDOM doesn't ship HTMLAudioElement methods or AudioContext; stub them.
class FakeAudio {
  src = "";
  volume = 1;
  currentTime = 0;
  paused = true;
  duration = 0;
  preload = "metadata";
  crossOrigin: string | null = null;
  static playCount = 0;
  static pauseCount = 0;
  play = vi.fn(async () => { this.paused = false; FakeAudio.playCount++; });
  pause = vi.fn(() => { this.paused = true; FakeAudio.pauseCount++; });
  load = vi.fn();
  removeAttribute = vi.fn();
  addEventListener = vi.fn();
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).Audio = FakeAudio;

describe("playback engine — rapid track switching", () => {
  beforeEach(() => {
    FakeAudio.playCount = 0;
    FakeAudio.pauseCount = 0;
  });

  it("stops the previous audio element before starting a new track", async () => {
    const { getEngine } = await import("@/lib/playback-engine");
    const engine = getEngine();
    const t1 = { id: "a-1", title: "A", artist: "X", album: "", artwork: "", audioUrl: "https://example.com/a.mp3", duration: 100, source: "audius" as const };
    const t2 = { id: "a-2", title: "B", artist: "Y", album: "", artwork: "", audioUrl: "https://example.com/b.mp3", duration: 100, source: "audius" as const };
    engine.playTrack(t1);
    engine.playTrack(t2);
    // Both calls run synchronous teardown; pause must have been called at
    // least once (previous element shut down before the new one starts).
    expect(FakeAudio.pauseCount).toBeGreaterThan(0);
  });

  it("ignores stale async play() callbacks when user switches mid-load", async () => {
    const { getEngine } = await import("@/lib/playback-engine");
    const engine = getEngine();
    const t1 = { id: "a-1", title: "A", artist: "X", album: "", artwork: "", audioUrl: "https://example.com/a.mp3", duration: 100, source: "audius" as const };
    const t2 = { id: "a-2", title: "B", artist: "Y", album: "", artwork: "", audioUrl: "https://example.com/b.mp3", duration: 100, source: "audius" as const };
    engine.playTrack(t1);
    engine.playTrack(t2); // bumps playSeq → stale resolution for t1 is paused
    // Allow microtasks (play() promise) to settle
    await Promise.resolve();
    await Promise.resolve();
    // The current track in the store must be t2, not t1.
    const { usePlayerStore } = await import("@/stores/playerStore");
    expect(usePlayerStore.getState().current?.id).toBe("a-2");
  });
});
