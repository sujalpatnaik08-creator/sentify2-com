import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search as SearchIcon, Loader2 } from "lucide-react";
import { searchTracks } from "@/lib/music-api";
import type { Track } from "@/types/music";
import { TrackCard } from "@/components/TrackCard";

const Search = () => {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const id = setTimeout(() => {
      searchTracks(q, 30)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(id);
  }, [q]);

  return (
    <div className="px-6 md:px-10 py-8 max-w-7xl mx-auto">
      <div className="relative max-w-2xl mb-8">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search songs, artists…"
          className="pl-12 h-14 text-base rounded-full bg-card border-border/50"
        />
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {!loading && q && results.length === 0 && (
        <p className="text-muted-foreground text-center py-12">No results for "{q}"</p>
      )}

      {!q && (
        <div className="text-center py-12 text-muted-foreground">
          <SearchIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Search for any song or artist</p>
        </div>
      )}

      {results.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 animate-fade-in">
          {results.map((t) => (
            <TrackCard key={t.id} track={t} queue={results} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Search;
