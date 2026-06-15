import type { Track } from "@/types/music";
import { Play, Pause, Plus, ThumbsUp, ThumbsDown } from "lucide-react";
import { usePlayer } from "@/contexts/PlayerContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { forwardRef, useEffect, useState } from "react";
import { getVote, setVote } from "@/lib/taste-profile";
import { invalidateTasteCache } from "@/lib/music-api";
import { toast } from "@/hooks/use-toast";
import { AnalysisBadges } from "@/components/AnalysisBadges";
import { useAnalysis } from "@/lib/musicologist";

interface TrackCardProps {
  track: Track;
  queue: Track[];
}

export const TrackCard = forwardRef<HTMLDivElement, TrackCardProps>(({ track, queue }, ref) => {
  const { current, isPlaying, playTrack, togglePlay, addToQueue } = usePlayer();
  const isCurrent = current?.id === track.id;
  const showPause = isCurrent && isPlaying;
  const [vote, setVoteState] = useState<"up" | "down" | null>(() => getVote(track.id));
  const analysis = useAnalysis(track.id);



  useEffect(() => {
    const onChange = () => setVoteState(getVote(track.id));
    window.addEventListener("sentify:taste-changed", onChange);
    return () => window.removeEventListener("sentify:taste-changed", onChange);
  }, [track.id]);

  const cast = (e: React.MouseEvent, v: "up" | "down") => {
    e.stopPropagation();
    const next = vote === v ? null : v;
    setVote(track, next);
    setVoteState(next);
    invalidateTasteCache();
    toast({
      title: next === "up" ? "Thanks — more like this" : next === "down" ? "Got it — fewer like this" : "Reset",
      description: next ? "Recommendations will adapt." : undefined,
    });
  };

  return (
    <div ref={ref} className="group relative bg-card/40 hover:bg-card/80 rounded-xl p-4 transition-all duration-300 hover:shadow-[var(--shadow-card)] cursor-pointer">
      <div className="relative aspect-square mb-3 rounded-lg overflow-hidden bg-muted">
        <img
          src={track.artwork}
          alt={`${track.title} artwork`}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => ((e.target as HTMLImageElement).src = "/placeholder.svg")}
        />
        <button
          onClick={() => (isCurrent ? togglePlay() : playTrack(track, queue))}
          className={cn(
            "absolute bottom-2 right-2 w-12 h-12 rounded-full bg-primary text-primary-foreground",
            "flex items-center justify-center shadow-lg transition-all duration-300",
            "opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 hover:scale-110",
            isCurrent && "opacity-100 translate-y-0",
          )}
          aria-label={showPause ? "Pause" : "Play"}
        >
          {showPause ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
        </button>
      </div>
      <div className="space-y-1">
        <h3 className={cn("font-semibold truncate", isCurrent && "text-primary")}>{track.title}</h3>
        {analysis && <AnalysisBadges analysis={analysis} compact className="mt-1" />}
      </div>

      {/* Taste profile thumbs */}
      <div className="absolute top-2 left-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => cast(e, "up")}
          className={cn("h-7 w-7 rounded-full bg-background/70 backdrop-blur", vote === "up" && "text-primary bg-primary/15")}
          aria-label="Thumbs up"
          title="More like this"
        >
          <ThumbsUp className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={(e) => cast(e, "down")}
          className={cn("h-7 w-7 rounded-full bg-background/70 backdrop-blur", vote === "down" && "text-destructive bg-destructive/15")}
          aria-label="Thumbs down"
          title="Fewer like this"
        >
          <ThumbsDown className="w-3.5 h-3.5" />
        </Button>
      </div>

      <Button
        variant="ghost"
        size="icon"
        onClick={(e) => {
          e.stopPropagation();
          addToQueue(track);
        }}
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 h-8 w-8"
        aria-label="Add to queue"
      >
        <Plus className="w-4 h-4" />
      </Button>
    </div>
  );
});
TrackCard.displayName = "TrackCard";
