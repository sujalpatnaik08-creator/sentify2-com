import { Link, useLocation } from "react-router-dom";
import { Home, Search, Library, LogOut, Music2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";

export const Sidebar = () => {
  const loc = useLocation();
  const { user, signOut } = useAuth();

  const items = [
    { to: "/", icon: Home, label: "Home" },
    { to: "/search", icon: Search, label: "Search" },
    { to: "/library", icon: Library, label: "Your Library" },
  ];

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-24 w-64 bg-sidebar border-r border-sidebar-border flex-col p-4 z-30">
      <Link to="/" className="flex items-center gap-2 mb-8 px-2">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-[var(--shadow-glow)]">
          <Music2 className="w-5 h-5 text-primary-foreground" />
        </div>
        <span className="text-2xl font-black tracking-tight">Sentify</span>
      </Link>

      <nav className="space-y-1 flex-1">
        {items.map((it) => {
          const active = loc.pathname === it.to;
          return (
            <Link
              key={it.to}
              to={it.to}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg font-medium text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/50",
              )}
            >
              <it.icon className="w-5 h-5" />
              {it.label}
            </Link>
          );
        })}
      </nav>

      {user && (
        <div className="border-t border-sidebar-border pt-4 space-y-2">
          <div className="px-3 text-xs text-sidebar-foreground/70 truncate">{user.email}</div>
          <Button variant="ghost" size="sm" onClick={signOut} className="w-full justify-start">
            <LogOut className="w-4 h-4 mr-2" />
            Sign out
          </Button>
        </div>
      )}
    </aside>
  );
};
