import { useCallback, useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Search as SearchIcon, Loader2, SearchX, RefreshCw, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { searchTracks } from "@/lib/music-api";
import type { Track } from "@/types/music";
import { TrackCard } from "@/components/TrackCard";

const SUGGESTIONS = ["Daylight", "Arijit Singh", "Coldplay", "Lo-fi", "Taylor Swift", "Khuda Jaane"];

const Search = () => {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const runSearch = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await searchTracks(query, 30);
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
