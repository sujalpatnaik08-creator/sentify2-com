import type { Track } from "@/types/music";
import { Play, Pause, Plus } from "lucide-react";
import { usePlayer } from "@/contexts/PlayerContext";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface TrackCardProps {
  track: Track;
  queue: Track[];
}

export const TrackCard = ({ track, queue }: TrackCardProps) => {
  const { current, isPlaying, playTrack, togglePlay, addToQueue } = usePlayer();
  const isCurrent = current?.id === track.id;
  const showPause = isCurrent && isPlaying;

  return (
    <div className="group relative bg-card/40 hover:bg-card/80 rounded-xl p-4 transition-all duration-300 hover:shadow-[var(--shadow-card)] cursor-pointer">
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
        <p className="text-sm text-muted-foreground truncate">{track.artist}</p>
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
};
