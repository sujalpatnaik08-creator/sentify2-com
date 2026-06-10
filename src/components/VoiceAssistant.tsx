// Voice Assistant — hands-free song playback with explicit permission
// handling, status feedback, and a confirmation window before auto-play.
//
// Commands:
//   "play <song>"           — search + ask to confirm before playing
//   "play <song> now"       — skip confirmation
//   "pause" / "stop"        — pause current
//   "resume"                — resume current
//   "next" / "skip"         — skip
//   "previous" / "back"     — previous
//
// Uses the Web Speech API (Chrome/Edge/Safari).

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Loader2, Sparkles, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { searchTracks, cleanDisplayTitle } from "@/lib/music-api";
import { usePlayer } from "@/contexts/PlayerContext";
import type { Track } from "@/types/music";

const COMMAND_RE =
  /^\s*(?:hey\s+sentify[,\s]+)?(?:please\s+)?(play|pause|stop|resume|next|skip|previous|prev|back)\b\s*(.*)$/i;

type Status = "idle" | "listening" | "searching" | "confirming" | "playing";

interface Pending {
  query: string;
  track: Track;
  queue: Track[];
  timer: number;
}

export const VoiceAssistant = () => {
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [heard, setHeard] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srRef = useRef<any>(null);
  const activeRef = useRef(false);
  const pendingRef = useRef<Pending | null>(null);
  const { playTrack, togglePlay, next, prev, isPlaying, current } = usePlayer();

  const supported =
    typeof window !== "undefined" &&
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  // Reflect "playing" status while a song is playing.
  useEffect(() => {
    if (!active) return;
    if (status === "confirming" || status === "searching") return;
    setStatus(isPlaying ? "playing" : "listening");
  }, [isPlaying, active, status]);

  const clearPending = useCallback(() => {
    if (pendingRef.current) clearTimeout(pendingRef.current.timer);
    pendingRef.current = null;
    setPending(null);
  }, []);

  const confirmPlay = useCallback(() => {
    const p = pendingRef.current;
    if (!p) return;
    clearPending();
    playTrack(p.track, p.queue);
    toast({ title: "Playing", description: `${p.track.title}` });
    setStatus("playing");
  }, [clearPending, playTrack]);

  const cancelPlay = useCallback(() => {
    clearPending();
    setStatus(activeRef.current ? "listening" : "idle");
    toast({ title: "Cancelled", description: "Voice request cancelled." });
  }, [clearPending]);

  const offerTrack = useCallback(
    (query: string, track: Track, queue: Track[], autoConfirm: boolean) => {
      clearPending();
      if (autoConfirm) {
        playTrack(track, queue);
        toast({ title: "Playing", description: track.title });
        setStatus("playing");
        return;
      }
      // 4-second auto-confirm window. The card UI shows ✓ / ✗.
      const timer = window.setTimeout(() => {
        confirmPlay();
      }, 4000);
      const next: Pending = { query, track, queue, timer };
      pendingRef.current = next;
      setPending(next);
      setStatus("confirming");
    },
    [clearPending, confirmPlay, playTrack],
  );

  const handleTranscript = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      setHeard(trimmed);
      const m = trimmed.match(COMMAND_RE);
      if (!m) return;
      const verb = m[1].toLowerCase();
      let rest = m[2].trim();
      const skipConfirm = /\b(now|immediately|right now)$/i.test(rest);
      rest = rest.replace(/\b(now|immediately|right now)$/i, "").trim();

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
      if (!rest) {
        if (current && !isPlaying) togglePlay();
        return;
      }
      setStatus("searching");
      try {
        const results = await searchTracks(rest, 6);
        const top = results[0];
        if (top) {
          offerTrack(rest, top, results, skipConfirm);
        } else {
          toast({ title: "No match", description: `Couldn't find "${rest}".` });
          setStatus(activeRef.current ? "listening" : "idle");
        }
      } catch (e) {
        toast({ title: "Search failed", description: e instanceof Error ? e.message : "Try again." });
        setStatus(activeRef.current ? "listening" : "idle");
      }
    },
    [current, isPlaying, next, offerTrack, prev, togglePlay],
  );

  const checkPermission = async (): Promise<"granted" | "denied" | "prompt"> => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const perms: any = (navigator as any).permissions;
      if (perms?.query) {
        const res = await perms.query({ name: "microphone" as PermissionName });
        return res.state as "granted" | "denied" | "prompt";
      }
    } catch { /* */ }
    return "prompt";
  };

  const start = useCallback(async () => {
    if (!supported) {
      toast({ title: "Voice assistant unsupported", description: "Try Chrome, Edge or Safari." });
      return;
    }
    const perm = await checkPermission();
    if (perm === "denied") {
      toast({
        title: "Microphone blocked",
        description: "Enable mic access for this site in your browser settings, then try again.",
      });
      return;
    }
    // Prompt the user explicitly so the OS permission dialog is tied to a
    // recent gesture and the assistant can keep listening continuously.
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      s.getTracks().forEach((t) => t.stop());
    } catch {
      toast({ title: "Microphone access required", description: "Allow mic access to use voice commands." });
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
        if (e.results[i].isFinal) handleTranscript(e.results[i][0].transcript);
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    sr.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        toast({ title: "Microphone blocked", description: "Allow mic access for voice commands." });
        setActive(false);
        activeRef.current = false;
        setStatus("idle");
      }
    };
    sr.onend = () => {
      if (activeRef.current) {
        try { sr.start(); } catch { /* */ }
      } else {
        setActive(false);
        setStatus("idle");
      }
    };
    try { sr.start(); } catch { /* */ }
    srRef.current = sr;
    activeRef.current = true;
    setActive(true);
    setStatus("listening");
    toast({
      title: "Voice assistant on",
      description: 'Say "play <song>", add "now" to skip confirmation, or "pause" / "next".',
    });
  }, [handleTranscript, supported]);

  const stop = useCallback(() => {
    activeRef.current = false;
    setActive(false);
    setStatus("idle");
    clearPending();
    try { srRef.current?.stop(); } catch { /* */ }
    srRef.current = null;
  }, [clearPending]);

  useEffect(() => () => stop(), [stop]);

  const statusLabel: Record<Status, string> = {
    idle: "Voice assistant",
    listening: "Listening…",
    searching: "Searching…",
    confirming: "Confirm to play",
    playing: current ? `Playing · ${cleanDisplayTitle(current.title)}` : "Playing",
  };

  return (
    <div className="fixed bottom-28 right-4 z-30 flex flex-col items-end gap-2 pointer-events-none">
      {active && (
        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-card/90 backdrop-blur px-3 py-1.5 text-xs border border-border shadow-elegant">
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              status === "listening" ? "bg-primary animate-pulse" :
              status === "searching" ? "bg-amber-400 animate-pulse" :
              status === "confirming" ? "bg-yellow-500 animate-pulse" :
              status === "playing" ? "bg-emerald-500" : "bg-muted-foreground"
            }`}
          />
          <span className="font-medium max-w-[180px] truncate">{statusLabel[status]}</span>
          {heard && status !== "confirming" && (
            <span className="text-muted-foreground truncate max-w-[120px]">· {heard}</span>
          )}
        </div>
      )}
      {pending && (
        <div className="pointer-events-auto max-w-[260px] rounded-xl bg-card border border-border shadow-2xl p-3 text-sm">
          <p className="text-xs text-muted-foreground">Play this?</p>
          <p className="font-semibold truncate">{pending.track.title}</p>
          {pending.track.artist && (
            <p className="text-xs text-muted-foreground truncate">{pending.track.artist}</p>
          )}
          <div className="mt-2 flex gap-2">
            <Button size="sm" className="h-7 rounded-full gap-1 px-3" onClick={confirmPlay}>
              <Check className="w-3.5 h-3.5" /> Play
            </Button>
            <Button size="sm" variant="outline" className="h-7 rounded-full gap-1 px-3" onClick={cancelPlay}>
              <X className="w-3.5 h-3.5" /> Cancel
            </Button>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Auto-plays in 4s</p>
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
        {status === "searching" ? <Loader2 className="w-5 h-5 animate-spin" /> : active ? <Mic className="w-5 h-5" /> : <Sparkles className="w-5 h-5" />}
        <span className="sr-only">{statusLabel[status]}</span>
      </Button>
    </div>
  );
};

export default VoiceAssistant;
