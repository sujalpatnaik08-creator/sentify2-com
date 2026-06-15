// "Jump to golden minute" — seeks the player to the AI-identified peak section.

import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { usePlayer } from "@/contexts/PlayerContext";
import { useAnalysis } from "@/lib/musicologist";
import { toast } from "sonner";

interface Props {
  trackId: string | undefined;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "secondary" | "ghost";
  className?: string;
}

export const GoldenMinuteButton = ({ trackId, size = "sm", variant = "secondary", className }: Props) => {
  const analysis = useAnalysis(trackId);
  const { seek, current } = usePlayer();

  if (!analysis?.goldenStartSec || analysis.goldenStartSec <= 0) return null;
  if (!current || current.id !== trackId) return null;

  const handleJump = () => {
    seek(analysis.goldenStartSec!);
    toast.success(`Jumped to the golden minute (${formatTime(analysis.goldenStartSec!)})`);
  };

  return (
    <Button
      size={size}
      variant={variant}
      onClick={handleJump}
      className={className}
      title="Jump to chorus / peak section"
    >
      <Sparkles className="w-4 h-4 mr-1.5" />
      Golden minute
    </Button>
  );
};

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
