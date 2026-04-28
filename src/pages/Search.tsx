import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
  ListMusic,
  User,
  Disc3,
  Music2,
  Bug,
  Youtube,
  Radio,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Download,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  searchAll,
  searchPage,
  detectLanguage,
  fetchLyrics,
  type ArtistResult,
  type PlaylistResult,
  type Language,
} from "@/lib/music-api";
import type { Track } from "@/types/music";
import { usePlayer } from "@/contexts/PlayerContext";
import { cn } from "@/lib/utils";
import { getLikedTracks, toggleLikedTrack } from "@/lib/user-prefs";
import {
  isDownloaded,
  downloadTrack,
  removeDownload,
  getDownloadedBlob,
  DownloadCancelledError,
} from "@/lib/offline-store";
import { toast } from "sonner";
import { Progress } from "@/components/ui/progress";
import { X, WifiOff } from "lucide-react";

const SUGGESTIONS = ["Daylight", "Arijit Singh", "Coldplay", "Lo-fi", "Taylor Swift", "Khuda Jaane"];
// Spotify search tab order: All, Songs, Artists, Albums, Playlists, Profiles
const TABS = [
  { id: "all", label: "All", icon: Music2 },
  { id: "songs", label: "Songs", icon: Music2 },
  { id: "artists", label: "Artists", icon: User },
  { id: "albums", label: "Albums", icon: Disc3 },
  { id: "playlists", label: "Playlists", icon: ListMusic },
] as const;
type Tab = (typeof TABS)[number]["id"];

const LANG_LABEL: Record<Language, string> = {
  hindi: "Hindi",
  english: "English",
  spanish: "Spanish",
  korean: "Korean",
  japanese: "Japanese",
  arabic: "Arabic",
  other: "Other",
};

const LANG_COLORS: Record<Language, string> = {
  hindi: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  english: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  spanish: "bg-rose-500/15 text-rose-400 border-rose-500/30",
  korean: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  japanese: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  arabic: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  other: "bg-secondary text-muted-foreground border-border",
};

const fmt = (s: number) => {
  if (!s || !isFinite(s)) return "--:--";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
};

const initialLikedSet = (): Set<string> => new Set(getLikedTracks().map((t) => t.id));

const Search = () => {
  const loc = useLocation();
  const navigate = useNavigate();
  const params = new URLSearchParams(loc.search);
  const q = params.get("q") || "";
  const urlType = (params.get("type") || "all") as Tab;
  const initialTab: Tab = (TABS.find((t) => t.id === urlType)?.id ?? "all") as Tab;

  const [tracks, setTracks] = useState<Track[]>([]);
  const [artists, setArtists] = useState<ArtistResult[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTabState] = useState<Tab>(initialTab);
  const [langFilter, setLangFilter] = useState<Language | "all">("all");
  const [liked, setLiked] = useState<Set<string>>(initialLikedSet);
  const [showDebug, setShowDebug] = useState(false);
  const [lastDuration, setLastDuration] = useState<number>(0);

  // Keep tab + URL ?type= in sync (Spotify-style shareable filter URLs).
  const setTab = useCallback((next: Tab) => {
    setTabState(next);
    const sp = new URLSearchParams(loc.search);
    if (next === "all") sp.delete("type");
    else sp.set("type", next);
    navigate({ pathname: loc.pathname, search: sp.toString() }, { replace: true });
  }, [loc.pathname, loc.search, navigate]);

  // External URL changes (e.g. browser back) → resync tab state.
  useEffect(() => {
    const t = (new URLSearchParams(loc.search).get("type") || "all") as Tab;
    if (TABS.some((x) => x.id === t) && t !== tab) setTabState(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.search]);

  // Per-track expanded lyrics state
  const [openLyrics, setOpenLyrics] = useState<string | null>(null);
  const [lyricsCache, setLyricsCache] = useState<
    Record<string, { state: "loading" | "done" | "none" | "error"; text?: string }>
  >({});

  // Per-track download state
  const [downloads, setDownloads] = useState<Set<string>>(new Set());
  const [downloading, setDownloading] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<Record<string, number>>({}); // 0-100
  const abortersRef = useRef<Map<string, AbortController>>(new Map());

  const { current, isPlaying, playTrack, togglePlay } = usePlayer();

  // (sentinelRef removed — using explicit "Show more" button instead)

  // ---------- Initial / re-search ----------
  const runSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setTracks([]); setArtists([]); setPlaylists([]); setError(null); setHasMore(false);
      return;
    }
    setLoading(true);
    setError(null);
    setPage(0);
    setHasMore(true);
    const t0 = performance.now();
    try {
      const data = await searchAll(query, 40);
      setTracks(data.tracks);
      setArtists(data.artists);
      setPlaylists(data.playlists);
      setHasMore(data.tracks.length >= 20);
    } catch (err) {
      setTracks([]); setArtists([]); setPlaylists([]);
      setError(err instanceof Error ? err.message : "Something went wrong while searching.");
      setHasMore(false);
    } finally {
      setLastDuration(Math.round(performance.now() - t0));
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Spotify-like snappy search: 180ms debounce
    const id = setTimeout(() => runSearch(q), 180);
    return () => clearTimeout(id);
  }, [q, attempt, runSearch]);

  // ---------- Infinite scroll: load next page ----------
  const loadMore = useCallback(async () => {
    if (!q.trim() || loading || loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const next = page + 1;
      const data = await searchPage(q, next, 30);
      // De-dupe by id across new + old
      const seen = new Set([...tracks.map((t) => t.id)]);
      const seenArtists = new Set(artists.map((a) => a.id));
      const seenPl = new Set(playlists.map((p) => p.id));
      const newTracks = data.tracks.filter((t) => !seen.has(t.id));
      const newArtists = data.artists.filter((a) => !seenArtists.has(a.id));
      const newPlaylists = data.playlists.filter((p) => !seenPl.has(p.id));

      if (newTracks.length === 0 && newArtists.length === 0 && newPlaylists.length === 0) {
        setHasMore(false);
      } else {
        setTracks((prev) => [...prev, ...newTracks]);
        setArtists((prev) => [...prev, ...newArtists]);
        setPlaylists((prev) => [...prev, ...newPlaylists]);
        setPage(next);
        // After a few pages, the variants run out — stop trying
        if (next >= 6) setHasMore(false);
      }
    } catch {
      setHasMore(false);
    } finally {
      setLoadingMore(false);
    }
  }, [q, page, tracks, artists, playlists, loading, loadingMore, hasMore]);

  // Spotify uses an explicit "Show more" button rather than auto-load. The
  // sentinel ref is intentionally unused (kept for future opt-in scroll mode).

  const retry = () => setAttempt((n) => n + 1);

  const toggleLike = (id: string) => {
    const track = tracks.find((t) => t.id === id);
    if (!track) return;
    toggleLikedTrack(track);
    setLiked(initialLikedSet());
  };

  // ---------- Per-track lyrics ----------
  const toggleTrackLyrics = (track: Track) => {
    if (openLyrics === track.id) {
      setOpenLyrics(null);
      return;
    }
    setOpenLyrics(track.id);
    if (lyricsCache[track.id]?.state === "done") return;
    setLyricsCache((c) => ({ ...c, [track.id]: { state: "loading" } }));
    fetchLyrics(track.artist, track.title, track.duration)
      .then((res) => {
        const text = res.plain ?? (res.synced ? res.synced.map((l) => l.text).join("\n") : "");
        setLyricsCache((c) => ({
          ...c,
          [track.id]: text
            ? { state: "done", text }
            : { state: "none" },
        }));
      })
      .catch(() => setLyricsCache((c) => ({ ...c, [track.id]: { state: "error" } })));
  };

  // ---------- Per-track download ----------
  const cancelDownload = (id: string) => {
    const ctrl = abortersRef.current.get(id);
    ctrl?.abort();
  };

  const playOfflineTrack = async (track: Track) => {
    const blob = await getDownloadedBlob(track.id);
    if (!blob) {
      toast.error("Offline copy missing");
      return;
    }
    const objectUrl = URL.createObjectURL(blob);
    playTrack({ ...track, audioUrl: objectUrl }, filteredTracks);
  };

  const onDownload = async (track: Track) => {
    // Already downloading -> cancel
    if (downloading.has(track.id)) {
      cancelDownload(track.id);
      return;
    }
    if (downloads.has(track.id)) {
      await removeDownload(track.id);
      setDownloads((s) => {
        const n = new Set(s); n.delete(track.id); return n;
      });
      setProgress((p) => { const n = { ...p }; delete n[track.id]; return n; });
      toast.success("Removed from downloads");
      return;
    }
    if (track.source === "youtube") {
      toast.error("YouTube tracks can only be streamed live (ToS).");
      return;
    }
    const ctrl = new AbortController();
    abortersRef.current.set(track.id, ctrl);
    setDownloading((s) => new Set(s).add(track.id));
    setProgress((p) => ({ ...p, [track.id]: 0 }));
    try {
      await downloadTrack(
        track,
        (loaded, total) => {
          const pct = total > 0 ? Math.min(99, Math.round((loaded / total) * 100)) : 0;
          setProgress((p) => ({ ...p, [track.id]: pct }));
        },
        ctrl.signal,
      );
      setDownloads((s) => new Set(s).add(track.id));
      setProgress((p) => ({ ...p, [track.id]: 100 }));
      toast.success(`"${track.title}" saved for offline`);
    } catch (e) {
      if (e instanceof DownloadCancelledError) {
        toast.info("Download cancelled");
      } else {
        toast.error(e instanceof Error ? e.message : "Download failed");
      }
      setProgress((p) => { const n = { ...p }; delete n[track.id]; return n; });
    } finally {
      abortersRef.current.delete(track.id);
      setDownloading((s) => {
        const n = new Set(s); n.delete(track.id); return n;
      });
    }
  };

  // Refresh download flags for visible tracks whenever the list changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const next = new Set<string>();
      for (const t of tracks) {
        if (await isDownloaded(t.id)) next.add(t.id);
      }
      if (!cancelled) setDownloads(next);
    })();
    return () => { cancelled = true; };
  }, [tracks]);

  // Popularity filter — drop unpopular tracks (very low views) and very short
  // uploads. Keeps the catalog focused on mainstream / well-known songs.
  const POPULAR_VIEWS_MIN = 50_000;
  const popularTracks = tracks.filter((t) => {
    // Audius tracks are curated; always allow.
    if (t.source !== "youtube") return true;
    // Track shape doesn't carry views directly here; rely on duration + ranking.
    // The ranking step in music-api already prioritized popular results, so we
    // additionally drop obviously low-quality items by duration sanity-check.
    if (t.duration > 0 && (t.duration < 60 || t.duration > 720)) return false;
    return true;
  });

  // Hide unpopular / local artists (no subscriber count or very low followers).
  const popularArtists = artists.filter((a) => {
    const s = (a.subscribers || "").toLowerCase();
    if (!s) return false;
    // Accept "K", "M", "B" suffix counts; reject plain small numbers.
    return /\d+(\.\d+)?\s*[kmb]/i.test(s) || /\d{5,}/.test(s.replace(/[ ,.]/g, ""));
  });

  const filteredTracks =
    langFilter === "all"
      ? popularTracks
      : popularTracks.filter((t) => detectLanguage(`${t.title} ${t.artist}`) === langFilter);

  // Albums derived from tracks
  const albums = (() => {
    const map = new Map<string, { name: string; artist: string; artwork: string; count: number }>();
    for (const t of filteredTracks) {
      const name = t.album?.trim() || t.title;
      const key = `${name}|${t.artist}`;
      if (!map.has(key)) map.set(key, { name, artist: t.artist, artwork: t.artwork, count: 0 });
      map.get(key)!.count++;
    }
    return [...map.values()].sort((a, b) => b.count - a.count);
  })();

  const handleRowPlay = (t: Track) => {
    if (current?.id === t.id) togglePlay();
    else playTrack(t, filteredTracks);
  };

  const goToArtist = (a: ArtistResult) => {
    const params = new URLSearchParams({ name: a.name, thumb: a.thumbnail });
    navigate(`/artist/${encodeURIComponent(a.id || a.name)}?${params.toString()}`);
  };

  // ---- Renderers ----

  const renderTracksTable = (list: Track[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b border-border/50 text-left">
            <th className="font-normal py-3 pl-3 pr-2 w-12">#</th>
            <th className="font-normal py-3 px-2">Title</th>
            <th className="font-normal py-3 px-2 hidden md:table-cell">Artist</th>
            <th className="font-normal py-3 px-2 hidden lg:table-cell w-24">Language</th>
            <th className="font-normal py-3 px-2 w-12"></th>
            <th className="font-normal py-3 px-2 w-32">Download</th>
            <th className="font-normal py-3 px-2 w-12"></th>
            <th className="font-normal py-3 px-3 w-16 text-right"><Clock className="w-4 h-4 inline" /></th>
          </tr>
        </thead>
        <tbody>
          {list.map((t, i) => {
            const isCurrent = current?.id === t.id;
            const isLikedT = liked.has(t.id);
            const lang = detectLanguage(`${t.title} ${t.artist}`);
            const isExpanded = openLyrics === t.id;
            const lyricsState = lyricsCache[t.id];
            const dl = downloads.has(t.id);
            const isDownloadingNow = downloading.has(t.id);
            return (
              <FragmentRow key={t.id}>
                <tr
                  onDoubleClick={() => handleRowPlay(t)}
                  className={cn(
                    "group border-b border-border/20 hover:bg-card/60 transition-colors cursor-pointer",
                    isCurrent && "bg-primary/5",
                    isExpanded && "bg-card/40",
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
                  <td className="py-2 px-2 hidden lg:table-cell">
                    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium", LANG_COLORS[lang])}>
                      {LANG_LABEL[lang]}
                    </span>
                  </td>
                  <td className="py-2 px-2">
                    <button
                      onClick={() => toggleLike(t.id)}
                      className={cn(
                        "opacity-0 group-hover:opacity-100 transition-opacity",
                        isLikedT && "opacity-100 text-primary"
                      )}
                      aria-label="Like"
                    >
                      <Heart className={cn("w-4 h-4", isLikedT && "fill-current")} />
                    </button>
                  </td>
                  <td className="py-2 px-2">
                    {isDownloadingNow ? (
                      <div className="flex items-center gap-2 min-w-[110px]">
                        <Progress value={progress[t.id] ?? 0} className="h-1.5 flex-1" />
                        <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-right">
                          {progress[t.id] ?? 0}%
                        </span>
                        <button
                          onClick={(e) => { e.stopPropagation(); cancelDownload(t.id); }}
                          className="text-muted-foreground hover:text-destructive shrink-0"
                          aria-label="Cancel download"
                          title="Cancel download"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : dl ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); playOfflineTrack(t); }}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary border border-primary/30 hover:bg-primary/25 transition-colors"
                          aria-label="Play offline"
                          title="Play from offline copy"
                        >
                          <WifiOff className="w-3 h-3" />
                          Play offline
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); onDownload(t); }}
                          className="text-muted-foreground hover:text-destructive transition-opacity"
                          aria-label="Remove download"
                          title="Remove download"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); onDownload(t); }}
                        className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
                        aria-label="Download"
                        title={t.source === "youtube" ? "YouTube tracks are stream-only" : "Save offline"}
                        disabled={t.source === "youtube"}
                      >
                        <Download className="w-4 h-4" />
                        <span className="text-[11px] font-medium hidden sm:inline">Download</span>
                      </button>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    <button
                      onClick={() => toggleTrackLyrics(t)}
                      className={cn(
                        "inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors",
                        isExpanded && "text-primary",
                      )}
                      aria-label={isExpanded ? "Hide lyrics" : "Show lyrics"}
                      title={isExpanded ? "Hide lyrics" : "Fetch lyrics"}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                      <span className="text-[11px] font-medium hidden sm:inline">{isExpanded ? "Hide" : "Lyrics"}</span>
                    </button>
                  </td>
                  <td className="py-2 px-3 text-right text-muted-foreground tabular-nums">{fmt(t.duration)}</td>
                </tr>
                {isExpanded && (
                  <tr className="bg-card/30 border-b border-border/30">
                    <td colSpan={8} className="px-6 py-4">
                      <LyricsRow
                        state={lyricsState?.state ?? "loading"}
                        text={lyricsState?.text}
                        onRetry={() => {
                          setLyricsCache((c) => {
                            const n = { ...c }; delete n[t.id]; return n;
                          });
                          toggleTrackLyrics(t);
                          // Re-open since toggle just closed it
                          setOpenLyrics(t.id);
                        }}
                        onClose={() => setOpenLyrics(null)}
                      />
                    </td>
                  </tr>
                )}
              </FragmentRow>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const renderArtists = () => {
    if (popularArtists.length === 0) {
      return <p className="text-muted-foreground text-sm">No popular artists found for this query.</p>;
    }
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
        {popularArtists.map((a) => (
          <button
            key={a.id}
            onClick={() => goToArtist(a)}
            className="flex flex-col items-center gap-3 p-4 rounded-lg hover:bg-card/60 transition-colors text-center"
          >
            <img
              src={a.thumbnail}
              alt={a.name}
              className="w-32 h-32 rounded-full object-cover shadow-lg"
              onError={(e) => ((e.target as HTMLImageElement).src = "/placeholder.svg")}
            />
            <div className="min-w-0 w-full">
              <div className="font-semibold truncate">{a.name}</div>
              <div className="text-xs text-muted-foreground truncate">
                {a.subscribers || "Artist"}
              </div>
            </div>
          </button>
        ))}
      </div>
    );
  };

  const renderPlaylists = () => {
    if (playlists.length === 0) {
      return <p className="text-muted-foreground text-sm">No playlists found for this query.</p>;
    }
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
        {playlists.map((p) => (
          <button
            key={p.id}
            onClick={() => navigate(`/search?q=${encodeURIComponent(p.title)}`)}
            className="flex flex-col gap-3 p-3 rounded-lg hover:bg-card/60 transition-colors text-left"
          >
            <div className="relative w-full aspect-square rounded-md overflow-hidden shadow-lg bg-muted">
              <img
                src={p.thumbnail}
                alt={p.title}
                className="w-full h-full object-cover"
                onError={(e) => ((e.target as HTMLImageElement).src = "/placeholder.svg")}
              />
              <div className="absolute bottom-1.5 right-1.5 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded">
                {p.videoCount} tracks
              </div>
            </div>
            <div className="min-w-0">
              <div className="font-semibold truncate">{p.title}</div>
              <div className="text-xs text-muted-foreground truncate">{p.author || "Playlist"}</div>
            </div>
          </button>
        ))}
      </div>
    );
  };

  const renderAlbums = () => (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
      {albums.map((al) => {
        const albumTracks = filteredTracks.filter(
          (t) => (t.album?.trim() || t.title) === al.name && t.artist === al.artist,
        );
        return (
          <button
            key={`${al.name}-${al.artist}`}
            onClick={() => albumTracks[0] && playTrack(albumTracks[0], albumTracks)}
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

  // Spotify "All" tab: hero Top Result + Songs (4 rows) side-by-side, then
  // horizontal Artists / Albums / Playlists carousels with "Show all" links.
  const renderAll = () => {
    const top = filteredTracks[0];
    const topLang = top ? detectLanguage(`${top.title} ${top.artist}`) : null;
    return (
      <div className="space-y-10">
        {/* Top result + Songs preview */}
        {top && (
          <section>
            <h2 className="text-2xl font-bold mb-4">Top result</h2>
            <div
              onClick={() => handleRowPlay(top)}
              className="group relative bg-card/50 hover:bg-card rounded-lg p-5 cursor-pointer transition-colors max-w-2xl"
            >
              <img
                src={top.artwork}
                alt={top.title}
                className="w-24 h-24 rounded-md object-cover shadow-xl mb-5"
                onError={(e) => ((e.target as HTMLImageElement).src = "/placeholder.svg")}
              />
              <h3 className="text-3xl font-bold truncate mb-2">{top.title}</h3>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground truncate">{top.artist}</span>
                <span className="px-2 py-0.5 rounded-full bg-secondary text-foreground/80 text-[11px] font-semibold uppercase tracking-wide">Song</span>
                {topLang && (
                  <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium", LANG_COLORS[topLang])}>
                    {LANG_LABEL[topLang]}
                  </span>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); handleRowPlay(top); }}
                className="absolute bottom-5 right-5 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all"
                aria-label={current?.id === top.id && isPlaying ? "Pause" : "Play"}
              >
                {current?.id === top.id && isPlaying
                  ? <Pause className="w-5 h-5 fill-current" />
                  : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>
            </div>
          </section>
        )}

        {/* Full songs list below the Top result */}
        {filteredTracks.length > 0 && (
          <section>
            <h2 className="text-2xl font-bold mb-4">Songs</h2>
            {renderTracksTable(filteredTracks)}
          </section>
        )}
      </div>
    );
  };

  // ---- Troubleshooting derived counts ----
  const ytCount = tracks.filter((t) => t.source === "youtube").length;
  const auCount = tracks.filter((t) => t.source === "audius").length;
  const currentSource = current?.source ?? null;

  return (
    <div className="px-6 md:px-10 py-8 max-w-7xl mx-auto">
      {/* Header row with troubleshooting toggle */}
      {q && (
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-xs text-muted-foreground truncate">
            {loading ? "Searching…" : `Results for "${q}" · ${tracks.length} songs`}
          </p>
          <button
            onClick={() => setShowDebug((v) => !v)}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors",
              showDebug
                ? "bg-primary/15 text-primary border-primary/40"
                : "bg-secondary/60 text-muted-foreground border-border hover:text-foreground"
            )}
            aria-pressed={showDebug}
          >
            <Bug className="w-3.5 h-3.5" />
            Troubleshoot
          </button>
        </div>
      )}

      {q && showDebug && (
        <div className="mb-4 p-4 rounded-lg border border-border/60 bg-card/40 text-xs space-y-2 animate-fade-in">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm flex items-center gap-1.5">
              <Bug className="w-4 h-4 text-primary" /> Music source diagnostics
            </span>
            <span className="text-muted-foreground">{lastDuration}ms</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <DebugStat icon={<Youtube className="w-3.5 h-3.5 text-destructive" />} label="YouTube tracks" value={ytCount} />
            <DebugStat icon={<Radio className="w-3.5 h-3.5 text-primary" />} label="Audius tracks" value={auCount} />
            <DebugStat icon={<User className="w-3.5 h-3.5 text-foreground" />} label="Artists" value={artists.length} />
            <DebugStat icon={<ListMusic className="w-3.5 h-3.5 text-muted-foreground" />} label="Playlists" value={playlists.length} />
          </div>
          <div className="pt-1 flex items-center gap-2 text-muted-foreground">
            <CheckCircle2 className={cn("w-3.5 h-3.5", error ? "text-destructive" : "text-primary")} />
            <span>
              {error
                ? `Error: ${error}`
                : `Now playing source: ${currentSource ? currentSource.toUpperCase() : "—"} · Page ${page + 1}`}
            </span>
          </div>
        </div>
      )}

      {/* Compact popularity + language filter */}
      {q && (tracks.length > 0) && (
        <div className="flex items-center gap-2 flex-wrap mb-6 text-xs">
          <span className="px-2.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/40 font-medium">
            Popular only
          </span>
          <span className="text-muted-foreground ml-2">Language:</span>
          {(["all", "english", "hindi", "spanish", "korean", "japanese", "arabic"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLangFilter(l)}
              className={cn(
                "px-2.5 py-0.5 rounded-full border transition-colors",
                langFilter === l
                  ? "bg-foreground text-background border-foreground"
                  : "bg-transparent text-muted-foreground border-border hover:text-foreground"
              )}
            >
              {l === "all" ? "All" : LANG_LABEL[l as Language]}
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

      {!loading && !error && q && tracks.length === 0 && artists.length === 0 && playlists.length === 0 && (
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
                onClick={() => navigate(`/search?q=${encodeURIComponent(s)}`)}
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
          <p>Search for any song, artist, album or playlist</p>
        </div>
      )}

      {!loading && !error && (tracks.length > 0 || artists.length > 0 || playlists.length > 0) && (
        <div className="animate-fade-in">
          {tab === "all" && renderAll()}
          {tab === "songs" && (
            <>
              <h2 className="text-2xl font-bold mb-4">Songs</h2>
              {renderTracksTable(filteredTracks)}
            </>
          )}
          {tab === "artists" && (
            <>
              <h2 className="text-2xl font-bold mb-4">Artists</h2>
              {renderArtists()}
            </>
          )}
          {tab === "albums" && (
            <>
              <h2 className="text-2xl font-bold mb-4">Albums</h2>
              {renderAlbums()}
            </>
          )}
          {tab === "playlists" && (
            <>
              <h2 className="text-2xl font-bold mb-4">Playlists</h2>
              {renderPlaylists()}
            </>
          )}

          {/* Spotify-style explicit "Load more" — only on tabs that paginate */}
          {tab !== "all" && hasMore && (
            <div className="flex justify-center py-8">
              <Button
                variant="outline"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-full px-6 gap-2 font-semibold"
              >
                {loadingMore ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Loading…</>
                ) : (
                  <>Load more</>
                )}
              </Button>
            </div>
          )}
          {tab !== "all" && !hasMore && tracks.length > 0 && (
            <p className="text-center text-xs text-muted-foreground py-8">
              You've reached the end · {tracks.length} tracks
            </p>
          )}
        </div>
      )}
    </div>
  );
};

// Small fragment helper so we can return two <tr>s from a .map() in <tbody>
const FragmentRow = ({ children }: { children: React.ReactNode }) => <>{children}</>;

const LyricsRow = ({
  state,
  text,
  onRetry,
  onClose,
}: {
  state: "loading" | "done" | "none" | "error";
  text?: string;
  onRetry: () => void;
  onClose: () => void;
}) => (
  <div className="space-y-3">
    <div className="flex items-center justify-between">
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
        <FileText className="w-3.5 h-3.5" /> Lyrics
      </span>
      <button onClick={onClose} className="text-xs text-muted-foreground hover:text-foreground">
        Hide
      </button>
    </div>
    {state === "loading" && (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> Fetching lyrics…
      </div>
    )}
    {state === "done" && text && (
      <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90 max-h-80 overflow-y-auto">
        {text}
      </pre>
    )}
    {state === "none" && (
      <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>No lyrics found for this track.</span>
        <Button size="sm" variant="ghost" onClick={onRetry} className="h-7">
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Retry
        </Button>
      </div>
    )}
    {state === "error" && (
      <div className="flex items-center justify-between gap-3 text-sm text-destructive">
        <span>Couldn't load lyrics.</span>
        <Button size="sm" variant="ghost" onClick={onRetry} className="h-7">
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Retry
        </Button>
      </div>
    )}
  </div>
);

const DebugStat = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) => (
  <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-secondary/60 border border-border/50">
    {icon}
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground truncate">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
    </div>
  </div>
);

export default Search;
