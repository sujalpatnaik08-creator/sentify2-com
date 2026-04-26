import { ReactNode, useState } from "react";
import { Sidebar } from "./Sidebar";
import { PlayerBar } from "./PlayerBar";
import { LyricsPanel } from "./LyricsPanel";
import { QueuePanel } from "./QueuePanel";
import { TopBar } from "./TopBar";

export const AppLayout = ({ children }: { children: ReactNode }) => {
  const [showLyrics, setShowLyrics] = useState(false);
  const [showQueue, setShowQueue] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar />
      <div className="md:ml-64 pb-32 min-h-screen flex flex-col">
        <TopBar />
        <main className="flex-1">{children}</main>
      </div>
      {showLyrics && (
        <LyricsPanel
          onClose={() => setShowLyrics(false)}
        />
      )}
      {showQueue && (
        <QueuePanel onClose={() => setShowQueue(false)} />
      )}
      <PlayerBar
        onToggleLyrics={() => {
          setShowLyrics((v) => !v);
          setShowQueue(false);
        }}
        onToggleQueue={() => {
          setShowQueue((v) => !v);
          setShowLyrics(false);
        }}
        showLyrics={showLyrics}
        showQueue={showQueue}
      />
    </div>
  );
};
