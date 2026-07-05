// Track-level credits panel — Main Artist, Composer, Lyricist etc.
// Populated from AI musicologist analysis; falls back to the track's artist
// string when analysis hasn't run yet.

import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { UserPlus, UserMinus, Users } from "lucide-react";
import { useAnalysis } from "@/lib/musicologist";
import { cn } from "@/lib/utils";
import {
  getFavoriteArtists,
  setFavoriteArtists,
  type FavArtist,
} from "@/lib/user-prefs";
import { useState } from "react";

interface Props {
  trackId: string | undefined;
  fallbackArtist?: string;
  fallbackArtwork?: string;
  className?: string;
}

const artistId = (name: string) =>
  encodeURIComponent(name.toLowerCase().replace(/\s+/g, "-"));

export const CreditsPanel = ({ trackId, fallbackArtist, fallbackArtwork, className }: Props) => {
  const analysis = useAnalysis(trackId);
  const [favs, setFavs] = useState<FavArtist[]>(getFavoriteArtists());

  const credits =
    analysis?.credits && analysis.credits.length > 0
      ? analysis.credits
      : fallbackArtist
        ? [{ role: "Main Artist", name: fallbackArtist }]
        : [];

  if (credits.length === 0) return null;

  // Group same person across roles
  const grouped = new Map<string, string[]>();
  for (const c of credits) {
    const key = c.name.trim();
    if (!key) continue;
    if (!grouped.has(key)) grouped.set(key, []);
    if (!grouped.get(key)!.includes(c.role)) grouped.get(key)!.push(c.role);
  }

  const followable = (name: string) => favs.some((a) => a.id === artistId(name));
  const toggleFollow = (name: string) => {
    const id = artistId(name);
    if (followable(name)) {
      const next = favs.filter((a) => a.id !== id);
      setFavs(next);
      setFavoriteArtists(next);
      return;
    }
    if (favs.length >= 3) {
      const next = [...favs.slice(0, 2), { id, name, thumbnail: fallbackArtwork || "" }];
      setFavs(next);
      setFavoriteArtists(next);
      return;
    }
    const next = [...favs, { id, name, thumbnail: fallbackArtwork || "" }];
    setFavs(next);
    setFavoriteArtists(next);
  };

  return (
    <div className={cn("rounded-xl bg-card/60 border border-border/50 p-4", className)}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold inline-flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-primary/15 text-primary">
            <Users className="w-3.5 h-3.5" />
          </span>
          Credits
        </h3>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
          {analysis?.credits ? "AI-inferred" : "From metadata"}
        </span>
      </div>
      <ul className="space-y-2">
        {[...grouped.entries()].slice(0, 6).map(([name, roles]) => {
          const following = followable(name);
          return (
            <li key={name} className="flex items-center justify-between gap-3">
              <Link
                to={`/artist/${artistId(name)}?name=${encodeURIComponent(name)}`}
                className="min-w-0 group"
              >
                <div className="text-sm font-semibold truncate group-hover:underline">{name}</div>
                <div className="text-[11px] text-muted-foreground truncate">
                  {roles.join(" · ")}
                </div>
              </Link>
              <Button
                size="sm"
                variant={following ? "outline" : "secondary"}
                onClick={() => toggleFollow(name)}
                className="rounded-full h-8 px-3 text-xs shrink-0"
              >
                {following ? (
                  <><UserMinus className="w-3.5 h-3.5 mr-1" /> Following</>
                ) : (
                  <><UserPlus className="w-3.5 h-3.5 mr-1" /> Follow</>
                )}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};
