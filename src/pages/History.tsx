// Full search history page — opened from Settings → Privacy → View search history.
// Lists every prior query (newest first), supports re-running a search and
// clearing all entries. Storage is purely local (sentify_search_history).

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { History as HistoryIcon, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSearchHistory, clearSearchHistory } from "@/lib/user-prefs";
import { toast } from "sonner";

const K = "sentify_search_history";

const History = () => {
  const [items, setItems] = useState<string[]>([]);
  const navigate = useNavigate();

  const refresh = () => setItems(getSearchHistory());

  useEffect(() => {
    refresh();
    const onStorage = (e: StorageEvent) => { if (e.key === K) refresh(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const removeOne = (q: string) => {
    const next = getSearchHistory().filter((x) => x.toLowerCase() !== q.toLowerCase());
    localStorage.setItem(K, JSON.stringify(next));
    setItems(next);
  };

  const clearAll = () => {
    clearSearchHistory();
    setItems([]);
    toast.success("Search history cleared");
  };

  return (
    <div className="px-6 md:px-10 py-8 max-w-3xl mx-auto">
      <Helmet>
        <title>Search History — Sentify</title>
        <meta name="description" content="View, re-run, or clear your full Sentify search history. Search history is stored only on your device." />
        <link rel="canonical" href="/history" />
        <meta property="og:title" content="Search History — Sentify" />
        <meta property="og:description" content="View, re-run, or clear your full Sentify search history. Search history is stored only on your device." />
        <meta property="og:url" content="/history" />
      </Helmet>

      <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-black flex items-center gap-3">
            <HistoryIcon className="w-8 h-8 text-primary" />
            Search history
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Saved locally on this device only. {items.length} {items.length === 1 ? "entry" : "entries"}.
          </p>
        </div>
        {items.length > 0 && (
          <Button variant="ghost" className="gap-2 text-destructive hover:text-destructive" onClick={clearAll}>
            <Trash2 className="w-4 h-4" /> Clear all
          </Button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-4 text-muted-foreground">
            <HistoryIcon className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-semibold mb-2">No search history yet</h2>
          <p className="text-muted-foreground mb-6 max-w-md">
            When you search for songs, artists or albums, your recent queries will appear here.
          </p>
          <Link to="/search">
            <Button className="gap-2"><Search className="w-4 h-4" /> Start searching</Button>
          </Link>
        </div>
      ) : (
        <ul className="rounded-lg border border-border/40 bg-card/30 divide-y divide-border/30">
          {items.map((q) => (
            <li key={q} className="flex items-center gap-2 px-3 py-2 group hover:bg-card/60 transition-colors">
              <button
                onClick={() => navigate(`/search?q=${encodeURIComponent(q)}`)}
                className="flex items-center gap-3 flex-1 min-w-0 text-left"
              >
                <HistoryIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="truncate">{q}</span>
              </button>
              <button
                onClick={() => removeOne(q)}
                className="p-1.5 rounded hover:bg-secondary opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label={`Remove ${q}`}
              >
                <X className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default History;
