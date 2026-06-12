import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Loader2 } from "lucide-react";
import { MoodFilter } from "@/components/MoodFilter";
import { TrackCard } from "@/components/TrackCard";
import { tracksByTag, topTracks } from "@/lib/music-api";
import type { Mood, Track } from "@/types/music";
import { MOODS } from "@/types/music";

const Moods = () => {
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
        <title>Moods — Music for Every Feeling on Sentify</title>
        <meta name="description" content="Pick a mood and stream curated, full-length songs — happy, chill, focus, workout, sad, party, romance, sleep." />
        <link rel="canonical" href="/moods" />
      </Helmet>
      <div className="px-6 md:px-10 py-8 max-w-7xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-black mb-1">Moods</h1>
        <p className="text-muted-foreground mb-6">Tap a mood to discover the perfect soundtrack.</p>
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
    </>
  );
};

export default Moods;
