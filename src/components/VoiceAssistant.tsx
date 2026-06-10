// Voice Assistant — hands-free song playback.
// Continuous listening mode: detects commands like
//   "play <song>", "play <song> by <artist>", "pause", "next", "previous",
//   "stop", "skip", "resume". On a play command we instantly search and
//   start the top-ranked result.
//
// Uses the Web Speech API (Chrome/Edge/Safari). Falls back to a manual
// push-to-talk button when continuous mode isn't supported.

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { searchTracks } from "@/lib/music-api";
import { usePlayer } from "@/contexts/PlayerContext";

const COMMAND_RE =
  /^\s*(?:hey\s+sentify[,\s]+)?(?:please\s+)?(play|pause|stop|resume|next|skip|previous|prev|back)\b\s*(.*)$/i;

export const VoiceAssistant = () => {
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [heard, setHeard] = useState("");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srRef = useRef<any>(null);
  const activeRef = useRef(false);
  const { playTrack, togglePlay, next, prev, isPlaying } = usePlayer();

  const supported =
    typeof window !== "undefined" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  const handleTranscript = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setHeard(trimmed);
      const m = trimmed.match(COMMAND_RE);
      if (!m) return;
      const verb = m[1].toLowerCase();
      const rest = m[2].trim();
      if (verb === "pause" || verb === "stop") {
        if (isPlaying) togglePlay();
        return;
      }
      if (verb === "resume") {
        if (!isPlaying) togglePlay();
        return;
      }
      if (verb === "next" || verb === "skip") { next(); return; }
      if (verb === "previous" || verb === "prev" || verb === "back") { prev(); return; }
      // play <song>
      if (!rest) {
        if (!isPlaying) togglePlay();
        return;
      }
      setBusy(true);
      toast({ title: "Voice assistant", description: `Playing "${rest}"…` });
      try {
        const results = await searchTracks(rest, 6);
        const top = results[0];
        if (top) playTrack(top, results);
        else toast({ title: "No match", description: `Couldn't find "${rest}".` });
      } catch (e) {
        toast({ title: "Search failed", description: e instanceof Error ? e.message : "Try again." });
      } finally {
        setBusy(false);
      }
    },
    [isPlaying, next, prev, playTrack, togglePlay],
  );

  const start = useCallback(() => {
    if (!supported) {
      toast({ title: "Voice assistant unsupported", description: "Try Chrome, Edge or Safari." });
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const sr = new SR();
    sr.lang = navigator.language || "en-US";
    sr.continuous = true;
    sr.interimResults = false;
    sr.maxAlternatives = 1;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sr.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          handleTranscript(e.results[i][0].transcript);
        }
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sr.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        toast({ title: "Microphone blocked", description: "Allow mic access for voice commands." });
        setActive(false);
        activeRef.current = false;
      }
    };
    sr.onend = () => {
      // Auto-restart while active so the assistant keeps listening.
      if (activeRef.current) {
        try { sr.start(); } catch { /* ignore double-start */ }
      } else {
        setActive(false);
      }
    };
    try { sr.start(); } catch { /* */ }
    srRef.current = sr;
    activeRef.current = true;
    setActive(true);
    toast({
      title: "Voice assistant on",
      description: 'Say "play <song name>", "pause", "next", or "previous".',
    });
  }, [handleTranscript, supported]);

  const stop = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    try { srRef.current?.stop(); } catch { /* */ }
    srRef.current = null;
  }, []);

  useEffect(() => () => stop(), [stop]);

  return (
    <div className="fixed bottom-28 right-4 z-30 flex flex-col items-end gap-2 pointer-events-none">
      {active && heard && (
        <div className="pointer-events-auto max-w-[220px] truncate rounded-full bg-card/90 backdrop-blur px-3 py-1.5 text-xs border border-border shadow-elegant">
          <span className="text-muted-foreground mr-1">heard:</span>
          <span className="font-medium">{heard}</span>
        </div>
      )}
      <Button
        type="button"
        size="icon"
        onClick={active ? stop : start}
        className={`pointer-events-auto h-12 w-12 rounded-full shadow-glow ${active ? "bg-primary text-primary-foreground animate-pulse" : "bg-card border border-border text-foreground hover:bg-accent"}`}
        aria-label={active ? "Stop voice assistant" : "Start voice assistant"}
        title={active ? "Voice assistant listening — click to stop" : "Voice assistant — say play <song>"}
      >
        {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : active ? <Mic className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
        <span className="sr-only">{active ? "Listening" : "Voice assistant"}</span>
        {!active && !busy && <MicOff className="hidden" />}
      </Button>
    </div>
  );
};

export default VoiceAssistant;
