import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { ChevronLeft, ChevronRight, Play, Headphones, Sparkles } from "lucide-react";
import { MoodFilter } from "@/components/MoodFilter";
import { TrackCard } from "@/components/TrackCard";
import { topTracks, tracksByTag } from "@/lib/music-api";
import type { Mood, Track } from "@/types/music";
import { MOODS } from "@/types/music";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import heroHeadphones from "@/assets/hero-headphones.jpg";

const HERO_SLIDES = [
  {
    eyebrow: "Let the",
    title: "MUSIC SPEAK!",
    body: "We hold our notes longer, better, and higher. We put the mental in instrumental and the cool in musicool.",
    cta: "Start listening",
  },
  {
    eyebrow: "Discover",
    title: "EVERY VIBE",
    body: "Bollywood, K-Pop, Lo-fi, Latin, Workout — full-length, ad-free, all in one place.",
    cta: "Browse moods",
  },
  {
    eyebrow: "Made for",
    title: "YOUR EARS",
    body: "Real-time synced lyrics, smart queues, offline downloads. Music that moves with you.",
    cta: "See features",
  },
];

const Home = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [mood, setMood] = useState<Mood | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [slide, setSlide] = useState(0);

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

  // Auto-rotate hero
  useEffect(() => {
    const id = setInterval(() => setSlide((s) => (s + 1) % HERO_SLIDES.length), 6500);
    return () => clearInterval(id);
  }, []);

  const goPrev = () => setSlide((s) => (s - 1 + HERO_SLIDES.length) % HERO_SLIDES.length);
  const goNext = () => setSlide((s) => (s + 1) % HERO_SLIDES.length);

  const current = HERO_SLIDES[slide];

  return (
    <>
      <Helmet>
        <title>Sentify — Free Ad-Free Music for Every Mood</title>
        <meta name="description" content="Stream full-length songs ad-free. Discover music by mood with synced lyrics, smart queues, and offline playback on Sentify." />
        <link rel="canonical" href="/" />
        <meta property="og:title" content="Sentify — Free Ad-Free Music for Every Mood" />
        <meta property="og:description" content="Stream full-length songs ad-free. Discover music by mood with synced lyrics and smart queues on Sentify." />
        <meta property="og:url" content="/" />
        <meta property="og:type" content="website" />
      </Helmet>
      <div className="relative">
        {/* === HERO ============================================================ */}
      <section className="relative overflow-hidden h-[70vh] min-h-[480px] max-h-[760px]">
        {/* Background image */}
        <img
          src={heroHeadphones}
          alt="Studio headphones on a desk"
          className="absolute inset-0 w-full h-full object-cover"
          width={1920}
          height={1088}
        />
        {/* Dark gradient overlay for text legibility */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/55 to-background" />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/15 via-transparent to-purple-500/15 mix-blend-overlay" />

        {/* Carousel arrows */}
        <button
          onClick={goPrev}
          aria-label="Previous slide"
          className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md text-white flex items-center justify-center transition-all"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <button
          onClick={goNext}
          aria-label="Next slide"
          className="absolute right-4 md:right-8 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-md text-white flex items-center justify-center transition-all"
        >
          <ChevronRight className="w-6 h-6" />
        </button>

        {/* Centered hero content */}
        <div className="relative z-10 h-full flex flex-col items-center justify-center text-center px-6 max-w-4xl mx-auto">
          {user && (
            <p className="text-xs md:text-sm text-white/70 mb-4 tracking-widest uppercase">
              Welcome back, {user.email?.split("@")[0]}
            </p>
          )}
          <p className="text-white/85 text-lg md:text-2xl font-light tracking-wider mb-2 animate-fade-in" key={`eb-${slide}`}>
            {current.eyebrow}
          </p>
          <h1
            key={`title-${slide}`}
            className="text-5xl sm:text-6xl md:text-8xl font-black text-white tracking-tight drop-shadow-2xl animate-fade-in leading-[0.95]"
          >
            {current.title}
          </h1>
          <p
            key={`body-${slide}`}
            className="text-white/80 mt-6 max-w-xl text-sm md:text-base animate-fade-in"
          >
            {current.body}
          </p>
          <div className="mt-8 flex items-center gap-3 animate-fade-in" key={`cta-${slide}`}>
            <Button
              onClick={() => navigate("/search")}
              className="rounded-full px-8 h-12 font-bold text-sm md:text-base gap-2 shadow-2xl"
            >
              <Play className="w-4 h-4 fill-current" />
              {current.cta}
            </Button>
            {!user && (
              <Button
                onClick={() => navigate("/auth")}
                variant="outline"
                className="rounded-full px-6 h-12 font-bold text-sm md:text-base bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white"
              >
                Sign up free
              </Button>
            )}
          </div>

          {/* Slide dots */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2">
            {HERO_SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlide(i)}
                aria-label={`Go to slide ${i + 1}`}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  i === slide ? "w-8 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70"
                )}
              />
            ))}
          </div>
        </div>
      </section>

      {/* === FEATURE STRIP =================================================== */}
      <section className="px-6 md:px-10 py-8 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <FeatureChip icon={<Headphones className="w-4 h-4" />} title="Full-length tracks" body="Real songs. No 30-second previews." />
          <FeatureChip icon={<Sparkles className="w-4 h-4" />} title="Synced lyrics" body="Sing along, line by line." />
          <FeatureChip icon={<Play className="w-4 h-4" />} title="Smart moods" body="Curated for every feeling." />
        </div>
      </section>


      {/* === MOOD FILTER ===================================================== */}
      <section className="px-6 md:px-10 py-4 max-w-7xl mx-auto">
        <h2 className="text-2xl font-bold mb-4">What's your mood?</h2>
        <MoodFilter active={mood} onSelect={setMood} />
      </section>

      {/* === TRACKS ========================================================== */}
      <section className="px-6 md:px-10 py-8 max-w-7xl mx-auto">
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

const FeatureChip = ({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) => (
  <div className="flex items-center gap-3 p-3 rounded-xl bg-card/50 border border-border/40">
    <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
      {icon}
    </div>
    <div className="min-w-0">
      <div className="text-sm font-bold truncate">{title}</div>
      <div className="text-xs text-muted-foreground truncate">{body}</div>
    </div>
  </div>
);

export default Home;
