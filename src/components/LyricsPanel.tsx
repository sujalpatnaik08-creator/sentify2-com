import { usePlayer } from "@/contexts/PlayerContext";
import { useEffect, useState } from "react";
import { fetchLyrics } from "@/lib/music-api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export const LyricsPanel = ({ onClose }: { onClose: () => void }) => {
  const { current } = usePlayer();
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!current) {
      setLyrics(null);
      return;
    }
    setLoading(true);
    fetchLyrics(current.artist, current.title)
      .then((l) => setLyrics(l))
      .finally(() => setLoading(false));
  }, [current]);

  return (
    <aside className="fixed right-0 top-0 bottom-24 w-full max-w-md glass border-l border-border/50 z-40 flex flex-col animate-fade-in">
      <header className="flex items-center justify-between p-4 border-b border-border/50">
        <h2 className="font-bold text-lg">Lyrics</h2>
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
        ) : lyrics ? (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90">{lyrics}</pre>
        ) : (
          <div className="text-center mt-8 space-y-2">
            <p className="text-muted-foreground">No lyrics available</p>
            <p className="text-xs text-muted-foreground">
              Lyrics provided by Lyrics.ovh — many independent tracks aren't indexed.
            </p>
          </div>
        )}
      </ScrollArea>
    </aside>
  );
};
