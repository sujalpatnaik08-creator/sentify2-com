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
  Mic2,
  ListMusic,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useState } from "react";

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

interface PlayerBarProps {
  onToggleLyrics: () => void;
  onToggleQueue: () => void;
  showLyrics: boolean;
  showQueue: boolean;
}

export const PlayerBar = ({ onToggleLyrics, onToggleQueue, showLyrics, showQueue }: PlayerBarProps) => {
  const {
    current,
    isPlaying,
    progress,
    duration,
    volume,
    shuffle,
    repeat,
    crossfadeSec,
    normalize,
    autoplayContinuity,
    togglePlay,
    next,
    prev,
    seek,
    setVolume,
    toggleShuffle,
    cycleRepeat,
    setCrossfade,
    setNormalize,
    setAutoplayContinuity,
  } = usePlayer();
  const [muted, setMuted] = useState(false);

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-50 glass border-t border-border/50 px-4 py-3">
      <div className="grid grid-cols-3 items-center gap-4">
        {/* Track info */}
        <div className="flex items-center gap-3 min-w-0">
          {current ? (
            <>
              <img
                src={current.artwork}
                alt={current.title}
                className="w-14 h-14 rounded-md object-cover shadow-lg"
                onError={(e) => ((e.target as HTMLImageElement).src = "/placeholder.svg")}
              />
              <div className="min-w-0">
                <div className="font-semibold truncate text-sm">{current.title}</div>
                <div className="text-xs text-muted-foreground truncate">{current.artist}</div>
              </div>
            </>
          ) : (
            <div className="text-sm text-muted-foreground">Pick a track to start listening</div>
          )}
        </div>

        {/* Controls */}
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggleShuffle} className={cn("h-8 w-8", shuffle && "text-primary")} aria-label="Shuffle">
              <Shuffle className="w-4 h-4" />
            </Button>
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
            <Button variant="ghost" size="icon" onClick={cycleRepeat} className={cn("h-8 w-8", repeat !== "off" && "text-primary")} aria-label="Repeat">
              {repeat === "one" ? <Repeat1 className="w-4 h-4" /> : <Repeat className="w-4 h-4" />}
            </Button>
          </div>
          <div className="flex items-center gap-2 w-full max-w-xl">
            <span className="text-xs text-muted-foreground tabular-nums w-10 text-right">{fmt(progress)}</span>
            <Slider
              value={[progress]}
              max={duration || 1}
              step={1}
              onValueChange={(v) => seek(v[0])}
              className="flex-1"
              aria-label="Seek"
            />
            <span className="text-xs text-muted-foreground tabular-nums w-10">{fmt(duration)}</span>
          </div>
        </div>

        {/* Right controls */}
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleLyrics}
            className={cn("h-8 w-8", showLyrics && "text-primary")}
            aria-label="Lyrics"
          >
            <Mic2 className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleQueue}
            className={cn("h-8 w-8", showQueue && "text-primary")}
            aria-label="Queue"
          >
            <ListMusic className="w-4 h-4" />
          </Button>

          {/* Spotify-style playback settings: crossfade / normalize / autoplay */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Playback settings">
                <Settings2 className="w-4 h-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              <div className="space-y-4">
                <h4 className="font-semibold text-sm">Playback</h4>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="xf" className="text-xs">Crossfade</Label>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {crossfadeSec === 0 ? "Off" : `${crossfadeSec}s`}
                    </span>
                  </div>
                  <Slider id="xf" value={[crossfadeSec]} min={0} max={12} step={1}
                    onValueChange={(v) => setCrossfade(v[0])} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="norm" className="text-xs">Audio normalization</Label>
                    <p className="text-[10px] text-muted-foreground">~−14 LUFS target</p>
                  </div>
                  <Switch id="norm" checked={normalize} onCheckedChange={setNormalize} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="auto" className="text-xs">Autoplay similar songs</Label>
                    <p className="text-[10px] text-muted-foreground">When the queue ends</p>
                  </div>
                  <Switch id="auto" checked={autoplayContinuity} onCheckedChange={setAutoplayContinuity} />
                </div>
              </div>
            </PopoverContent>
          </Popover>

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
            className="w-24"
            aria-label="Volume"
          />
        </div>
      </div>
    </footer>
  );
};
