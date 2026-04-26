import { usePlayer } from "@/contexts/PlayerContext";
import { useEffect, useRef, useState } from "react";
import { fetchLyrics, type LyricLine } from "@/lib/music-api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, X, Crosshair, AlignLeft, ListMusic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Mode = "synced" | "plain";
type Status = "idle" | "loading" | "synced" | "plain" | "none" | "error";

export const LyricsPanel = ({ onClose }: { onClose: () => void }) => {
  const { current, progress, duration, seek } = usePlayer();
  const [plain, setPlain] = useState<string | null>(null);
  const [synced, setSynced] = useState<LyricLine[] | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [mode, setMode] = useState<Mode>("synced");
  const [autoScroll, setAutoScroll] = useState(true);

  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);

  // Fetch lyrics when track changes
  useEffect(() => {
    if (!current) {
      setPlain(null);
      setSynced(null);
      setStatus("idle");
      return;
    }
    let cancelled = false;
    setStatus("loading");
    setPlain(null);
    setSynced(null);
    fetchLyrics(current.artist, current.title, duration || current.duration)
      .then((res) => {
        if (cancelled) return;
        setPlain(res.plain);
        setSynced(res.synced);
        if (res.synced && res.synced.length > 0) {
          setStatus("synced");
          setMode("synced");
        } else if (res.plain) {
          setStatus("plain");
          setMode("plain");
        } else {
          setStatus("none");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [current, duration]);

  const activeIdx = (() => {
    if (!synced || synced.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < synced.length; i++) {
      if (synced[i].time <= progress + 0.05) idx = i;
      else break;
    }
    return idx;
  })();

  const scrollToActive = (smooth = true) => {
    activeLineRef.current?.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
      block: "center",
    });
  };

  useEffect(() => {
    if (autoScroll && mode === "synced" && activeIdx >= 0) {
      scrollToActive(true);
    }
  }, [activeIdx, autoScroll, mode]);

  const hasSynced = !!synced && synced.length > 0;
  const hasPlain = !!plain;
  const canToggle = hasSynced && hasPlain;

  const statusLabel = (() => {
    switch (status) {
      case "idle":
        return "Ready";
      case "loading":
        return "Looking up lyrics…";
      case "synced":
        return `Synced • ${synced?.length ?? 0} lines`;
      case "plain":
        return "Plain text";
      case "none":
        return "No lyrics found";
      case "error":
        return "Lookup failed";
    }
  })();

  const onLineClick = (time: number) => {
    if (isFinite(time) && time >= 0) seek(time);
  };

  return (
    <aside className="fixed right-0 top-0 bottom-24 w-full max-w-md glass border-l border-border/50 z-40 flex flex-col animate-fade-in">
      <header className="flex items-center justify-between p-4 border-b border-border/50">
        <div className="min-w-0">
          <h2 className="font-bold text-lg leading-tight">Lyrics</h2>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
            {status === "loading" && <Loader2 className="w-3 h-3 animate-spin" />}
            <span className="truncate">{statusLabel}</span>
            {current && (
              <span className="truncate opacity-70">
                · {current.title}
              </span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close lyrics">
          <X className="w-4 h-4" />
        </Button>
      </header>

      {/* Controls */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50">
        <div className="inline-flex rounded-md border border-border/60 overflow-hidden">
          <button
            disabled={!hasSynced}
            onClick={() => setMode("synced")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors",
              mode === "synced" && hasSynced
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground",
            )}
            aria-label="Show synced lyrics"
          >
            <ListMusic className="w-3.5 h-3.5" /> Synced
          </button>
          <button
            disabled={!hasPlain && !hasSynced}
            onClick={() => setMode("plain")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors border-l border-border/60",
              mode === "plain"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground",
            )}
            aria-label="Show unsynced lyrics"
          >
            <AlignLeft className="w-3.5 h-3.5" /> Plain
          </button>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setAutoScroll(true);
            scrollToActive(true);
          }}
          disabled={mode !== "synced" || activeIdx < 0}
          className="h-7 px-2 text-xs gap-1.5"
          aria-label="Jump to current line"
        >
          <Crosshair className="w-3.5 h-3.5" /> Jump
        </Button>

        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="accent-primary"
          />
          Auto-scroll
        </label>
      </div>

      <ScrollArea className="flex-1 p-6" ref={scrollAreaRef as never}>
        {!current ? (
          <p className="text-muted-foreground text-center mt-8">Play a track to see lyrics</p>
        ) : status === "loading" ? (
          <div className="flex flex-col items-center justify-center mt-8 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Fetching lyrics for this track…</p>
          </div>
        ) : status === "error" ? (
          <div className="text-center mt-8 space-y-1">
            <p className="text-muted-foreground">Couldn't load lyrics</p>
            <p className="text-xs text-muted-foreground">Please try another track or retry shortly.</p>
          </div>
        ) : mode === "synced" && hasSynced ? (
          <div className="space-y-3 pb-12">
            {synced!.map((line, i) => (
              <div
                key={i}
                ref={i === activeIdx ? activeLineRef : null}
                onClick={() => onLineClick(line.time)}
                onWheel={() => setAutoScroll(false)}
                role="button"
                tabIndex={0}
                className={cn(
                  "transition-all duration-300 leading-relaxed cursor-pointer rounded px-1",
                  i === activeIdx
                    ? "text-primary font-semibold text-lg scale-[1.02]"
                    : i < activeIdx
                      ? "text-muted-foreground/60 text-base hover:text-foreground"
                      : "text-foreground/70 text-base hover:text-foreground",
                )}
              >
                {line.text || "♪"}
              </div>
            ))}
          </div>
        ) : mode === "plain" && hasPlain ? (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90">
            {plain}
          </pre>
        ) : mode === "plain" && hasSynced ? (
          // Render synced as plain when user toggled but no plain text exists
          <div className="space-y-2 text-foreground/85 text-sm leading-relaxed">
            {synced!.map((l, i) => (
              <div key={i}>{l.text || "♪"}</div>
            ))}
          </div>
        ) : (
          <div className="text-center mt-8 space-y-2">
            <p className="text-muted-foreground">No lyrics available</p>
            <p className="text-xs text-muted-foreground">
              We couldn't find lyrics for this track.
            </p>
          </div>
        )}
      </ScrollArea>
    </aside>
  );
};
