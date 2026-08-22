// Smart Playlists — auto-groups every analyzed track by mood, genre,
// BPM range, and an explicit-free filter. Powered by the musicologist cache.

import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { listAnalyses, listUploads } from "@/lib/analysis-store";
import type { AnalysisResult, LocalUpload } from "@/types/analysis";
import { MOODS } from "@/types/music";
import { Button } from "@/components/ui/button";
import { AnalysisBadges } from "@/components/AnalysisBadges";
import { usePlayer } from "@/contexts/PlayerContext";
import type { Track } from "@/types/music";

type Filter = { kind: "all" } | { kind: "mood"; value: string } | { kind: "genre"; value: string } | { kind: "bpm"; min: number; max: number; label: string } | { kind: "clean" };

const BPM_RANGES = [
  { min: 0, max: 90, label: "Slow (<90)" },
  { min: 90, max: 110, label: "Mid (90-110)" },
  { min: 110, max: 130, label: "Upbeat (110-130)" },
  { min: 130, max: 220, label: "Fast (130+)" },
];

export const SmartPlaylistsPanel = () => {
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [uploads, setUploads] = useState<LocalUpload[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [filter, setFilter] = useState<Filter>({ kind: "all" });
  const { playTrack } = usePlayer();

  useEffect(() => {
    const load = () => {
      setLoadingData(true);
      Promise.all([listAnalyses(), listUploads()])
        .then(([a, u]) => { setAnalyses(a); setUploads(u); })
        .finally(() => setLoadingData(false));
    };
    load();
    const onChange = () => load();
    window.addEventListener("sentify:analysis-changed", onChange);
    window.addEventListener("sentify:uploads-changed", onChange);
    return () => {
      window.removeEventListener("sentify:analysis-changed", onChange);
      window.removeEventListener("sentify:uploads-changed", onChange);
    };
  }, []);

  const uploadById = useMemo(() => new Map(uploads.map((u) => [u.trackId, u])), [uploads]);

  const genres = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of analyses) if (a.genre) map.set(a.genre, (map.get(a.genre) || 0) + 1);
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
  }, [analyses]);

  const filtered = useMemo(() => {
    return analyses.filter((a) => {
      if (filter.kind === "all") return true;
      if (filter.kind === "mood") return a.mood === filter.value;
      if (filter.kind === "genre") return a.genre === filter.value;
      if (filter.kind === "bpm") return a.bpm != null && a.bpm >= filter.min && a.bpm < filter.max;
      if (filter.kind === "clean") return a.explicit === false;
      return true;
    });
  }, [analyses, filter]);

  const playOne = (a: AnalysisResult) => {
    const upload = uploadById.get(a.trackId);
    if (!upload) return;
    const blobUrl = URL.createObjectURL(upload.blob);
    const track: Track = {
      id: upload.trackId,
      title: upload.title,
      artist: upload.artist,
      artwork: "/placeholder.svg",
      audioUrl: blobUrl,
      duration: upload.durationSec,
      source: "audius",
    };
    playTrack(track);
  };

  return (
    <div>
      <p className="text-muted-foreground mb-6">
        Auto-grouped from the musicologist's analysis of your library and uploads.
      </p>

        {loadingData ? (
          <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" />Loading…</div>
        ) : analyses.length === 0 ? (
          <div className="bg-card/40 rounded-xl p-8 text-center">
            <p className="font-semibold mb-1">No analyzed tracks yet</p>
            <p className="text-sm text-muted-foreground">Upload music or play a track — analysis happens automatically.</p>
          </div>
        ) : (
          <>
            <Chips title="By mood" active={filter.kind === "mood" ? filter.value : null}>
              <Chip onClick={() => setFilter({ kind: "all" })} active={filter.kind === "all"}>All</Chip>
              {MOODS.map((m) => (
                <Chip
                  key={m.id}
                  onClick={() => setFilter({ kind: "mood", value: m.id })}
                  active={filter.kind === "mood" && filter.value === m.id}
                >
                  {m.emoji} {m.label}
                </Chip>
              ))}
            </Chips>

            {genres.length > 0 && (
              <Chips title="By genre">
                {genres.map(([g, n]) => (
                  <Chip
                    key={g}
                    onClick={() => setFilter({ kind: "genre", value: g })}
                    active={filter.kind === "genre" && filter.value === g}
                  >
                    {g} <span className="opacity-60">· {n}</span>
                  </Chip>
                ))}
              </Chips>
            )}

            <Chips title="By tempo">
              {BPM_RANGES.map((r) => (
                <Chip
                  key={r.label}
                  onClick={() => setFilter({ kind: "bpm", min: r.min, max: r.max, label: r.label })}
                  active={filter.kind === "bpm" && filter.label === r.label}
                >
                  {r.label}
                </Chip>
              ))}
              <Chip
                onClick={() => setFilter({ kind: "clean" })}
                active={filter.kind === "clean"}
              >
                Explicit-free
              </Chip>
            </Chips>

            <section className="mt-6">
              <h2 className="text-lg font-bold mb-3">{filtered.length} tracks</h2>
              {filtered.length === 0 ? (
                <p className="text-muted-foreground text-sm">No tracks match this filter.</p>
              ) : (
                <ul className="space-y-2">
                  {filtered.map((a) => (
                    <li key={a.trackId} className="bg-card/40 hover:bg-card/70 transition rounded-xl p-3 flex items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold truncate">{a.title || uploadById.get(a.trackId)?.title || a.trackId}</div>
                        <div className="text-xs text-muted-foreground truncate">{a.artist || uploadById.get(a.trackId)?.artist || ""}</div>
                        <div className="mt-2"><AnalysisBadges analysis={a} compact /></div>
                      </div>
                      {uploadById.has(a.trackId) && (
                        <Button size="sm" variant="secondary" onClick={() => playOne(a)}>Play</Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
    </div>
  );
};

const Chips = ({ title, children }: { title: string; active?: string | null; children: React.ReactNode }) => (
  <div className="mb-4">
    <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2">{title}</div>
    <div className="flex flex-wrap gap-2">{children}</div>
  </div>
);

const Chip = ({ children, active, onClick }: { children: React.ReactNode; active: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={`px-3 py-1.5 rounded-full text-sm font-medium transition ${
      active ? "bg-primary text-primary-foreground" : "bg-card/70 hover:bg-card text-foreground"
    }`}
  >
    {children}
  </button>
);

export default SmartPlaylistsPanel;
