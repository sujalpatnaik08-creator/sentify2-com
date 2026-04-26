import { usePlayer } from "@/contexts/PlayerContext";
import { useEffect, useRef, useState } from "react";
import { fetchLyrics, type LyricLine } from "@/lib/music-api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const LyricsPanel = ({ onClose }: { onClose: () => void }) => {
  const { current, progress, duration } = usePlayer();
  const [plain, setPlain] = useState<string | null>(null);
  const [synced, setSynced] = useState<LyricLine[] | null>(null);
  const [loading, setLoading] = useState(false);
  const activeLineRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!current) {
      setPlain(null);
      setSynced(null);
      return;
    }
    setLoading(true);
    setPlain(null);
    setSynced(null);
    fetchLyrics(current.artist, current.title, duration || current.duration)
      .then((res) => {
        setPlain(res.plain);
        setSynced(res.synced);
      })
      .finally(() => setLoading(false));
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

  useEffect(() => {
    if (activeIdx >= 0 && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIdx]);

  return (
    <aside className="fixed right-0 top-0 bottom-24 w-full max-w-md glass border-l border-border/50 z-40 flex flex-col animate-fade-in">
      <header className="flex items-center justify-between p-4 border-b border-border/50">
        <div>
          <h2 className="font-bold text-lg">Lyrics</h2>
          {synced && <p className="text-xs text-muted-foreground">Synced</p>}
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close lyrics">
          <X className="w-4 h-4" />
        </Button>
      </header>
      <ScrollArea className="flex-1 p-6">
        {!current ? (
          <p className="text-muted-foreground text-center mt-8">Play a track to see lyrics</p>
        ) : loading ? (
          <div className="flex items-center justify-center mt-8">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : synced && synced.length > 0 ? (
          <div className="space-y-3 pb-12">
            {synced.map((line, i) => (
              <div
                key={i}
                ref={i === activeIdx ? activeLineRef : null}
                className={cn(
                  "transition-all duration-300 leading-relaxed",
                  i === activeIdx
                    ? "text-primary font-semibold text-lg scale-105"
                    : i < activeIdx
                      ? "text-muted-foreground/60 text-base"
                      : "text-foreground/70 text-base",
                )}
              >
                {line.text || "♪"}
              </div>
            ))}
          </div>
        ) : plain ? (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90">{plain}</pre>
        ) : (
          <div className="text-center mt-8 space-y-2">
            <p className="text-muted-foreground">No lyrics available</p>
            <p className="text-xs text-muted-foreground">
              We couldn't find synced lyrics for this track.
            </p>
          </div>
        )}
      </ScrollArea>
    </aside>
  );
};
