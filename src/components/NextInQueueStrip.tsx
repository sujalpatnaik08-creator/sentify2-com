// Compact "Next in queue" strip for the Now Playing view.
// Shows the next queued track (if any) with a "Open queue" affordance.

import { ListMusic } from "lucide-react";
import { usePlayer } from "@/contexts/PlayerContext";
import { cn } from "@/lib/utils";

interface Props {
  onOpenQueue: () => void;
  className?: string;
}

export const NextInQueueStrip = ({ onOpenQueue, className }: Props) => {
  const { current, queue } = usePlayer();
  if (!current) return null;
  const idx = queue.findIndex((t) => t.id === current.id);
  const next = idx >= 0 ? queue[idx + 1] : queue[0];
  if (!next) return null;

  return (
    <div className={cn("rounded-xl bg-card/60 border border-border/50 p-3", className)}>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold inline-flex items-center gap-2">
          <ListMusic className="w-4 h-4 text-primary" /> Next in queue
        </h3>
        <button
          onClick={onOpenQueue}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          Open queue
        </button>
      </div>
      <div className="flex items-center gap-3">
        <img
          src={next.artwork}
          alt=""
          className="w-11 h-11 rounded-md object-cover shrink-0"
          onError={(e) => ((e.target as HTMLImageElement).src = "/placeholder.svg")}
        />
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{next.title}</div>
          <div className="text-xs text-muted-foreground truncate">{next.artist}</div>
        </div>
      </div>
    </div>
  );
};
