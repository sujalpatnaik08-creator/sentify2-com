// Downloads page — manage offline tracks (Audius-only) and play them
// from cached blobs even with no internet connection.

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Trash2, Play, Pause, WifiOff, HardDrive, Search } from "lucide-react";
import {
  listDownloads,
  removeDownload,
  totalDownloadedBytes,
  formatBytes,
  getDownloadedBlob,
  type DownloadedTrackMeta,
} from "@/lib/offline-store";
import { usePlayer } from "@/contexts/PlayerContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Track } from "@/types/music";

const fmt = (s: number) => {
  if (!s || !isFinite(s)) return "--:--";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
};

const Downloads = () => {
  const [items, setItems] = useState<DownloadedTrackMeta[]>([]);
  const [bytes, setBytes] = useState(0);
  const [online, setOnline] = useState(navigator.onLine);
  const { current, isPlaying, playTrack, togglePlay } = usePlayer();

  const refresh = async () => {
    setItems(await listDownloads());
    setBytes(await totalDownloadedBytes());
  };

  useEffect(() => {
    refresh();
    const onOn = () => setOnline(true);
    const onOff = () => setOnline(false);
    window.addEventListener("online", onOn);
    window.addEventListener("offline", onOff);
    return () => {
      window.removeEventListener("online", onOn);
      window.removeEventListener("offline", onOff);
    };
  }, []);

  // Play a downloaded track from its cached blob (works offline).
  const playOffline = async (meta: DownloadedTrackMeta) => {
    if (current?.id === meta.track.id) {
      togglePlay();
      return;
    }
    const blob = await getDownloadedBlob(meta.track.id);
    if (!blob) return;
    const objectUrl = URL.createObjectURL(blob);
    const offlineTrack: Track = { ...meta.track, audioUrl: objectUrl };
    const queue = items.map((m) => m.track);
    playTrack(offlineTrack, queue);
  };

  const onRemove = async (id: string) => {
    await removeDownload(id);
    refresh();
  };

  return (
    <div className="px-6 md:px-10 py-8 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-black mb-1 flex items-center gap-3">
            <Download className="w-8 h-8 text-primary" />
            Downloads
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border",
              online
                ? "bg-primary/15 text-primary border-primary/40"
                : "bg-amber-500/15 text-amber-400 border-amber-500/40"
            )}
          >
            {online ? "Online" : <><WifiOff className="w-3.5 h-3.5" /> Offline mode</>}
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-secondary/60 border border-border">
            <HardDrive className="w-3.5 h-3.5" /> {formatBytes(bytes)} stored
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4 text-muted-foreground">
            <Download className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No downloads yet</h3>
          <p className="text-muted-foreground mb-6 max-w-md">
            On the Search or Library tabs, tap the download icon next to any
            Audius track to save it for offline playback.
          </p>
          <Link to="/search">
            <Button className="gap-2">
              <Search className="w-4 h-4" /> Find music
            </Button>
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/40 bg-card/30">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted-foreground border-b border-border/50 text-left">
                <th className="font-normal py-3 pl-3 pr-2 w-12">#</th>
                <th className="font-normal py-3 px-2">Title</th>
                <th className="font-normal py-3 px-2 hidden md:table-cell">Artist</th>
                <th className="font-normal py-3 px-2 hidden lg:table-cell w-24">Size</th>
                <th className="font-normal py-3 px-2 w-12"></th>
                <th className="font-normal py-3 px-3 w-16 text-right">Time</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m, i) => {
                const isCurrent = current?.id === m.track.id;
                return (
                  <tr
                    key={m.id}
                    className={cn(
                      "group border-b border-border/20 hover:bg-card/60 transition-colors cursor-pointer",
                      isCurrent && "bg-primary/5"
                    )}
                    onDoubleClick={() => playOffline(m)}
                  >
                    <td className="py-2 pl-3 pr-2 text-muted-foreground">
                      <button
                        onClick={() => playOffline(m)}
                        className="w-6 h-6 flex items-center justify-center"
                        aria-label="Play"
                      >
                        <span className={cn("group-hover:hidden", isCurrent && "hidden")}>{i + 1}</span>
                        <span className={cn("hidden group-hover:flex", isCurrent && "flex")}>
                          {isCurrent && isPlaying
                            ? <Pause className="w-4 h-4 fill-current" />
                            : <Play className="w-4 h-4 fill-current" />}
                        </span>
                      </button>
                    </td>
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <img src={m.track.artwork} alt={m.track.title} className="w-10 h-10 rounded object-cover shrink-0"
                          onError={(e) => ((e.target as HTMLImageElement).src = "/placeholder.svg")} />
                        <div className="min-w-0">
                          <div className={cn("truncate font-medium", isCurrent && "text-primary")}>{m.track.title}</div>
                          <div className="md:hidden text-xs text-muted-foreground truncate">{m.track.artist}</div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-muted-foreground hidden md:table-cell truncate max-w-[260px]">{m.track.artist}</td>
                    <td className="py-2 px-2 text-muted-foreground hidden lg:table-cell tabular-nums">{formatBytes(m.size)}</td>
                    <td className="py-2 px-2">
                      <button onClick={() => onRemove(m.id)} className="text-destructive opacity-0 group-hover:opacity-100" aria-label="Remove">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                    <td className="py-2 px-3 text-right text-muted-foreground tabular-nums">{fmt(m.track.duration)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Downloads;
