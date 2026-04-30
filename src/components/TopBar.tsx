import {
  Headphones,
  LogIn,
  LogOut,
  Mic,
  MicOff,
  Moon,
  Search as SearchIcon,
  Sun,
  Zap,
  History,
  Loader2,
  Settings,
  X,
  Sparkles,
  Volume2,
  Waves,
  Smartphone,
  CalendarClock,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  addSearchHistory,
  clearSearchHistory,
  getPerfMode,
  getSearchHistory,
  setPerfMode,
} from "@/lib/user-prefs";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { suggestQueries } from "@/lib/music-api";
import { supabase } from "@/integrations/supabase/client";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SessionsPanel } from "@/components/SessionsPanel";

export const TopBar = () => {
  const navigate = useNavigate();
  const loc = useLocation();
  const [q, setQ] = useState("");
  const { user, signOut } = useAuth();
  const { theme, toggleTheme, autoTheme, setAutoTheme } = useTheme();
  const {
    crossfadeSec,
    normalize,
    autoplayContinuity,
    audioEnhance,
    soundQuality,
    bassBoost,
    backgroundPlayback,
    setCrossfade,
    setNormalize,
    setAutoplayContinuity,
    setAudioEnhance,
    setSoundQuality,
    setBassBoost,
    setBackgroundPlayback,
  } = usePlayer();
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

  useEffect(() => {
    if (loc.pathname === "/search") {
      const params = new URLSearchParams(loc.search);
      setQ(params.get("q") || "");
    }
  }, [loc.pathname, loc.search]);

  useEffect(() => {
    if (!q.trim() || q.trim().length < 2) return;
    const id = setTimeout(() => addSearchHistory(q), 1200);
    return () => clearTimeout(id);
  }, [q]);

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

  const clearSearch = () => {
    setQ("");
    setSuggestions([]);
    clearSearchHistory();
    setShowSuggest(false);
    if (loc.pathname === "/search") {
      navigate("/search", { replace: true });
    }
    toast({ title: "Search cleared", description: "History and current query cleared." });
  };

  const startIdentify = async (mode: "recognize" | "hum") => {
    if (identifying) {
      mediaRecRef.current?.stop();
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast({ title: "Not supported", description: "Audio recording isn't supported in this browser." });
      return;
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      toast({ title: "Microphone blocked", description: "Allow microphone access to identify songs." });
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
          toast({ title: `Found: ${data.match.title}`, description: data.match.artist || "" });
          onChange(data.match.searchQuery);
        } else {
          toast({ title: "No match found", description: "Try a louder or longer sample." });
        }
      } catch (e: any) {
        toast({ title: "Recognition failed", description: e?.message || "Please try again." });
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

  const startVoiceSearch = async () => {
    const SR: any =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast({ title: "Voice search not supported", description: "Try Chrome, Edge or Safari." });
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
    sr.onerror = () => setListening(false);
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
          className="pl-11 pr-32 h-11 bg-secondary/60 border border-border rounded-full focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:border-primary/40 text-sm"
        />
        {/* Clear button */}
        {(q || getSearchHistory().length > 0) && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={clearSearch}
            className="absolute right-20 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full text-muted-foreground hover:text-foreground"
            aria-label="Clear search and history"
            title="Clear search and history"
          >
            <X className="w-4 h-4" />
          </Button>
        )}
        {/* Identify */}
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => startIdentify("recognize")}
          className={`absolute right-10 top-1/2 -translate-y-1/2 h-8 w-8 rounded-full ${identifying ? "text-primary animate-pulse" : "text-muted-foreground"}`}
          aria-label={identifying ? "Stop listening" : "Identify song playing nearby"}
          title={identifying ? "Listening… (recording 6s)" : "Identify a song (right-click to hum)"}
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
          title={listening ? "Listening… click to stop" : "Voice search"}
        >
          {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </Button>

        {showSuggest && suggestions.length > 0 && (
          <div className="absolute left-0 right-0 mt-2 bg-popover border border-border rounded-xl shadow-2xl overflow-hidden z-30">
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
        {/* Unified Settings menu */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full h-9 w-9 bg-secondary/60 hover:bg-secondary border border-border"
              aria-label="Settings"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0 max-h-[calc(100vh-5rem)] overflow-y-auto">
            <div className="px-4 py-3 border-b border-border sticky top-0 bg-popover z-10">
              <h4 className="font-semibold text-sm">Settings</h4>
              <p className="text-xs text-muted-foreground">Display, sound, devices & account</p>
            </div>

            {/* Display */}
            <div className="px-4 py-3 border-b border-border space-y-2">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Display</h5>
              <div className="flex items-center justify-between">
                <Label className="text-sm flex items-center gap-2">
                  {theme === "dark" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                  {theme === "dark" ? "Dark mode" : "Light mode"}
                </Label>
                <Switch checked={theme === "light"} onCheckedChange={toggleTheme} disabled={autoTheme} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm flex items-center gap-2">
                    <CalendarClock className="w-4 h-4" /> Auto theme
                  </Label>
                  <p className="text-[10px] text-muted-foreground">Light 6 AM–6 PM, Dark 6 PM–6 AM</p>
                </div>
                <Switch checked={autoTheme} onCheckedChange={setAutoTheme} />
              </div>
            </div>

            {/* Performance */}
            <div className="px-4 py-3 border-b border-border space-y-2">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Performance</h5>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm flex items-center gap-2">
                    <Zap className="w-4 h-4" /> Performance mode
                  </Label>
                  <p className="text-[10px] text-muted-foreground">Lower latency, faster preloads</p>
                </div>
                <Switch
                  checked={perf}
                  onCheckedChange={(v) => { setPerf(v); setPerfMode(v); }}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm flex items-center gap-2">
                    <Smartphone className="w-4 h-4" /> Background playback
                  </Label>
                  <p className="text-[10px] text-muted-foreground">Keep playing when minimized; lock-screen controls</p>
                </div>
                <Switch checked={backgroundPlayback} onCheckedChange={setBackgroundPlayback} />
              </div>
            </div>

            {/* Sound Quality (was Media Quality) */}
            <div className="px-4 py-3 border-b border-border space-y-3">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Volume2 className="w-3.5 h-3.5" /> Sound quality
              </h5>
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="sq-top" className="text-sm">Streaming quality</Label>
                <Select value={soundQuality} onValueChange={(v) => setSoundQuality(v as "high" | "medium" | "low")}>
                  <SelectTrigger id="sq-top" className="h-8 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high" className="text-xs">High</SelectItem>
                    <SelectItem value="medium" className="text-xs">Medium</SelectItem>
                    <SelectItem value="low" className="text-xs">Low</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="bb-top" className="text-sm flex items-center gap-2">
                    <Waves className="w-4 h-4" /> Bass boost
                  </Label>
                  <p className="text-[10px] text-muted-foreground">+7 dB low-shelf below 80 Hz</p>
                </div>
                <Switch id="bb-top" checked={bassBoost} onCheckedChange={setBassBoost} />
              </div>
            </div>

            {/* Playback */}
            <div className="px-4 py-3 border-b border-border space-y-3">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Playback</h5>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="xf-top" className="text-sm">Crossfade</Label>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {crossfadeSec === 0 ? "Off" : `${crossfadeSec}s`}
                  </span>
                </div>
                <Slider id="xf-top" value={[crossfadeSec]} min={0} max={12} step={1}
                  onValueChange={(v) => setCrossfade(v[0])} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="norm-top" className="text-sm">Audio normalization</Label>
                  <p className="text-[10px] text-muted-foreground">~−14 LUFS target</p>
                </div>
                <Switch id="norm-top" checked={normalize} onCheckedChange={setNormalize} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="auto-top" className="text-sm">Autoplay similar songs</Label>
                  <p className="text-[10px] text-muted-foreground">When the queue ends</p>
                </div>
                <Switch id="auto-top" checked={autoplayContinuity} onCheckedChange={setAutoplayContinuity} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <Label htmlFor="enh-top" className="text-sm flex items-center gap-2">
                    <Sparkles className="w-4 h-4" /> Audio enhancer
                  </Label>
                  <p className="text-[10px] text-muted-foreground">Auto EQ, compression & widening</p>
                </div>
                <Switch id="enh-top" checked={audioEnhance} onCheckedChange={setAudioEnhance} />
              </div>
            </div>

            {/* Account */}
            <div className="px-4 py-3 space-y-2">
              <h5 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account</h5>
              {user ? (
                <>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  <div className="flex flex-col gap-1">
                    <Button variant="ghost" size="sm" className="justify-start h-8" onClick={() => navigate("/library")}>
                      Your library
                    </Button>
                    <Button variant="ghost" size="sm" className="justify-start h-8" onClick={() => navigate("/downloads")}>
                      Downloads
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={signOut}
                      className="justify-start h-8 text-destructive hover:text-destructive"
                    >
                      <LogOut className="w-4 h-4 mr-2" /> Sign out
                    </Button>
                  </div>
                </>
              ) : (
                <Button
                  onClick={() => navigate("/auth")}
                  size="sm"
                  className="w-full gap-1.5 font-semibold"
                >
                  <LogIn className="w-4 h-4" />
                  Log in
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Quick login button when signed-out */}
        {!user && (
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
