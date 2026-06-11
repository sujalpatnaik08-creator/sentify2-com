import { Link, useLocation } from "react-router-dom";
import {
  Home,
  Search,
  Library,
  Music,
  ListMusic,
  Disc3,
  Mic2,
  LogOut,
  PlayCircle,
  Heart,
  Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

type Item = { to: string; icon: typeof Music; label: string };

const main: Item[] = [
  { to: "/", icon: Home, label: "Home" },
  { to: "/search", icon: Search, label: "Search" },
  { to: "/library", icon: Library, label: "Your Library" },
  { to: "/downloads", icon: Download, label: "Downloads" },
];

const yourMusic: Item[] = [
  { to: "/library?tab=liked", icon: Heart, label: "Liked Songs" },
  { to: "/library?tab=playlists", icon: ListMusic, label: "Playlists" },
  { to: "/library?tab=albums", icon: Disc3, label: "Albums" },
  { to: "/library?tab=artists", icon: Mic2, label: "Artists" },
];

export const Sidebar = () => {
  const loc = useLocation();
  const { user, signOut } = useAuth();

  const renderItem = (it: Item) => {
    const active = loc.pathname + loc.search === it.to ||
      (it.to === "/downloads" && loc.pathname === "/downloads");
    return (
      <Link
        key={it.to}
        to={it.to}
        className={cn(
          "group flex items-center gap-4 px-3 py-2 rounded-md text-sm font-semibold transition-colors",
          active
            ? "bg-sidebar-accent text-foreground"
            : "text-sidebar-foreground hover:text-foreground",
        )}
      >
        <it.icon className="w-5 h-5 shrink-0" strokeWidth={2.25} />
        <span className="truncate">{it.label}</span>
      </Link>
    );
  };

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 bg-sidebar border-r border-sidebar-border flex-col z-30">
      <Link to="/" className="flex items-center gap-2 px-6 h-16 shrink-0">
        <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
          <PlayCircle className="w-5 h-5 text-primary-foreground" />
        </div>
        <span className="text-xl font-bold tracking-tight text-foreground">Sentify</span>
      </Link>

      <div className="flex-1 overflow-y-auto py-2 px-3 space-y-6 scrollbar-hide">
        <nav className="space-y-1">{main.map(renderItem)}</nav>

        <div>
          <div className="px-3 mb-2 text-[11px] font-bold tracking-widest text-sidebar-foreground/60 uppercase">
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
