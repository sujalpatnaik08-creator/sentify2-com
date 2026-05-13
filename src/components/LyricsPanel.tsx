import { usePlayer } from "@/contexts/PlayerContext";
import { useEffect, useMemo, useRef, useState } from "react";
import { fetchLyrics, type LyricLine } from "@/lib/music-api";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Loader2,
  X,
  AlignLeft,
  ListMusic,
  Languages,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Mode = "synced" | "plain";
type Status = "idle" | "loading" | "synced" | "plain" | "none" | "error";

const TRANSLATE_LANGS: { code: string; label: string }[] = [
  { code: "off", label: "Original" },
  { code: "English", label: "English" },
  { code: "Hindi", label: "Hindi (हिन्दी)" },
  { code: "Hinglish", label: "Hinglish (Hindi in Roman)" },
  { code: "Odia", label: "Odia (ଓଡ଼ିଆ)" },
  { code: "Bengali", label: "Bengali (বাংলা)" },
  { code: "Tamil", label: "Tamil (தமிழ்)" },
  { code: "Telugu", label: "Telugu (తెలుగు)" },
  { code: "Marathi", label: "Marathi (मराठी)" },
  { code: "Punjabi", label: "Punjabi (ਪੰਜਾਬੀ)" },
  { code: "Gujarati", label: "Gujarati (ગુજરાતી)" },
  { code: "Urdu", label: "Urdu (اردو)" },
  { code: "Spanish", label: "Spanish (Español)" },
  { code: "French", label: "French (Français)" },
  { code: "German", label: "German (Deutsch)" },
  { code: "Portuguese", label: "Portuguese" },
  { code: "Italian", label: "Italian (Italiano)" },
  { code: "Russian", label: "Russian (Русский)" },
  { code: "Arabic", label: "Arabic (العربية)" },
  { code: "Japanese", label: "Japanese (日本語)" },
  { code: "Korean", label: "Korean (한국어)" },
  { code: "Chinese", label: "Chinese (中文)" },
  { code: "Indonesian", label: "Indonesian" },
  { code: "Turkish", label: "Turkish" },
];

export const LyricsPanel = ({ onClose }: { onClose: () => void }) => {
  const { current, progress, duration, seek } = usePlayer();
  const [plain, setPlain] = useState<string | null>(null);
  const [synced, setSynced] = useState<LyricLine[] | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [mode, setMode] = useState<Mode>("synced");
  const [autoScroll, setAutoScroll] = useState(true);

  // Translation state
  const [targetLang, setTargetLang] = useState<string>("off");
  const [translating, setTranslating] = useState(false);
  const [translatedPlain, setTranslatedPlain] = useState<string | null>(null);
  const [translatedSynced, setTranslatedSynced] = useState<LyricLine[] | null>(
    null,
  );

  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  // Monotonic ids — drop stale fetch / translate responses when the user
  // switches songs quickly (e.g. clicking through search results).
  const lyricsReqIdRef = useRef(0);
  const translateReqIdRef = useRef(0);

  // Fetch lyrics when track changes
  useEffect(() => {
    if (!current) {
      setPlain(null);
      setSynced(null);
      setStatus("idle");
      return;
    }
    const reqId = ++lyricsReqIdRef.current;
    // Bump translate id too so any in-flight translation for the previous
    // track can no longer overwrite the new track's state.
    translateReqIdRef.current++;
    setStatus("loading");
    setPlain(null);
    setSynced(null);
    setTranslatedPlain(null);
    setTranslatedSynced(null);
    fetchLyrics(current.artist, current.title, duration || current.duration)
      .then((res) => {
        if (reqId !== lyricsReqIdRef.current) return;
        setPlain(res.plain);
        setSynced(res.synced);
        if (res.synced && res.synced.length > 0) {
          setStatus("synced");
          setMode("synced");
        } else if (res.plain) {
          setStatus("plain");
          setMode("plain");
        } else {
          setStatus("none");
        }
      })
      .catch(() => {
        if (reqId === lyricsReqIdRef.current) setStatus("error");
      });
  }, [current, duration]);

  // Source lines (for active highlighting + click-to-seek)
  const sourceSynced = synced;
  const displaySynced: LyricLine[] | null = useMemo(() => {
    if (translatedSynced && targetLang !== "off") return translatedSynced;
    return sourceSynced;
  }, [translatedSynced, sourceSynced, targetLang]);

  const displayPlain: string | null = useMemo(() => {
    if (translatedPlain && targetLang !== "off") return translatedPlain;
    return plain;
  }, [translatedPlain, plain, targetLang]);

  const activeIdx = (() => {
    const arr = displaySynced;
    if (!arr || arr.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].time <= progress + 0.05) idx = i;
      else break;
    }
    return idx;
  })();

  const scrollToActive = (smooth = true) => {
    activeLineRef.current?.scrollIntoView({
      behavior: smooth ? "smooth" : "auto",
      block: "center",
    });
  };

  useEffect(() => {
    if (autoScroll && mode === "synced" && activeIdx >= 0) {
      scrollToActive(true);
    }
  }, [activeIdx, autoScroll, mode]);

  const hasSynced = !!displaySynced && displaySynced.length > 0;
  const hasPlain = !!displayPlain;
  const hasOriginal = !!synced || !!plain;

  // Run translation when target changes
  const runTranslate = async (lang: string) => {
    if (lang === "off") {
      setTranslatedPlain(null);
      setTranslatedSynced(null);
      return;
    }
    if (!hasOriginal) return;

    const reqId = ++translateReqIdRef.current;
    setTranslating(true);
    try {
      // Translate synced (preserve timing) if available
      if (synced && synced.length > 0) {
        const joined = synced.map((l) => l.text || "♪").join("\n");
        const { data, error } = await supabase.functions.invoke(
          "translate-lyrics",
          { body: { text: joined, targetLanguage: lang, romanize: false } },
        );
        if (error) throw error;
        if (reqId !== translateReqIdRef.current) return;
        const translated = (data as { translated?: string })?.translated ?? "";
        const lines = translated.split(/\r?\n/);
        const out: LyricLine[] = [];
        for (let i = 0; i < synced.length; i++) {
          out.push({ time: synced[i].time, text: lines[i] ?? "" });
        }
        setTranslatedSynced(out);
        setTranslatedPlain(out.map((l) => l.text).join("\n"));
      } else if (plain) {
        const { data, error } = await supabase.functions.invoke(
          "translate-lyrics",
          { body: { text: plain, targetLanguage: lang, romanize: false } },
        );
        if (error) throw error;
        if (reqId !== translateReqIdRef.current) return;
        const translated = (data as { translated?: string })?.translated ?? "";
        setTranslatedPlain(translated);
      }
    } catch (e: unknown) {
      if (reqId !== translateReqIdRef.current) return;
      const msg =
        typeof e === "object" && e && "message" in e
          ? String((e as { message: unknown }).message)
          : "Translation failed";
      toast.error(msg);
      setTranslatedPlain(null);
      setTranslatedSynced(null);
    } finally {
      if (reqId === translateReqIdRef.current) setTranslating(false);
    }
  };

  // When source lyrics change, clear cached translation
  useEffect(() => {
    setTranslatedPlain(null);
    setTranslatedSynced(null);
  }, [synced, plain]);

  const onLangChange = (next: string) => {
    setTargetLang(next);
    if (next === "off") {
      setTranslatedPlain(null);
      setTranslatedSynced(null);
      return;
    }
    void runTranslate(next);
  };

  const statusLabel = (() => {
    switch (status) {
      case "idle":
        return "Ready";
      case "loading":
        return "Looking up lyrics…";
      case "synced":
        return `Synced • ${synced?.length ?? 0} lines`;
      case "plain":
        return "Plain text";
      case "none":
        return "No lyrics found";
      case "error":
        return "Lookup failed";
    }
  })();

  const onLineClick = (time: number) => {
    if (isFinite(time) && time >= 0) seek(time);
  };

  return (
    <aside className="fixed right-0 top-0 bottom-24 w-full max-w-md glass border-l border-border/50 z-40 flex flex-col animate-fade-in">
      <header className="flex items-center justify-between p-4 border-b border-border/50">
        <div className="min-w-0">
          <h2 className="font-bold text-lg leading-tight">Lyrics</h2>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
            {(status === "loading" || translating) && (
              <Loader2 className="w-3 h-3 animate-spin" />
            )}
            <span className="truncate">
              {translating ? "Translating…" : statusLabel}
            </span>
            {current && (
              <span className="truncate opacity-70">· {current.title}</span>
            )}
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close lyrics">
          <X className="w-4 h-4" />
        </Button>
      </header>

      {/* Mode + scroll controls */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50">
        <div className="inline-flex rounded-md border border-border/60 overflow-hidden">
          <button
            disabled={!hasSynced}
            onClick={() => setMode("synced")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors",
              mode === "synced" && hasSynced
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground",
            )}
            aria-label="Show synced lyrics"
          >
            <ListMusic className="w-3.5 h-3.5" /> Synced
          </button>
          <button
            disabled={!hasPlain && !hasSynced}
            onClick={() => setMode("plain")}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 text-xs transition-colors border-l border-border/60",
              mode === "plain"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground",
            )}
            aria-label="Show unsynced lyrics"
          >
            <AlignLeft className="w-3.5 h-3.5" /> Plain
          </button>
        </div>

        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(e) => setAutoScroll(e.target.checked)}
            className="accent-primary"
          />
          Auto-scroll
        </label>
      </div>

      {/* Translator controls */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border/50">
        <Languages className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <Select value={targetLang} onValueChange={onLangChange}>
          <SelectTrigger className="h-7 text-xs flex-1 min-w-0">
            <SelectValue placeholder="Translate to…" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {TRANSLATE_LANGS.map((l) => (
              <SelectItem key={l.code} value={l.code} className="text-xs">
                {l.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {targetLang !== "off" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => onLangChange("off")}
            title="Show original"
            aria-label="Show original lyrics"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      <ScrollArea className="flex-1 p-6" ref={scrollAreaRef as never}>
        {!current ? (
          <p className="text-muted-foreground text-center mt-8">Play a track to see lyrics</p>
        ) : status === "loading" ? (
          <div className="flex flex-col items-center justify-center mt-8 gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">Fetching lyrics for this track…</p>
          </div>
        ) : status === "error" ? (
          <div className="text-center mt-8 space-y-1">
            <p className="text-muted-foreground">Couldn't load lyrics</p>
            <p className="text-xs text-muted-foreground">Please try another track or retry shortly.</p>
          </div>
        ) : mode === "synced" && hasSynced ? (
          <div className="space-y-3 pb-12">
            {displaySynced!.map((line, i) => {
              const isActive = i === activeIdx;
              const nextTime =
                i + 1 < displaySynced!.length ? displaySynced![i + 1].time : (duration || line.time + 4);
              const span = Math.max(0.25, nextTime - line.time);
              const frac = isActive ? Math.min(1, Math.max(0, (progress - line.time) / span)) : 0;
              return (
                <div
                  key={i}
                  ref={isActive ? activeLineRef : null}
                  onClick={() => onLineClick(line.time)}
                  onWheel={() => setAutoScroll(false)}
                  role="button"
                  tabIndex={0}
                  title="Click to seek to this line"
                  className={cn(
                    "transition-all duration-300 leading-relaxed cursor-pointer rounded px-1 whitespace-pre-line",
                    isActive
                      ? "text-primary font-semibold text-lg scale-[1.02]"
                      : i < activeIdx
                        ? "text-muted-foreground/60 text-base hover:text-foreground"
                        : "text-foreground/70 text-base hover:text-foreground",
                  )}
                >
                  {line.text || "♪"}
                  {isActive && (
                    <div className="mt-1 h-0.5 w-full bg-primary/15 rounded overflow-hidden">
                      <div
                        className="h-full bg-primary transition-[width] duration-200 ease-linear"
                        style={{ width: `${frac * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : mode === "plain" && hasPlain ? (
          <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90">
            {displayPlain}
          </pre>
        ) : mode === "plain" && hasSynced ? (
          // Render synced as plain when user toggled but no plain text exists
          <div className="space-y-2 text-foreground/85 text-sm leading-relaxed">
            {displaySynced!.map((l, i) => (
              <div key={i} className="whitespace-pre-line">{l.text || "♪"}</div>
            ))}
          </div>
        ) : (
          <div className="text-center mt-8 space-y-2">
            <p className="text-muted-foreground">No lyrics available</p>
            <p className="text-xs text-muted-foreground">
              We couldn't find lyrics for this track.
            </p>
          </div>
        )}
      </ScrollArea>
    </aside>
  );
};
