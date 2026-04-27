import { LogIn, LogOut, Mic, MicOff, Moon, Search as SearchIcon, Sun, User, Zap } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { addSearchHistory, getPerfMode, setPerfMode } from "@/lib/user-prefs";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

export const TopBar = () => {
  const navigate = useNavigate();
  const loc = useLocation();
  const [q, setQ] = useState("");
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [perf, setPerf] = useState(getPerfMode());
  const [listening, setListening] = useState(false);
  const recognitionRef = (typeof window !== "undefined" ? (window as any) : {}) as any;

  // Sync from URL when on /search
  useEffect(() => {
    if (loc.pathname === "/search") {
      const params = new URLSearchParams(loc.search);
      setQ(params.get("q") || "");
    }
  }, [loc.pathname, loc.search]);

  // Persist completed queries to history (debounced)
  useEffect(() => {
    if (!q.trim() || q.trim().length < 2) return;
    const id = setTimeout(() => addSearchHistory(q), 1200);
    return () => clearTimeout(id);
  }, [q]);

  const onChange = (val: string) => {
    setQ(val);
    const params = new URLSearchParams();
    if (val) params.set("q", val);
    navigate(`/search${params.toString() ? `?${params.toString()}` : ""}`, {
      replace: loc.pathname === "/search",
    });
  };

  return (
    <header className="sticky top-0 z-20 h-16 bg-background/70 backdrop-blur-xl border-b border-border/50 flex items-center px-6 gap-4">
      <div className="relative flex-1 max-w-2xl">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search songs, artists, albums…"
          className="pl-11 pr-12 h-11 bg-secondary/60 border border-border/60 rounded-full focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/40 text-sm"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => {
            const SR: any =
              (window as any).SpeechRecognition ||
              (window as any).webkitSpeechRecognition;
            if (!SR) {
              toast({ title: "Voice search unavailable", description: "Your browser does not support speech recognition." });
              return;
            }
            if (listening && recognitionRef._sr) {
              try { recognitionRef._sr.stop(); } catch { /* ignore */ }
              setListening(false);
              return;
            }
            const sr = new SR();
            sr.lang = navigator.language || "en-US";
            sr.interimResults = true;
            sr.continuous = false;
            sr.maxAlternatives = 1;
            recognitionRef._sr = sr;
            setListening(true);
            sr.onresult = (e: any) => {
              const text = Array.from(e.results)
                .map((r: any) => r[0]?.transcript || "")
                .join(" ")
                .trim();
              if (text) onChange(text);
            };
            sr.onerror = () => { setListening(false); };
            sr.onend = () => { setListening(false); };
            try { sr.start(); } catch { setListening(false); }
          }}
          className={`absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full ${listening ? "text-primary animate-pulse" : "text-muted-foreground"}`}
          aria-label={listening ? "Stop voice search" : "Start voice search"}
          title={listening ? "Listening… click to stop" : "Voice search"}
        >
          {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </Button>
      </div>

      {/* Right: perf mode + theme toggle + account / login */}
      <div className="ml-auto flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => { const next = !perf; setPerf(next); setPerfMode(next); }}
          className={`rounded-full h-9 w-9 bg-secondary/60 hover:bg-secondary border border-border/60 ${perf ? "text-primary" : ""}`}
          aria-label={perf ? "Disable Performance Mode" : "Enable Performance Mode"}
          title={perf ? "Performance Mode: ON (low latency)" : "Performance Mode: OFF"}
        >
          <Zap className={`w-4 h-4 ${perf ? "fill-current" : ""}`} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="rounded-full h-9 w-9 bg-secondary/60 hover:bg-secondary border border-border/60"
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          title={theme === "dark" ? "Light mode" : "Dark mode"}
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </Button>
        {user ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full h-9 w-9 bg-secondary/60 hover:bg-secondary border border-border/50"
                aria-label="Account"
              >
                <User className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/library")}>
                Your library
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/downloads")}>
                Downloads
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={signOut} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button
            onClick={() => navigate("/auth")}
            size="sm"
            className="rounded-full gap-1.5 px-4 h-9 font-semibold"
            aria-label="Log in"
          >
            <LogIn className="w-4 h-4" />
            Log in
          </Button>
        )}
      </div>
    </header>
  );
};
