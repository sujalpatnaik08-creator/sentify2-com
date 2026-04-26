import { MOODS, type Mood } from "@/types/music";
import { MoodOrb } from "./MoodOrb";
import { cn } from "@/lib/utils";

const MOOD_COLORS: Record<Mood, string> = {
  happy: "#fbbf24",
  chill: "#38bdf8",
  focus: "#8b5cf6",
  workout: "#ef4444",
  sad: "#64748b",
  party: "#ec4899",
  romance: "#f43f5e",
  sleep: "#3b82f6",
};

interface MoodFilterProps {
  active: Mood | null;
  onSelect: (m: Mood | null) => void;
}

export const MoodFilter = ({ active, onSelect }: MoodFilterProps) => {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      {MOODS.map((m) => {
        const isActive = active === m.id;
        return (
          <button
            key={m.id}
            onClick={() => onSelect(isActive ? null : m.id)}
            className={cn(
              "group relative aspect-square rounded-2xl overflow-hidden transition-all duration-300",
              "border border-border/50 hover:border-primary/60 hover:scale-105",
              isActive && "border-primary ring-2 ring-primary shadow-[var(--shadow-glow)]",
            )}
            style={{ background: m.gradient.replace("var(--gradient-mood-", "").includes("var(") ? undefined : m.gradient }}
          >
            <div className="absolute inset-0 opacity-90" style={{ background: `var(--gradient-mood-${m.id})` }} />
            <div className="absolute inset-0">
              <MoodOrb color={MOOD_COLORS[m.id]} isActive={isActive} />
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-end p-3 z-10">
              <span className="text-3xl mb-1 drop-shadow-lg">{m.emoji}</span>
              <span className="text-sm font-bold text-white drop-shadow-md">{m.label}</span>
            </div>
          </button>
        );
      })}
    </div>
  );
};
