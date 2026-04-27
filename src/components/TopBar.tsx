import { Headphones, LogIn, LogOut, Mic, MicOff, Moon, Search as SearchIcon, Sun, User, Zap, History, Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { addSearchHistory, getPerfMode, getSearchHistory, setPerfMode } from "@/lib/user-prefs";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { suggestQueries } from "@/lib/music-api";
import { supabase } from "@/integrations/supabase/client";
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
  const [identifying, setIdentifying] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const recognitionRef = (typeof window !== "undefined" ? (window as any) : {}) as any;
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const speechSupported =
    typeof window !== "undefined" &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

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

  // Predictive autocomplete: debounce and merge recent history
  useEffect(() => {
    const v = q.trim();
    if (!v) {
      const hist = getSearchHistory().slice(0, 6);
      setSuggestions(hist);
      return;
    }
    const id = setTimeout(async () => {
      const [remote] = await Promise.all([suggestQueries(v)]);
      const hist = getSearchHistory().filter(
        (h) => h.toLowerCase().includes(v.toLowerCase()),
      ).slice(0, 3);
      const merged: string[] = [];
      for (const item of [...hist, ...remote]) {
        if (!merged.some((x) => x.toLowerCase() === item.toLowerCase())) merged.push(item);
        if (merged.length >= 8) break;
      }
      setSuggestions(merged);
    }, 120);
    return () => clearTimeout(id);
  }, [q]);

  // Close suggestions on outside click
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setShowSuggest(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const onChange = (val: string) => {
    setQ(val);
    setActiveIdx(-1);
    setShowSuggest(true);
    const params = new URLSearchParams();
    if (val) params.set("q", val);
    navigate(`/search${params.toString() ? `?${params.toString()}` : ""}`, {
      replace: loc.pathname === "/search",
    });
  };

  const pickSuggestion = (s: string) => {
    setShowSuggest(false);
    setActiveIdx(-1);
    onChange(s);
    addSearchHistory(s);
  };

  // ---- Shazam-style identify (record ~6s and call recognize-song) ----
  const startIdentify = async (mode: "recognize" | "hum") => {
    if (identifying) {
      mediaRecRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast({
        title: "Not supported",
        description: "Audio recording isn't supported in this browser.",
      });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast({
        title: "Microphone blocked",
        description: "Allow microphone access to identify songs.",
      });
      return;
    }
    const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "";
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    mediaRecRef.current = rec;
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      setIdentifying(false);
      const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
      if (blob.size < 2000) {
        toast({ title: "Sample too short", description: "Try again with a clearer sample." });
        return;
      }
      // base64 encode
      const buf = new Uint8Array(await blob.arrayBuffer());
      let binary = "";
      for (let i = 0; i < buf.length; i++) binary += String.fromCharCode(buf[i]);
      const audioBase64 = btoa(binary);
      try {
        toast({ title: "Identifying…", description: "Matching the sample to millions of songs." });
        const { data, error } = await supabase.functions.invoke("recognize-song", {
          body: { audioBase64, mimeType: blob.type, mode },
        });
        if (error) throw error;
        if (data?.error) {
          toast({ title: "Couldn't identify", description: data.error });
          return;
        }
        if (data?.match?.searchQuery) {
          toast({
            title: `Found: ${data.match.title}`,
            description: data.match.artist || "",
          });
          onChange(data.match.searchQuery);
        } else {
          toast({ title: "No match found", description: "Try a louder or longer sample." });
        }
      } catch (e: any) {
        toast({
          title: "Recognition failed",
          description: e?.message || "Please try again.",
        });
      }
    };
    setIdentifying(true);
    rec.start();
    toast({
      title: mode === "hum" ? "Hum the tune…" : "Listening…",
      description: "Recording a 6-second sample.",
    });
    setTimeout(() => { try { rec.state === "recording" && rec.stop(); } catch { /* */ } }, 6000);
  };

  // ---- Voice search (Web Speech API) ----
  const startVoiceSearch = async () => {
    const SR: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast({
        title: "Voice search not supported",
        description: "Try Chrome, Edge or Safari — meanwhile you can type your search.",
      });
      return;
    }
    if (listening && recognitionRef._sr) {
      try { recognitionRef._sr.stop(); } catch { /* ignore */ }
      setListening(false);
      return;
    }
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch {
      toast({ title: "Microphone blocked", description: "Allow mic access for voice search." });
      return;
    }
    const sr = new SR();
    sr.lang = navigator.language || "en-US";
    sr.interimResults = true;
    sr.continuous = false;
    sr.maxAlternatives = 1;
    recognitionRef._sr = sr;
    setListening(true);
    toast({ title: "Listening…", description: "Speak now to search." });
    sr.onresult = (e: any) => {
      const text = Array.from(e.results)
        .map((r: any) => r[0]?.transcript || "")
        .join(" ")
        .trim();
      if (text) onChange(text);
    };
    sr.onerror = (e: any) => {
      setListening(false);
      const err = e?.error || "";
      if (err === "not-allowed" || err === "service-not-allowed") {
        toast({ title: "Microphone blocked", description: "Enable mic permission." });
      } else if (err === "no-speech") {
        toast({ title: "Didn't catch that", description: "No speech detected — try again." });
      } else if (err && err !== "aborted") {
        toast({ title: "Voice search error", description: String(err) });
      }
    };
    sr.onend = () => { setListening(false); };
    try { sr.start(); } catch { setListening(false); }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSuggest || suggestions.length === 0) {
      if (e.key === "Enter" && q.trim()) addSearchHistory(q);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(suggestions.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(-1, i - 1));
    } else if (e.key === "Enter") {
      if (activeIdx >= 0) {
        e.preventDefault();
        pickSuggestion(suggestions[activeIdx]);
      } else if (q.trim()) {
        addSearchHistory(q);
        setShowSuggest(false);
      }
    } else if (e.key === "Escape") {
      setShowSuggest(false);
    }
  };

  return (
    <header className="sticky top-0 z-20 h-16 bg-background/70 backdrop-blur-xl border-b border-border/50 flex items-center px-6 gap-4">
      <div ref={wrapRef} className="relative flex-1 max-w-2xl">
        <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setShowSuggest(true)}
          onKeyDown={onKeyDown}
          placeholder="Search songs, artists, albums…"
          className="pl-11 pr-24 h-11 bg-secondary/60 border border-border/60 rounded-full focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/40 text-sm"
        />
        {/* Identify (Shazam-style) */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => startIdentify("recognize")}
          className={`absolute right-10 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full ${identifying ? "text-primary animate-pulse" : "text-muted-foreground"}`}
          aria-label={identifying ? "Stop listening" : "Identify song playing nearby"}
          title={identifying ? "Listening… (recording 6s)" : "Identify a song playing nearby (or click & hum)"}
          onContextMenu={(e) => { e.preventDefault(); startIdentify("hum"); }}
        >
          {identifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Headphones className="w-4 h-4" />}
        </Button>
        {/* Voice search */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!speechSupported}
          onClick={startVoiceSearch}
          className={`absolute right-1.5 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full ${listening ? "text-primary animate-pulse" : "text-muted-foreground"} ${!speechSupported ? "opacity-40 cursor-not-allowed" : ""}`}
          aria-label={listening ? "Stop voice search" : "Voice search"}
          title={!speechSupported ? "Voice search isn't supported in this browser" : listening ? "Listening… click to stop" : "Voice search"}
        >
          {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </Button>

        {/* Autocomplete dropdown */}
        {showSuggest && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 mt-2 bg-popover border border-border/60 rounded-xl shadow-2xl overflow-hidden z-30">
            <ul className="py-1 max-h-80 overflow-y-auto">
              {suggestions.map((s, i) => {
                const isHist = !q.trim() || getSearchHistory().some((h) => h.toLowerCase() === s.toLowerCase());
                return (
                  <li key={s + i}>
                    <button
                      type="button"
                      onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                      onMouseEnter={() => setActiveIdx(i)}
                      className={`w-full text-left px-4 py-2 text-sm flex items-center gap-3 transition-colors ${activeIdx === i ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"}`}
                    >
                      {isHist ? (
                        <History className="w-4 h-4 text-muted-foreground shrink-0" />
                      ) : (
                        <SearchIcon className="w-4 h-4 text-muted-foreground shrink-0" />
                      )}
                      <span className="truncate">{s}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

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
              <DropdownMenuItem onClick={() => navigate("/library")}>Your library</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/downloads")}>Downloads</DropdownMenuItem>
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
