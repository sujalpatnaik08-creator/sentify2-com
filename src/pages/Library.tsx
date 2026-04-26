import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { MOODS } from "@/types/music";
import type { Track } from "@/types/music";
import {
  getLikedTracks,
  getSearchHistory,
  clearSearchHistory,
  getFavoriteArtists,
  setFavoriteArtists,
  type FavArtist,
  toggleLikedTrack,
  getRecentlyPlayed,
} from "@/lib/user-prefs";
import { searchAll, type ArtistResult } from "@/lib/music-api";
import { usePlayer } from "@/contexts/PlayerContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Heart,
  ListMusic,
  Disc3,
  Mic2,
  History,
  Search as SearchIcon,
  Play,
  Pause,
  Trash2,
  Loader2,
  Plus,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "liked" | "playlists" | "albums" | "artists" | "history";

const TABS: { id: Tab; label: string; icon: typeof Heart }[] = [
  { id: "liked", label: "Liked Songs", icon: Heart },
  { id: "playlists", label: "Playlists", icon: ListMusic },
  { id: "albums", label: "Albums", icon: Disc3 },
  { id: "artists", label: "Artists", icon: Mic2 },
  { id: "history", label: "History", icon: History },
];

const fmt = (s: number) => {
  if (!s || !isFinite(s)) return "--:--";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
};

const Library = () => {
  const navigate = useNavigate();
  const loc = useLocation();
  const tabParam = (new URLSearchParams(loc.search).get("tab") as Tab) || "liked";
  const tab: Tab = TABS.some((t) => t.id === tabParam) ? tabParam : "liked";

  const { current, isPlaying, playTrack, togglePlay } = usePlayer();
  const [liked, setLiked] = useState<Track[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [recent, setRecent] = useState<Track[]>([]);
  const [favArtists, setFavArtistsState] = useState<FavArtist[]>([]);

  // Re-read storage on mount + when tab changes (so after liking a song
  // and going to library it reflects)
  useEffect(() => {
    setLiked(getLikedTracks());
    setHistory(getSearchHistory());
    setRecent(getRecentlyPlayed());
    setFavArtistsState(getFavoriteArtists());
  }, [tab, loc.search]);

  const goTab = (id: Tab) =>
    navigate(`/library?tab=${id}`, { replace: true });

  // ----- albums derived from liked tracks -----
  const albums = useMemo(() => {
    const map = new Map<string, { name: string; artist: string; artwork: string; tracks: Track[] }>();
    for (const t of liked) {
      const name = t.album?.trim() || t.title;
      const key = `${name}|${t.artist}`;
      if (!map.has(key)) map.set(key, { name, artist: t.artist, artwork: t.artwork, tracks: [] });
      map.get(key)!.tracks.push(t);
    }
    return [...map.values()].sort((a, b) => b.tracks.length - a.tracks.length);
  }, [liked]);

  return (
    <div className="px-6 md:px-10 py-8 max-w-7xl mx-auto">
      <h1 className="text-3xl md:text-4xl font-black mb-1">Your Library</h1>
      <p className="text-muted-foreground mb-6">
        Saved songs, your favorite artists, and your search history — all in one place.
      </p>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 mb-8 sticky top-16 z-10 bg-background/80 backdrop-blur py-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => goTab(t.id)}
              className={cn(
                "inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-medium transition-colors border",
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-secondary/60 text-muted-foreground border-border hover:text-foreground hover:bg-secondary"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "liked" && (
        <LikedView
          tracks={liked}
          current={current}
          isPlaying={isPlaying}
          onPlay={(t) => (current?.id === t.id ? togglePlay() : playTrack(t, liked))}
          onUnlike={(t) => {
            toggleLikedTrack(t);
            setLiked(getLikedTracks());
          }}
        />
      )}

      {tab === "playlists" && <PlaylistsView />}

      {tab === "albums" && (
        <AlbumsView
          albums={albums}
          onPlay={(tracks) => tracks[0] && playTrack(tracks[0], tracks)}
        />
      )}

      {tab === "artists" && (
        <ArtistsView
          favArtists={favArtists}
          onSave={(arts) => {
            setFavoriteArtists(arts);
            setFavArtistsState(arts);
          }}
          onSearchArtist={(name) => navigate(`/search?q=${encodeURIComponent(name)}`)}
        />
      )}

      {tab === "history" && (
        <HistoryView
          queries={history}
          recent={recent}
          onSearch={(q) => navigate(`/search?q=${encodeURIComponent(q)}`)}
          onClear={() => {
            clearSearchHistory();
            setHistory([]);
          }}
        />
      )}
    </div>
  );
};

// ----- Liked songs -----

const LikedView = ({
  tracks, current, isPlaying, onPlay, onUnlike,
}: {
  tracks: Track[];
  current: Track | null;
  isPlaying: boolean;
  onPlay: (t: Track) => void;
  onUnlike: (t: Track) => void;
}) => {
  if (tracks.length === 0) {
    return (
      <EmptyState
        icon={<Heart className="w-8 h-8" />}
        title="No liked songs yet"
        body="Tap the heart on any track in Search to save it here."
        cta={{ label: "Browse", to: "/search" }}
      />
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b border-border/50 text-left">
            <th className="font-normal py-3 pl-3 pr-2 w-12">#</th>
            <th className="font-normal py-3 px-2">Title</th>
            <th className="font-normal py-3 px-2 hidden md:table-cell">Artist</th>
            <th className="font-normal py-3 px-2 w-12"></th>
            <th className="font-normal py-3 px-3 w-16 text-right">Time</th>
          </tr>
        </thead>
        <tbody>
          {tracks.map((t, i) => {
            const isCurrent = current?.id === t.id;
            return (
              <tr
                key={t.id}
                className={cn(
                  "group border-b border-border/20 hover:bg-card/60 transition-colors cursor-pointer",
                  isCurrent && "bg-primary/5",
                )}
                onDoubleClick={() => onPlay(t)}
              >
                <td className="py-2 pl-3 pr-2 text-muted-foreground">
                  <button onClick={() => onPlay(t)} className="w-6 h-6 flex items-center justify-center" aria-label="Play">
                    <span className={cn("group-hover:hidden", isCurrent && "hidden")}>{i + 1}</span>
                    <span className={cn("hidden group-hover:flex", isCurrent && "flex")}>
                      {isCurrent && isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current" />}
                    </span>
                  </button>
                </td>
                <td className="py-2 px-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <img src={t.artwork} alt={t.title} className="w-10 h-10 rounded object-cover shrink-0"
                      onError={(e) => ((e.target as HTMLImageElement).src = "/placeholder.svg")} />
                    <div className="min-w-0">
                      <div className={cn("truncate font-medium", isCurrent && "text-primary")}>{t.title}</div>
                      <div className="md:hidden text-xs text-muted-foreground truncate">{t.artist}</div>
                    </div>
                  </div>
                </td>
                <td className="py-2 px-2 text-muted-foreground hidden md:table-cell truncate max-w-[260px]">{t.artist}</td>
                <td className="py-2 px-2">
                  <button onClick={() => onUnlike(t)} className="text-primary opacity-0 group-hover:opacity-100" aria-label="Unlike">
                    <Heart className="w-4 h-4 fill-current" />
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
};

// ----- Playlists (mood) -----

const PlaylistsView = () => (
  <>
    <p className="text-muted-foreground text-sm mb-4">Mood-curated playlists pulled from YouTube Music.</p>
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
      {MOODS.map((m) => (
        <Link
          key={m.id}
          to={`/?mood=${m.id}`}
          className="group relative aspect-[4/3] rounded-2xl overflow-hidden border border-border/50 hover:border-primary/50 transition-all hover:scale-[1.02]"
          style={{ background: `var(--gradient-mood-${m.id})` }}
        >
          <div className="absolute inset-0 flex flex-col justify-between p-5">
            <span className="text-5xl">{m.emoji}</span>
            <div>
              <div className="text-xl font-bold text-white drop-shadow">{m.label}</div>
              <div className="text-sm text-white/80">Mood playlist</div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  </>
);

// ----- Albums -----

const AlbumsView = ({
  albums, onPlay,
}: {
  albums: { name: string; artist: string; artwork: string; tracks: Track[] }[];
  onPlay: (tracks: Track[]) => void;
}) => {
  if (albums.length === 0) {
    return (
      <EmptyState
        icon={<Disc3 className="w-8 h-8" />}
        title="No albums yet"
        body="Albums appear here once you've liked songs from them."
        cta={{ label: "Find music", to: "/search" }}
      />
    );
  }
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
      {albums.map((al) => (
        <button
          key={`${al.name}-${al.artist}`}
          onClick={() => onPlay(al.tracks)}
          className="flex flex-col gap-3 p-3 rounded-lg hover:bg-card/60 transition-colors text-left"
        >
          <img src={al.artwork} alt={al.name} className="w-full aspect-square rounded-md object-cover shadow-lg"
            onError={(e) => ((e.target as HTMLImageElement).src = "/placeholder.svg")} />
          <div className="min-w-0">
            <div className="font-semibold truncate">{al.name}</div>
            <div className="text-xs text-muted-foreground truncate">{al.artist} · {al.tracks.length} song{al.tracks.length === 1 ? "" : "s"}</div>
          </div>
        </button>
      ))}
    </div>
  );
};

// ----- Artists picker (3 favorites) -----

const ArtistsView = ({
  favArtists, onSave, onSearchArtist,
}: {
  favArtists: FavArtist[];
  onSave: (a: FavArtist[]) => void;
  onSearchArtist: (name: string) => void;
}) => {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ArtistResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    let cancelled = false;
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const data = await searchAll(query, 12);
        if (!cancelled) setResults(data.artists.slice(0, 12));
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => { cancelled = true; clearTimeout(id); };
  }, [query]);

  const isPicked = (id: string) => favArtists.some((a) => a.id === id);

  const togglePick = (a: ArtistResult) => {
    if (isPicked(a.id)) {
      onSave(favArtists.filter((x) => x.id !== a.id));
      return;
    }
    if (favArtists.length >= 3) return; // capped at 3
    onSave([...favArtists, { id: a.id, name: a.name, thumbnail: a.thumbnail }]);
  };

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-xl font-bold mb-1">Your top 3 artists</h2>
        <p className="text-muted-foreground text-sm mb-4">
          Pick up to 3 artists you love — we'll spotlight them across Sentify.
        </p>
        {favArtists.length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No favorites yet — search below to add some.</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {favArtists.map((a) => (
              <div key={a.id} className="relative group">
                <button onClick={() => onSearchArtist(a.name)} className="flex flex-col items-center gap-2">
                  <img src={a.thumbnail} alt={a.name} className="w-24 h-24 rounded-full object-cover shadow-lg"
                    onError={(e) => ((e.target as HTMLImageElement).src = "/placeholder.svg")} />
                  <span className="text-sm font-semibold max-w-[120px] truncate">{a.name}</span>
                </button>
                <button
                  onClick={() => onSave(favArtists.filter((x) => x.id !== a.id))}
                  className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Remove"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-xl font-bold mb-3">Find artists</h2>
        <div className="relative max-w-md mb-4">
          <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search for an artist…"
            className="pl-9 h-10 bg-secondary/60 rounded-full"
          />
        </div>
        {loading && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
        {!loading && query && results.length === 0 && (
          <p className="text-sm text-muted-foreground">No artists found.</p>
        )}
        {results.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {results.map((a) => {
              const picked = isPicked(a.id);
              const disabled = !picked && favArtists.length >= 3;
              return (
                <button
                  key={a.id}
                  onClick={() => togglePick(a)}
                  disabled={disabled}
                  className={cn(
                    "relative flex flex-col items-center gap-2 p-3 rounded-lg transition-colors text-center",
                    picked ? "bg-primary/10 ring-2 ring-primary" : "hover:bg-card/60",
                    disabled && "opacity-40 cursor-not-allowed"
                  )}
                >
                  <div className="relative">
                    <img src={a.thumbnail} alt={a.name} className="w-20 h-20 rounded-full object-cover shadow-lg"
                      onError={(e) => ((e.target as HTMLImageElement).src = "/placeholder.svg")} />
                    {picked && (
                      <span className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                        <Check className="w-3.5 h-3.5" />
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-semibold truncate w-full">{a.name}</span>
                  {!picked && !disabled && (
                    <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1"><Plus className="w-2.5 h-2.5" /> Add</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

// ----- History -----

const HistoryView = ({
  queries, recent, onSearch, onClear,
}: {
  queries: string[];
  recent: Track[];
  onSearch: (q: string) => void;
  onClear: () => void;
}) => {
  if (queries.length === 0 && recent.length === 0) {
    return (
      <EmptyState
        icon={<History className="w-8 h-8" />}
        title="No history yet"
        body="Songs you play and queries you search will show up here."
        cta={{ label: "Search music", to: "/search" }}
      />
    );
  }
  return (
    <div className="space-y-10">
      {queries.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold">Searched songs</h2>
            <Button variant="ghost" size="sm" onClick={onClear} className="text-muted-foreground">
              <Trash2 className="w-4 h-4 mr-1" /> Clear
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {queries.map((q) => (
              <button
                key={q}
                onClick={() => onSearch(q)}
                className="px-4 py-1.5 rounded-full bg-secondary hover:bg-secondary/80 text-sm transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </section>
      )}
      {recent.length > 0 && (
        <section>
          <h2 className="text-xl font-bold mb-3">Recently played</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {recent.slice(0, 18).map((t) => (
              <button
                key={t.id}
                onClick={() => onSearch(`${t.title} ${t.artist}`)}
                className="flex flex-col gap-2 p-2 rounded-lg hover:bg-card/60 transition-colors text-left"
              >
                <img src={t.artwork} alt={t.title} className="w-full aspect-square rounded-md object-cover shadow"
                  onError={(e) => ((e.target as HTMLImageElement).src = "/placeholder.svg")} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{t.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{t.artist}</div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

// ----- Empty state -----

const EmptyState = ({
  icon, title, body, cta,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  cta?: { label: string; to: string };
}) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4 text-muted-foreground">
      {icon}
    </div>
    <h3 className="text-xl font-semibold mb-2">{title}</h3>
    <p className="text-muted-foreground mb-6 max-w-md">{body}</p>
    {cta && (
      <Link to={cta.to}>
        <Button>{cta.label}</Button>
      </Link>
    )}
  </div>
);

export default Library;
