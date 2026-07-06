import { usePlayer } from "@/contexts/PlayerContext";
import { Slider } from "@/components/ui/slider";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Volume2,
  VolumeX,
  MicVocal,
  ListVideo,
  ChevronUp,
  PictureInPicture2,
  Heart,
  Download,
  Check,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { isLiked, toggleLikedTrack } from "@/lib/user-prefs";
import { isDownloaded, downloadTrack } from "@/lib/offline-store";
import { toast } from "@/hooks/use-toast";


const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

interface PlayerBarProps {
  onToggleLyrics: () => void;
  onToggleQueue: () => void;
  onToggleMini: () => void;
  onOpenNowPlaying: () => void;
  showLyrics: boolean;
  showQueue: boolean;
  showMini: boolean;
}

export const PlayerBar = ({ onToggleLyrics, onToggleQueue, onToggleMini, onOpenNowPlaying, showLyrics, showQueue, showMini }: PlayerBarProps) => {

  const {
    current,
    isPlaying,
    progress,
    duration,
    volume,
    shuffle,
    repeat,
    togglePlay,
    next,
    prev,
    seek,
    setVolume,
    toggleShuffle,
    cycleRepeat,
  } = usePlayer();
  const [muted, setMuted] = useState(false);
  const [liked, setLiked] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const touchStartY = useRef<number | null>(null);

  // Sync like/download state to the current track.
  useEffect(() => {
    if (!current) {
      setLiked(false);
      setDownloaded(false);
      return;
    }
    setLiked(isLiked(current.id));
    isDownloaded(current.id).then(setDownloaded).catch(() => setDownloaded(false));
  }, [current]);

  const onBarTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const onBarTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current == null) return;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (dy < -60 && current) onOpenNowPlaying();
    touchStartY.current = null;
  };

  const onLike = () => {
    if (!current) return;
    const now = toggleLikedTrack(current);
    setLiked(now);
  };

  const onDownload = async () => {
    if (!current || downloading || downloaded) return;
    if (current.source === "youtube") {
      toast({
        title: "Can't download",
        description: "YouTube tracks can only be streamed live.",
        variant: "destructive",
      });
      return;
    }
    setDownloading(true);
    try {
      await downloadTrack(current);
      setDownloaded(true);
      toast({ title: "Saved for offline", description: current.title });
    } catch (e) {
      toast({
        title: "Download failed",
        description: (e as Error).message,
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <footer
      className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border/50 px-4 py-3 transition-all duration-300 animate-fade-in"
      onTouchStart={onBarTouchStart}
      onTouchEnd={onBarTouchEnd}
    >

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_minmax(0,1.5fr)] items-center gap-4">
        {/* Track info + like/download */}
        <div className="flex items-center gap-2 min-w-0">
          {current ? (
            <>
              <button
                type="button"
                onClick={onOpenNowPlaying}
                className="shrink-0 group relative"
                aria-label="Open Now Playing"
                title="Open Now Playing"
              >
                <img
                  src={current.artwork}
                  alt={current.title}
                  className="w-14 h-14 rounded-md object-cover shadow-lg transition-transform group-hover:scale-105"
                  onError={(e) => ((e.target as HTMLImageElement).src = "/placeholder.svg")}
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-md">
                  <ChevronUp className="w-5 h-5 text-white" />
                </span>
              </button>
              <button
                type="button"
                onClick={onOpenNowPlaying}
                className="min-w-0 text-left hover:underline flex-1"
                aria-label="Open Now Playing"
              >
                <div className="font-semibold truncate text-sm">{current.title}</div>
                <div className="text-xs text-muted-foreground truncate">{current.artist}</div>
              </button>
              <div className="flex items-center gap-0.5 shrink-0">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onLike}
                  className="h-8 w-8"
                  aria-label={liked ? "Unlike" : "Like"}
                  title={liked ? "Unlike" : "Like"}
                >
                  <Heart className={cn("w-4 h-4", liked && "fill-primary text-primary")} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onDownload}
                  disabled={downloading || downloaded}
                  className={cn("h-8 w-8", downloaded && "text-primary")}
                  aria-label={downloaded ? "Downloaded" : downloading ? "Downloading" : "Download"}
                  title={downloaded ? "Downloaded" : downloading ? "Downloading…" : "Download"}
                >
                  {downloading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : downloaded ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Pick a track to start listening</div>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={prev} className="h-8 w-8" aria-label="Previous">
              <SkipBack className="w-4 h-4 fill-current" />
            </Button>
            <Button
              onClick={togglePlay}
              disabled={!current}
              className="h-10 w-10 rounded-full bg-foreground text-background hover:bg-foreground hover:scale-105 transition-transform p-0"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={next} className="h-8 w-8" aria-label="Next">
              <SkipForward className="w-4 h-4 fill-current" />
            </Button>
          </div>
          <div className="flex items-center gap-2 w-full max-w-2xl">
            <span className="text-xs text-muted-foreground tabular-nums w-10 text-right shrink-0">{fmt(progress)}</span>
            <Slider
              value={[progress]}
              max={duration || 1}
              step={1}
              onValueChange={(v) => seek(v[0])}
              className="flex-1"
              aria-label="Seek"
            />
            <span className="text-xs text-muted-foreground tabular-nums w-10 shrink-0">{fmt(duration)}</span>
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center justify-end gap-1 flex-wrap">
          {/* Playback order controls (shuffle / repeat / orderly) */}
          <div className="flex items-center gap-0.5 mr-1 pr-2 border-r border-border/50">
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleShuffle}
              className={cn("h-8 w-8", shuffle && "text-primary")}
              aria-label="Shuffle"
              title={shuffle ? "Shuffle: On" : "Shuffle: Off"}
            >
              <Shuffle className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => { if (shuffle) toggleShuffle(); }}
              className={cn("h-8 w-8", !shuffle && repeat === "off" && "text-primary")}
              aria-label="Play in order"
              title="Play in order"
            >
              <ListVideo className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={cycleRepeat}
              className={cn("h-8 w-8", repeat !== "off" && "text-primary")}
              aria-label="Repeat"
              title={repeat === "off" ? "Repeat: Off" : repeat === "all" ? "Repeat: All" : "Repeat: One"}
            >
              {repeat === "one" ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
            </Button>
          </div>

          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleLyrics}
            className={cn("h-8 w-8 transition-colors", showLyrics && "text-primary")}
            aria-label="Lyrics"
            title="Lyrics"
          >
            <MicVocal className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleQueue}
            className={cn("h-8 w-8 transition-colors", showQueue && "text-primary")}
            aria-label="Queue"
            title="Queue"
          >
            <ListVideo className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleMini}
            className={cn("h-8 w-8 transition-colors", showMini && "text-primary")}
            aria-label="Mini player"
            title="Mini player (picture-in-picture)"
          >
            <PictureInPicture2 className="w-4 h-4" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              const m = !muted;
              setMuted(m);
              setVolume(m ? 0 : 0.8);
            }}
            className="h-8 w-8"
            aria-label="Mute"
          >
            {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </Button>
          <Slider
            value={[volume * 100]}
            max={100}
            step={1}
            onValueChange={(v) => {
              setMuted(false);
              setVolume(v[0] / 100);
            }}
            className="w-20 shrink-0"
            aria-label="Volume"
          />
        </div>
      </div>
    </footer>
  );
};
