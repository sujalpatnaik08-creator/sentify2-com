import { useEffect, useRef, useState } from "react";
import { usePlayer } from "@/contexts/PlayerContext";
import { Play, Pause, SkipBack, SkipForward, X, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";

// Spotify-style floating mini-player — draggable picture-in-picture window.
export const MiniPlayer = ({ onClose }: { onClose: () => void }) => {
  const { current, isPlaying, togglePlay, next, prev, progress, duration } = usePlayer();
  const [pos, setPos] = useState(() => ({
    x: Math.max(16, window.innerWidth - 340),
    y: Math.max(16, window.innerHeight - 220),
  }));
  const dragRef = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const x = Math.min(Math.max(8, e.clientX - dragRef.current.dx), window.innerWidth - 328);
      const y = Math.min(Math.max(8, e.clientY - dragRef.current.dy), window.innerHeight - 140);
      setPos({ x, y });
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startDrag = (e: React.MouseEvent) => {
    dragRef.current = { dx: e.clientX - pos.x, dy: e.clientY - pos.y };
  };

  const pct = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;

  return (
    <div
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[60] w-80 rounded-xl bg-neutral-900/95 backdrop-blur-xl border border-white/10 shadow-2xl text-white animate-scale-in select-none"
    >
      <div
        onMouseDown={startDrag}
        className="flex items-center justify-between px-3 py-1.5 border-b border-white/10 cursor-move"
      >
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/60">
          <GripVertical className="w-3 h-3" /> Mini player
        </div>
        <button
          onClick={onClose}
          aria-label="Close mini player"
          className="w-6 h-6 rounded-full hover:bg-white/10 flex items-center justify-center"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {current ? (
        <div className="p-3 flex items-center gap-3">
          <img
            src={current.artwork}
            alt={current.title}
            className="w-16 h-16 rounded-md object-cover shadow-lg shrink-0"
            onError={(e) => ((e.target as HTMLImageElement).src = "/placeholder.svg")}
          />
          <div className="min-w-0 flex-1">
            <div className="font-semibold text-sm truncate">{current.title}</div>
            <div className="text-xs text-white/60 truncate">{current.artist}</div>
            <div className="mt-2 h-1 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#1DB954] transition-[width] duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 text-sm text-white/60">Nothing playing yet</div>
      )}

      <div className="px-3 pb-3 flex items-center justify-center gap-2">
        <button
          onClick={prev}
          aria-label="Previous"
          className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center"
        >
          <SkipBack className="w-4 h-4 fill-current" />
        </button>
        <button
          onClick={togglePlay}
          disabled={!current}
          aria-label={isPlaying ? "Pause" : "Play"}
          className={cn(
            "w-10 h-10 rounded-full bg-white text-black flex items-center justify-center hover:scale-105 transition-transform",
            !current && "opacity-50",
          )}
        >
          {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
        </button>
        <button
          onClick={next}
          aria-label="Next"
          className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center"
        >
          <SkipForward className="w-4 h-4 fill-current" />
        </button>
      </div>
    </div>
  );
};
