import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Search as SearchIcon,
  Loader2,
  SearchX,
  RefreshCw,
  AlertCircle,
  Heart,
  Clock,
  Play,
  Pause,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { searchTracks } from "@/lib/music-api";
import type { Track } from "@/types/music";
import { usePlayer } from "@/contexts/PlayerContext";
import { cn } from "@/lib/utils";

const SUGGESTIONS = ["Daylight", "Arijit Singh", "Coldplay", "Lo-fi", "Taylor Swift", "Khuda Jaane"];
const TABS = ["Top Results", "Tracks", "Artists", "Albums"] as const;
type Tab = (typeof TABS)[number];

const fmt = (s: number) => {
  if (!s || !isFinite(s)) return "--:--";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
};

const LIKED_KEY = "sentify_liked";
const getLiked = (): Set<string> => {
  try { return new Set(JSON.parse(localStorage.getItem(LIKED_KEY) || "[]")); } catch { return new Set(); }
};

const Search = () => {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>("Tracks");
  const [liked, setLiked] = useState<Set<string>>(getLiked);

  const { current, isPlaying, playTrack, togglePlay } = usePlayer();

  const runSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await searchTracks(query, 40);
      setResults(data);
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : "Something went wrong while searching.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => runSearch(q), 350);
    return () => clearTimeout(id);
  }, [q, attempt, runSearch]);

  const retry = () => setAttempt((n) => n + 1);

  const toggleLike = (id: string) => {
    setLiked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      localStorage.setItem(LIKED_KEY, JSON.stringify([...next]));
      return next;
    });
  };

  // Derive artists/albums from track results
  const artists = useMemo(() => {
    const map = new Map<string, { name: string; artwork: string; count: number }>();
    for (const t of results) {
      const key = t.artist;
      if (!map.has(key)) map.set(key, { name: key, artwork: t.artwork, count: 0 });
      map.get(key)!.count++;
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [results]);

  const albums = useMemo(() => {
    const map = new Map<string, { name: string; artist: string; artwork: string; count: number }>();
    for (const t of results) {
      const name = t.album?.trim() || t.title;
      const key = `${name}|${t.artist}`;
      if (!map.has(key)) map.set(key, { name, artist: t.artist, artwork: t.artwork, count: 0 });
      map.get(key)!.count++;
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [results]);

  const handleRowPlay = (t: Track) => {
    if (current?.id === t.id) togglePlay();
    else playTrack(t, results);
  };

  const renderTracksTable = (tracks: Track[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b border-border/50 text-left">
            <th className="font-normal py-3 pl-3 pr-2 w-12">#</th>
            <th className="font-normal py-3 px-2">Title</th>
            <th className="font-normal py-3 px-2 hidden md:table-cell">Artist</th>
            <th className="font-normal py-3 px-2 hidden lg:table-cell">Album</th>
            <th className="font-normal py-3 px-2 w-12"></th>
            <th className="font-normal py-3 px-3 w-16 text-right"><Clock className="w-4 h-4 inline" /></th>
          </tr>
        </thead>
        <tbody>
          {tracks.map((t, i) => {
            const isCurrent = current?.id === t.id;
            const isLiked = liked.has(t.id);
            return (
              <tr
                key={t.id}
                onDoubleClick={() => handleRowPlay(t)}
                className={cn(
                  "group border-b border-border/20 hover:bg-card/60 transition-colors cursor-pointer",
                  isCurrent && "bg-primary/5"
                )}
              >
                <td className="py-2 pl-3 pr-2 text-muted-foreground">
                  <div className="relative w-6 h-6 flex items-center justify-center">
                    <span className={cn("group-hover:hidden", isCurrent && "hidden")}>{i + 1}</span>
                    <button
                      onClick={() => handleRowPlay(t)}
                      className={cn(
                        "hidden group-hover:flex items-center justify-center text-foreground",
                        isCurrent && "flex"
                      )}
                      aria-label={isCurrent && isPlaying ? "Pause" : "Play"}
                    >
                      {isCurrent && isPlaying
                        ? <Pause className="w-4 h-4 fill-current" />
                        : <Play className="w-4 h-4 fill-current" />}
                    </button>
                  </div>
                </td>
                <td className="py-2 px-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={t.artwork}
                      alt={t.title}
                      className="w-10 h-10 rounded object-cover shrink-0"
                      onError={(e) => ((e.target as HTMLImageElement).src = "/placeholder.svg")}
                    />
                    <div className="min-w-0">
                      <div className={cn("truncate font-medium", isCurrent && "text-primary")}>{t.title}</div>
                      <div className="md:hidden text-xs text-muted-foreground truncate">{t.artist}</div>
                    </div>
                  </div>
                </td>
                <td className="py-2 px-2 text-muted-foreground hidden md:table-cell truncate max-w-[260px]">{t.artist}</td>
                <td className="py-2 px-2 text-muted-foreground hidden lg:table-cell truncate max-w-[260px]">{t.album || "—"}</td>
                <td className="py-2 px-2">
                  <button
                    onClick={() => toggleLike(t.id)}
                    className={cn(
                      "opacity-0 group-hover:opacity-100 transition-opacity",
                      isLiked && "opacity-100 text-primary"
                    )}
                    aria-label="Like"
                  >
                    <Heart className={cn("w-4 h-4", isLiked && "fill-current")} />
                  </button>
                </td>
                <td className="py-2 px-3 text-right text-muted-foreground tabular-nums">{fmt(t.duration)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const renderArtists = () => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
      {artists.map((a) => {
        const firstTrack = results.find((t) => t.artist === a.name);
        return (
          <button
            key={a.name}
            onClick={() => firstTrack && playTrack(firstTrack, results.filter((t) => t.artist === a.name))}
            className="flex flex-col items-center gap-3 p-4 rounded-lg hover:bg-card/60 transition-colors text-center"
          >
            <img
              src={a.artwork}
              alt={a.name}
              className="w-32 h-32 rounded-full object-cover shadow-lg"
              onError={(e) => ((e.target as HTMLImageElement).src = "/placeholder.svg")}
            />
            <div className="min-w-0 w-full">
              <div className="font-semibold truncate">{a.name}</div>
              <div className="text-xs text-muted-foreground">Artist</div>
            </div>
          </button>
        );
      })}
    </div>
  );

  const renderAlbums = () => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
      {albums.map((al) => {
        const tracks = results.filter((t) => (t.album?.trim() || t.title) === al.name && t.artist === al.artist);
        return (
          <button
            key={`${al.name}-${al.artist}`}
            onClick={() => tracks[0] && playTrack(tracks[0], tracks)}
            className="flex flex-col gap-3 p-3 rounded-lg hover:bg-card/60 transition-colors text-left"
          >
            <img
              src={al.artwork}
              alt={al.name}
              className="w-full aspect-square rounded-md object-cover shadow-lg"
              onError={(e) => ((e.target as HTMLImageElement).src = "/placeholder.svg")}
            />
            <div className="min-w-0">
              <div className="font-semibold truncate">{al.name}</div>
              <div className="text-xs text-muted-foreground truncate">{al.artist}</div>
            </div>
          </button>
        );
      })}
    </div>
  );

  const renderTopResults = () => {
    const top = results[0];
    const list = results.slice(1, 5);
    if (!top) return null;
    return (
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-card/40 rounded-xl p-5 hover:bg-card/70 transition-colors group">
          <div className="text-sm text-muted-foreground mb-3">Top result</div>
          <img
            src={top.artwork}
            alt={top.title}
            className="w-32 h-32 rounded-md object-cover shadow-xl mb-4"
            onError={(e) => ((e.target as HTMLImageElement).src = "/placeholder.svg")}
          />
          <h2 className="text-2xl font-bold truncate">{top.title}</h2>
          <p className="text-muted-foreground truncate mb-4">{top.artist}</p>
          <Button
            onClick={() => handleRowPlay(top)}
            className="rounded-full gap-2"
          >
            {current?.id === top.id && isPlaying
              ? <><Pause className="w-4 h-4 fill-current" /> Pause</>
              : <><Play className="w-4 h-4 fill-current" /> Play</>}
          </Button>
        </div>
        <div>
          <div className="text-sm text-muted-foreground mb-3 px-2">Tracks</div>
          {renderTracksTable(list)}
        </div>
      </div>
    );
  };

  return (
    <div className="px-6 md:px-10 py-8 max-w-7xl mx-auto">
      <div className="relative max-w-2xl mb-6">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search songs, artists, albums…"
          className="pl-12 h-14 text-base rounded-full bg-card border-border/50"
        />
      </div>

      {/* Tabs */}
      {q && results.length > 0 && (
        <div className="flex items-center gap-6 border-b border-border/40 mb-6">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "relative py-3 text-sm font-medium transition-colors",
                tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {t}
              {tab === t && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-primary rounded-full" />}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {!loading && error && q && (
        <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
            <AlertCircle className="w-8 h-8 text-destructive" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Couldn't reach the music service</h3>
          <p className="text-muted-foreground mb-6 max-w-md">{error}</p>
          <Button onClick={retry} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Try again
          </Button>
        </div>
      )}

      {!loading && !error && q && results.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center animate-fade-in">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <SearchX className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No results found</h3>
          <p className="text-muted-foreground mb-6 max-w-md">
            We couldn't find anything for <span className="text-foreground font-medium">"{q}"</span>. Try a different query.
          </p>
          <div className="flex flex-wrap gap-2 justify-center mb-4 max-w-md">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => setQ(s)}
                className="px-3 py-1.5 rounded-full bg-secondary hover:bg-secondary/80 text-sm transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
          <Button variant="outline" onClick={retry} className="gap-2">
            <RefreshCw className="w-4 h-4" /> Retry search
          </Button>
        </div>
      )}

      {!q && (
        <div className="text-center py-12 text-muted-foreground">
          <SearchIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Search for any song, artist, or album</p>
        </div>
      )}

      {!loading && !error && results.length > 0 && (
        <div className="animate-fade-in">
          {tab === "Top Results" && renderTopResults()}
          {tab === "Tracks" && (
            <>
              <h2 className="text-2xl font-bold mb-4">Tracks</h2>
              {renderTracksTable(results)}
            </>
          )}
          {tab === "Artists" && (
            <>
              <h2 className="text-2xl font-bold mb-4">Artists</h2>
              {renderArtists()}
            </>
          )}
          {tab === "Albums" && (
            <>
              <h2 className="text-2xl font-bold mb-4">Albums</h2>
              {renderAlbums()}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Search;
