import { Search as SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export const TopBar = () => {
  const navigate = useNavigate();
  const loc = useLocation();
  const [q, setQ] = useState("");

  // Sync from URL when on /search
  useEffect(() => {
    if (loc.pathname === "/search") {
      const params = new URLSearchParams(loc.search);
      setQ(params.get("q") || "");
    }
  }, [loc.pathname, loc.search]);

  const onChange = (val: string) => {
    setQ(val);
    const params = new URLSearchParams();
    if (val) params.set("q", val);
    navigate(`/search${params.toString() ? `?${params.toString()}` : ""}`, { replace: loc.pathname === "/search" });
  };

  return (
    <header className="sticky top-0 z-20 h-16 bg-background/80 backdrop-blur-xl border-b border-border/50 flex items-center px-6 gap-4">
      <div className="relative flex-1 max-w-3xl">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search songs, artists, albums…"
          className="pl-10 h-10 bg-transparent border-0 focus-visible:ring-0 text-base"
        />
      </div>
    </header>
  );
};
