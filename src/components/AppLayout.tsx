import { ReactNode, useState } from "react";
import { Sidebar } from "./Sidebar";
import { PlayerBar } from "./PlayerBar";
import { LyricsPanel } from "./LyricsPanel";
import { QueuePanel } from "./QueuePanel";
import { TopBar } from "./TopBar";
import { NowPlayingView } from "./NowPlayingView";
import { useAuth } from "@/contexts/AuthContext";

export const AppLayout = ({ children }: { children: ReactNode }) => {
  const [showLyrics, setShowLyrics] = useState(false);
  const [showQueue, setShowQueue] = useState(false);
  const [showNowPlaying, setShowNowPlaying] = useState(false);
  const { user } = useAuth();
  const signedIn = !!user;

  return (
    <div className="min-h-screen bg-background">
      {signedIn && <Sidebar />}
      <div
        className={
          signedIn
            ? "md:ml-64 pb-32 min-h-screen flex flex-col"
            : "pb-4 min-h-screen flex flex-col"
        }
      >
        <TopBar />
        <main className="flex-1">{children}</main>
      </div>
      {signedIn && showLyrics && <LyricsPanel onClose={() => setShowLyrics(false)} />}
      {signedIn && showQueue && <QueuePanel onClose={() => setShowQueue(false)} />}
      {signedIn && (
        <PlayerBar
          onToggleLyrics={() => {
            setShowLyrics((v) => !v);
            setShowQueue(false);
          }}
          onToggleQueue={() => {
            setShowQueue((v) => !v);
            setShowLyrics(false);
          }}
          onOpenNowPlaying={() => setShowNowPlaying(true)}
          showLyrics={showLyrics}
          showQueue={showQueue}
        />
      )}
      {signedIn && (
        <NowPlayingView open={showNowPlaying} onOpenChange={setShowNowPlaying} />
      )}
    </div>
  );
};
