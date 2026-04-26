import { Link, useLocation } from "react-router-dom";
import {
  Music,
  Sparkles,
  TrendingUp,
  ListMusic,
  Gamepad2,
  Download,
  Disc3,
  Mic2,
  History,
  Headphones,
  LogOut,
  PlayCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

type Item = { to: string; icon: typeof Music; label: string };

const discover: Item[] = [
  { to: "/", icon: Music, label: "Discover" },
  { to: "/new-releases", icon: Sparkles, label: "New Releases" },
  { to: "/charts", icon: TrendingUp, label: "Charts" },
  { to: "/playlists", icon: ListMusic, label: "Recommended Playlists" },
  { to: "/games", icon: Gamepad2, label: "Free Games" },
  { to: "/install", icon: Download, label: "Install app" },
];

const yourMusic: Item[] = [
  { to: "/library", icon: Music, label: "Songs" },
  { to: "/library?tab=playlists", icon: ListMusic, label: "Playlists" },
  { to: "/library?tab=albums", icon: Disc3, label: "Albums" },
  { to: "/library?tab=artists", icon: Mic2, label: "Artists" },
  { to: "/library?tab=history", icon: History, label: "History" },
  { to: "/library?tab=podcasts", icon: Headphones, label: "Podcasts" },
];

export const Sidebar = () => {
  const loc = useLocation();
  const { user, signOut } = useAuth();

  const renderItem = (it: Item) => {
    const active = loc.pathname + loc.search === it.to || (it.to === "/" && loc.pathname === "/" && loc.search === "");
    return (
      <Link
        key={it.to}
        to={it.to}
        className={cn(
          "group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all",
          active
            ? "bg-gradient-to-r from-primary/20 to-accent/10 text-foreground shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.25)]"
            : "text-sidebar-foreground hover:text-foreground hover:bg-sidebar-accent/60",
        )}
      >
        {active && <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-gradient-to-b from-primary to-accent" />}
        <it.icon className={cn("w-[18px] h-[18px] transition-colors", active ? "text-primary" : "group-hover:text-primary")} />
        <span className="truncate">{it.label}</span>
      </Link>
    );
  };

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 bg-sidebar/95 backdrop-blur-xl border-r border-sidebar-border flex-col z-30">
      <Link to="/" className="flex items-center gap-2.5 px-5 h-16 shrink-0 border-b border-sidebar-border">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary via-accent to-primary-glow flex items-center justify-center shadow-glow">
          <PlayCircle className="w-5 h-5 text-primary-foreground" />
        </div>
        <span className="text-xl font-black tracking-wider text-gradient">SENTIFY</span>
      </Link>

      <div className="flex-1 overflow-y-auto py-4 px-3 space-y-6 scrollbar-hide">
        <nav className="space-y-1">{discover.map(renderItem)}</nav>

        <div>
          <div className="px-3 mb-2 text-[11px] font-semibold tracking-widest text-sidebar-foreground/60 uppercase">
            Your Music
          </div>
          <nav className="space-y-1">{yourMusic.map(renderItem)}</nav>
        </div>
      </div>

      {user && (
        <div className="border-t border-sidebar-border p-3">
          <div className="px-2 text-xs text-sidebar-foreground/70 truncate mb-1">{user.email}</div>
          <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start hover:bg-sidebar-accent">
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
        </div>
      )}
    </aside>
  );
};
