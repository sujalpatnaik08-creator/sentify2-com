import { useEffect, useState } from "react";
import { MoodFilter } from "@/components/MoodFilter";
import { TrackCard } from "@/components/TrackCard";
import { HeroOrb } from "@/components/HeroOrb";
import { topTracks, tracksByTag } from "@/lib/music-api";
import type { Mood, Track } from "@/types/music";
import { MOODS } from "@/types/music";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const Home = () => {
  const { user } = useAuth();
  const [mood, setMood] = useState<Mood | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const fetcher = mood
      ? tracksByTag(MOODS.find((m) => m.id === mood)!.tag, 24)
      : topTracks(24);
    fetcher
      .then(setTracks)
      .catch(() => setTracks([]))
      .finally(() => setLoading(false));
  }, [mood]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  return (
    <div className="relative">
      <section className="relative overflow-hidden h-[280px] md:h-[340px]" style={{ background: "var(--gradient-hero)" }}>
        <HeroOrb />
        <div className="relative z-10 h-full flex flex-col justify-end px-6 md:px-10 pb-8 max-w-7xl mx-auto">
          <p className="text-sm text-muted-foreground mb-2">{greeting}{user?.email ? `, ${user.email.split("@")[0]}` : ""}</p>
          <h1 className="text-4xl md:text-6xl font-black tracking-tight">
            Music for every <span className="text-gradient">mood</span>
          </h1>
          <p className="text-muted-foreground mt-3 max-w-xl">
            Free, ad-free, full-length tracks. Pick a mood and let Sentify do the rest.
          </p>
        </div>
      </section>

      <section className="px-6 md:px-10 py-8 max-w-7xl mx-auto">
        <h2 className="text-2xl font-bold mb-4">What's your mood?</h2>
        <MoodFilter active={mood} onSelect={setMood} />
      </section>

      <section className="px-6 md:px-10 pb-12 max-w-7xl mx-auto">
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
  );
};

export default Home;
