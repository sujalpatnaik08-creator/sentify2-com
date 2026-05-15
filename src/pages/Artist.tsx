// Artist profile page — top tracks + derived albums + follow toggle.
// Artist `id` in URL is the user's chosen artist key (we mostly carry the
// channel name through, since YouTube channel-id-to-tracks scraping is
// heavy; using the artist name yields good results from our music search).

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { Loader2, Play, Pause, UserPlus, UserMinus, ArrowLeft, Disc3 } from "lucide-react";
import { searchAll } from "@/lib/music-api";
import type { Track } from "@/types/music";
import { usePlayer } from "@/contexts/PlayerContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getFavoriteArtists,
  setFavoriteArtists,
  type FavArtist,
} from "@/lib/user-prefs";

const fmt = (s: number) => {
  if (!s || !isFinite(s)) return "--:--";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
};

const Artist = () => {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();

  // Display name + thumbnail are passed as query params from search results
  // so we can render the header instantly while we fetch tracks.
  const displayName = params.get("name") || decodeURIComponent(id);
  const thumbnail = params.get("thumb") || "";

  const { current, isPlaying, playTrack, togglePlay } = usePlayer();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [favs, setFavs] = useState<FavArtist[]>(getFavoriteArtists());

  const isFollowing = favs.some((a) => a.id === id);

  const toggleFollow = () => {
    if (isFollowing) {
      const next = favs.filter((a) => a.id !== id);
      setFavoriteArtists(next);
      setFavs(next);
      return;
    }
    if (favs.length >= 3) {
      // Replace the last one (most recent) — capped at 3
      const next = [...favs.slice(0, 2), { id, name: displayName, thumbnail }];
      setFavoriteArtists(next);
      setFavs(next);
      return;
    }
    const next = [...favs, { id, name: displayName, thumbnail }];
    setFavoriteArtists(next);
    setFavs(next);
  };

  // Pull top tracks for this artist
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    searchAll(displayName, 30)
      .then((res) => {
        if (cancelled) return;
        // Prefer tracks where the channel name actually matches
        const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
        const wanted = norm(displayName);
        const matched = res.tracks.filter((t) => norm(t.artist).includes(wanted));
        setTracks(matched.length > 0 ? matched : res.tracks);
      })
      .catch(() => setTracks([]))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [displayName]);

  const albums = useMemo(() => {
    const map = new Map<string, { name: string; artwork: string; tracks: Track[] }>();
    for (const t of tracks) {
      const name = t.album?.trim() || t.title;
      if (!map.has(name)) map.set(name, { name, artwork: t.artwork, tracks: [] });
      map.get(name)!.tracks.push(t);
    }
    return [...map.values()].sort((a, b) => b.tracks.length - a.tracks.length).slice(0, 12);
  }, [tracks]);

  const top = tracks.slice(0, 10);

  const handlePlay = (t: Track) => {
    if (current?.id === t.id) togglePlay();
    else playTrack(t, tracks);
  };

  return (
    <div>
      <Helmet>
        <title>{displayName} — Artist on Sentify</title>
        <meta name="description" content={`Listen to ${displayName}'s top tracks and albums on Sentify. Full-length, ad-free music streaming with synced lyrics.`} />
        <link rel="canonical" href={`/artist/${id}`} />
      </Helmet>
      {/* Header */}
      <section
        className="relative overflow-hidden"
        style={{
          background:
            "linear-gradient(180deg, hsl(var(--primary) / 0.35) 0%, hsl(var(--background)) 100%)",
        }}
      >
        <div className="px-6 md:px-10 py-10 max-w-7xl mx-auto flex items-end gap-6 flex-wrap">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate(-1)}
            className="rounded-full bg-black/30 hover:bg-black/50 text-white absolute top-4 left-4 z-10"
            aria-label="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          {thumbnail && (
            <img
              src={thumbnail}
              alt={displayName}
              className="w-40 h-40 md:w-52 md:h-52 rounded-full object-cover shadow-2xl ring-4 ring-background/40"
              onError={(e) => ((e.target as HTMLImageElement).src = "/placeholder.svg")}
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">Artist</p>
            <h1 className="text-4xl md:text-6xl font-black tracking-tight truncate">{displayName}</h1>
            <p className="text-muted-foreground mt-3">
              {loading ? "Loading…" : `${tracks.length} top tracks · ${albums.length} albums`}
            </p>
            <div className="mt-5 flex items-center gap-3">
              <Button
                onClick={() => top[0] && handlePlay(top[0])}
                disabled={top.length === 0}
                className="rounded-full px-6 h-11 gap-2 font-bold"
              >
                <Play className="w-4 h-4 fill-current" />
                Play
              </Button>
              <Button
                variant={isFollowing ? "outline" : "secondary"}
                onClick={toggleFollow}
                className="rounded-full px-5 h-11 gap-2 font-semibold"
              >
                {isFollowing
                  ? <><UserMinus className="w-4 h-4" /> Following</>
                  : <><UserPlus className="w-4 h-4" /> Follow</>}
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Top tracks */}
      <section className="px-6 md:px-10 py-8 max-w-7xl mx-auto">
        <h2 className="text-2xl font-bold mb-4">Top tracks</h2>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          </div>
        ) : top.length === 0 ? (
          <p className="text-muted-foreground text-sm">No tracks found for this artist.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {top.map((t, i) => {
                  const isCurrent = current?.id === t.id;
                  return (
                    <tr
                      key={t.id}
                      className={cn(
                        "group border-b border-border/20 hover:bg-card/60 transition-colors cursor-pointer",
                        isCurrent && "bg-primary/5"
                      )}
                      onDoubleClick={() => handlePlay(t)}
                    >
                      <td className="py-2 pl-3 pr-2 text-muted-foreground w-12">
                        <button
                          onClick={() => handlePlay(t)}
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
                          <img src={t.artwork} alt={t.title} className="w-10 h-10 rounded object-cover shrink-0"
                            onError={(e) => ((e.target as HTMLImageElement).src = "/placeholder.svg")} />
                          <div className={cn("truncate font-medium", isCurrent && "text-primary")}>{t.title}</div>
                        </div>
                      </td>
                      <td className="py-2 px-3 text-right text-muted-foreground tabular-nums w-16">{fmt(t.duration)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Albums */}
      {albums.length > 0 && (
        <section className="px-6 md:px-10 pb-12 max-w-7xl mx-auto">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <Disc3 className="w-5 h-5" /> Albums & singles
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
            {albums.map((al) => (
              <button
                key={al.name}
                onClick={() => al.tracks[0] && playTrack(al.tracks[0], al.tracks)}
                className="flex flex-col gap-3 p-3 rounded-lg hover:bg-card/60 transition-colors text-left"
              >
                <img src={al.artwork} alt={al.name} className="w-full aspect-square rounded-md object-cover shadow-lg"
                  onError={(e) => ((e.target as HTMLImageElement).src = "/placeholder.svg")} />
                <div className="min-w-0">
                  <div className="font-semibold truncate">{al.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {al.tracks.length} song{al.tracks.length === 1 ? "" : "s"}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

export default Artist;
