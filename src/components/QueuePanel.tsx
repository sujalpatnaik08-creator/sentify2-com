import { usePlayer } from "@/contexts/PlayerContext";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { X, Trash2 } from "lucide-react";

export const QueuePanel = ({ onClose }: { onClose: () => void }) => {
  const { queue, current, history, removeFromQueue, playTrack } = usePlayer();

  return (
    <aside className="fixed right-0 top-0 bottom-24 w-full max-w-md glass border-l border-border/50 z-40 flex flex-col animate-fade-in">
      <header className="flex items-center justify-between p-4 border-b border-border/50">
        <h2 className="font-bold text-lg">Queue</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close queue">
          <X className="w-4 h-4" />
        </Button>
      </header>
      <ScrollArea className="flex-1">
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
        {history.length > 0 && (
          <section className="p-4 pt-0">
            <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">History</h3>
            <div className="space-y-1">
              {history.slice(0, 10).map((t, i) => (
                <div key={`${t.id}-${i}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-card cursor-pointer" onClick={() => playTrack(t)}>
                  <img src={t.artwork} alt="" className="w-10 h-10 rounded object-cover" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{t.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{t.artist}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </ScrollArea>
    </aside>
  );
};
