import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { MoodFilter } from "@/components/MoodFilter";
import { TrackCard } from "@/components/TrackCard";
import { SmartPlaylistsPanel } from "@/pages/SmartPlaylists";
import { tracksByTag, topTracks } from "@/lib/music-api";
import type { Mood, Track } from "@/types/music";
import { MOODS } from "@/types/music";
import { cn } from "@/lib/utils";

type Tab = "moods" | "smart";

const Moods = () => {
  const [tab, setTab] = useState<Tab>("moods");
  const [mood, setMood] = useState<Mood | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const fetcher = mood
      ? tracksByTag(MOODS.find((m) => m.id === mood)!.tag, 30)
      : topTracks(24);
    fetcher
      .then(setTracks)
      .catch(() => setTracks([]))
      .finally(() => setLoading(false));
  }, [mood]);

  return (
    <>
      <Helmet>
        <title>Moods & Smart Playlists — Sentify</title>
        <meta name="description" content="Pick a mood or let the musicologist build smart playlists by genre, BPM, key and mood — all full-length, ad-free songs." />
        <link rel="canonical" href="/moods" />
        <meta property="og:title" content="Moods & Smart Playlists — Sentify" />
        <meta property="og:description" content="Pick a mood or let the musicologist build smart playlists by genre, BPM, key and mood — all full-length, ad-free songs." />
        <meta property="og:url" content="/moods" />
      </Helmet>
      <div className="px-6 md:px-10 py-8 max-w-7xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-black mb-1">Moods &amp; Smart Playlists</h1>
        <p className="text-muted-foreground mb-6">
          Tap a mood for a curated soundtrack, or switch to smart playlists auto-built from your library.
        </p>

        {/* Tabs */}
        <div className="relative inline-flex items-center gap-1 p-1 rounded-full bg-card/60 border border-border/50 mb-8">
          {([
            { id: "moods" as Tab, label: "Moods", icon: Sparkles },
            { id: "smart" as Tab, label: "Smart Playlists", icon: Wand2 },
          ]).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all duration-300",
                tab === t.id
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Sliding panes */}
        <div className="overflow-hidden">
          <div
            className="flex w-[200%] transition-transform duration-500 ease-out"
            style={{ transform: tab === "moods" ? "translateX(0)" : "translateX(-50%)" }}
          >
            <div className="w-1/2 pr-1" aria-hidden={tab !== "moods"}>
              <MoodFilter active={mood} onSelect={setMood} />
              <section className="mt-10">
                <h2 className="text-2xl font-bold mb-4">
                  {mood ? `${MOODS.find((m) => m.id === mood)?.label} vibes` : "Trending now"}
                </h2>
                {loading ? (
                  <div className="flex justify-center py-16">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 animate-fade-in">
                    {tracks.map((t) => (
                      <TrackCard key={t.id} track={t} queue={tracks} />
                    ))}
                  </div>
                )}
              </section>
            </div>

            <div className="w-1/2 pl-1" aria-hidden={tab !== "smart"}>
              <h2 className="text-2xl font-bold mb-4">Smart Playlists</h2>
              <SmartPlaylistsPanel />
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Moods;
