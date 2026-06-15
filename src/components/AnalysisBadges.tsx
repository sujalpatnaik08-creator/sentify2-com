// Compact badge row showing AI musicologist analysis for a track.
// Renders nothing when no analysis is cached.

import type { AnalysisResult } from "@/types/analysis";
import { Badge } from "@/components/ui/badge";
import { Music2, Activity, KeyRound, AlertTriangle, Mic2 } from "lucide-react";
import { MOODS } from "@/types/music";
import { cn } from "@/lib/utils";

interface Props {
  analysis: AnalysisResult | undefined;
  compact?: boolean;
  className?: string;
}

export const AnalysisBadges = ({ analysis, compact, className }: Props) => {
  if (!analysis) return null;
  const moodMeta = analysis.mood ? MOODS.find((m) => m.id === analysis.mood) : undefined;
  const size = compact ? "text-[10px] px-1.5 py-0 h-5" : "text-xs px-2 py-0.5 h-6";

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {analysis.genre && (
        <Badge variant="secondary" className={cn("gap-1 font-medium", size)}>
          <Music2 className="w-3 h-3" />
          {analysis.genre}
        </Badge>
      )}
      {analysis.bpm && (
        <Badge variant="outline" className={cn("gap-1 font-medium", size)}>
          <Activity className="w-3 h-3" />
          {analysis.bpm} BPM
        </Badge>
      )}
      {analysis.key && (
        <Badge variant="outline" className={cn("gap-1 font-medium", size)}>
          <KeyRound className="w-3 h-3" />
          {analysis.key}
        </Badge>
      )}
      {(moodMeta || analysis.moodLabel) && (
        <Badge variant="secondary" className={cn("gap-1 font-medium", size)}>
          {moodMeta?.emoji ?? "🎧"}
          <span className="capitalize">{moodMeta?.label ?? analysis.moodLabel}</span>
        </Badge>
      )}
      {analysis.explicit && (
        <Badge variant="destructive" className={cn("gap-1 font-bold", size)}>
          <AlertTriangle className="w-3 h-3" />
          Explicit
        </Badge>
      )}
      {!compact && analysis.instruments && analysis.instruments.length > 0 && (
        <Badge variant="outline" className={cn("gap-1 font-medium", size)}>
          <Mic2 className="w-3 h-3" />
          {analysis.instruments.slice(0, 3).join(" · ")}
        </Badge>
      )}
    </div>
  );
};
