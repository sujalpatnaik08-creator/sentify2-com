import { MOODS } from "@/types/music";
import { Link } from "react-router-dom";

const Library = () => {
  return (
    <div className="px-6 md:px-10 py-8 max-w-7xl mx-auto">
      <h1 className="text-3xl font-black mb-6">Your Library</h1>
      <p className="text-muted-foreground mb-8">Browse mood-curated playlists.</p>

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
    </div>
  );
};

export default Library;
