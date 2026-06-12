import { useState } from "react";
import { usePlayer } from "@/contexts/PlayerContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { X, Trash2, ListMusic, Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "queue" | "recent";

export const QueuePanel = ({ onClose }: { onClose: () => void }) => {
  const { queue, current, history, removeFromQueue, playTrack } = usePlayer();
  const [tab, setTab] = useState<Tab>("queue");

  return (
    <aside className="fixed right-0 top-0 bottom-24 w-full max-w-md glass border-l border-border/50 z-40 flex flex-col animate-slide-in-right">
      <header className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-border/50">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setTab("queue")}
            className={cn(
              "relative px-2 py-2 text-sm font-bold flex items-center gap-1.5 transition-colors",
              tab === "queue" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
            aria-label="Queue tab"
          >
            <ListMusic className="w-4 h-4" />
            Queue
            {tab === "queue" && (
              <span className="absolute -bottom-2 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </button>
          <button
            onClick={() => setTab("recent")}
            className={cn(
              "relative px-2 py-2 text-sm font-bold flex items-center gap-1.5 transition-colors",
              tab === "recent" ? "text-primary" : "text-muted-foreground hover:text-foreground"
            )}
            aria-label="Recently played tab"
          >
            <Clock className="w-4 h-4" />
            Recently played
            {tab === "recent" && (
              <span className="absolute -bottom-2 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="w-4 h-4" />
        </Button>
      </header>

      <div className="flex-1 relative overflow-hidden">
        {/* Sliding track */}
        <div
          className="absolute inset-0 flex w-[200%] transition-transform duration-300 ease-out"
          style={{ transform: tab === "queue" ? "translateX(0%)" : "translateX(-50%)" }}
        >
          {/* Queue panel */}
          <div className="w-1/2 h-full">
            <ScrollArea className="h-full">
              {current && (
                <section className="p-4">
                  <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Now Playing</h3>
                  <div className="flex items-center gap-3 p-2 rounded-lg bg-primary/10">
                    <img src={current.artwork} alt="" className="w-10 h-10 rounded object-cover" />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate text-primary">{current.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{current.artist}</div>
                    </div>
                  </div>
                </section>
              )}
              <section className="p-4 pt-0">
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Up Next ({queue.length})</h3>
                {queue.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">Queue is empty</p>
                ) : (
                  <div className="space-y-1">
                    {queue.map((t) => (
                      <div key={t.id} className="group flex items-center gap-3 p-2 rounded-lg hover:bg-card cursor-pointer">
                        <img src={t.artwork} alt="" className="w-10 h-10 rounded object-cover" onClick={() => playTrack(t, queue)} />
                        <div className="min-w-0 flex-1" onClick={() => playTrack(t, queue)}>
                          <div className="text-sm font-medium truncate">{t.title}</div>
                          <div className="text-xs text-muted-foreground truncate">{t.artist}</div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => removeFromQueue(t.id)} className="h-8 w-8 opacity-0 group-hover:opacity-100">
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </ScrollArea>
          </div>

          {/* Recently played panel */}
          <div className="w-1/2 h-full">
            <ScrollArea className="h-full">
              <section className="p-4">
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Recently played</h3>
                {history.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-4">Nothing played yet.</p>
                ) : (
                  <div className="space-y-1">
                    {history.slice(0, 30).map((t, i) => (
                      <div
                        key={`${t.id}-${i}`}
                        className="flex items-center gap-3 p-2 rounded-lg hover:bg-card cursor-pointer"
                        onClick={() => playTrack(t)}
                      >
                        <img src={t.artwork} alt="" className="w-10 h-10 rounded object-cover" />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm truncate">{t.title}</div>
                          <div className="text-xs text-muted-foreground truncate">{t.artist}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </ScrollArea>
          </div>
        </div>
      </div>
    </aside>
  );
};
