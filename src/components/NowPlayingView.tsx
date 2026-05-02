// Spotify-style full-screen "Now Playing" view.
// Opened from the PlayerBar by clicking the album art or via swipe-up on
// touch devices. Provides:
//   • Hero artwork + transport controls
//   • Real-time scrolling lyrics with click-to-seek + translator
//   • Expandable full-screen lyrics mode
//   • "About the artist" card (Wikipedia bio + image)
//   • SongDNA (credits, source, identifiers — best-effort from track meta)
//
// Built as a Radix Dialog so it traps focus, supports Escape to close,
// and lays out cleanly on mobile + desktop. Swipe-down on the drag-handle
// closes it on touch devices.

import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ChevronDown,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Repeat,
  Repeat1,
  Heart,
  Maximize2,
  Minimize2,
  Loader2,
  Languages,
  RotateCcw,
  ExternalLink,
  Music2,
  Disc3,
  User,
} from "lucide-react";
import { usePlayer } from "@/contexts/PlayerContext";
import { fetchLyrics, type LyricLine } from "@/lib/music-api";
import { getArtistInfo, type ArtistInfo } from "@/lib/artist-info";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

const TRANSLATE_LANGS: { code: string; label: string }[] = [
  { code: "off", label: "Original" },
  { code: "English", label: "English" },
  { code: "Hindi", label: "Hindi (हिन्दी)" },
  { code: "Hinglish", label: "Hinglish" },
  { code: "Spanish", label: "Spanish" },
  { code: "French", label: "French" },
  { code: "German", label: "German" },
  { code: "Portuguese", label: "Portuguese" },
  { code: "Japanese", label: "Japanese" },
  { code: "Korean", label: "Korean" },
  { code: "Arabic", label: "Arabic" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const NowPlayingView = ({ open, onOpenChange }: Props) => {
  const {
    current,
    isPlaying,
    progress,
    duration,
    shuffle,
    repeat,
    togglePlay,
    next,
    prev,
    seek,
    toggleShuffle,
    cycleRepeat,
  } = usePlayer();

  const [tab, setTab] = useState<"lyrics" | "artist" | "dna">("lyrics");
  const [lyricsExpanded, setLyricsExpanded] = useState(false);
  const [liked, setLiked] = useState(false);

  // Lyrics state — `synced` and `plain` are the SOURCE (untranslated) copies.
  // Translations are stored separately in `translatedSynced` / `translatedPlain`,
  // but timing/click-to-seek ALWAYS uses the source `synced` array so the
  // highlighted line and seek targets never drift due to translation.
  const [plain, setPlain] = useState<string | null>(null);
  const [synced, setSynced] = useState<LyricLine[] | null>(null);
  const [lyricsStatus, setLyricsStatus] =
    useState<"idle" | "loading" | "ready" | "none" | "error">("idle");
  const [targetLang, setTargetLang] = useState<string>("off");
  // The language that is currently being fetched (for per-language spinner).
  const [translatingLang, setTranslatingLang] = useState<string | null>(null);
  const [translatedSynced, setTranslatedSynced] = useState<LyricLine[] | null>(null);
  const [translatedPlain, setTranslatedPlain] = useState<string | null>(null);
  const activeLineRef = useRef<HTMLDivElement | null>(null);

  // Per-track translation cache. Cleared when track changes.
  // Key: target language. Value: { synced?: LyricLine[]; plain?: string }.
  const translationCacheRef = useRef<
    Map<string, { synced: LyricLine[] | null; plain: string | null }>
  >(new Map());
  // Monotonic request id so out-of-order responses can't overwrite newer ones.
  const translateReqIdRef = useRef(0);
  // Debounce timer for language switching.
  const langDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Artist info
  const [artistInfo, setArtistInfo] = useState<ArtistInfo | null>(null);
  const [artistLoading, setArtistLoading] = useState(false);

  // Touch swipe-down to close
  const touchStartY = useRef<number | null>(null);

  // ---- Fetch lyrics whenever the track changes (and the dialog is open) ----
  useEffect(() => {
    if (!open || !current) return;
    let cancelled = false;
    setLyricsStatus("loading");
    setPlain(null);
    setSynced(null);
    setTranslatedPlain(null);
    setTranslatedSynced(null);
    setTargetLang("off");
    setTranslatingLang(null);
    translationCacheRef.current = new Map();
    translateReqIdRef.current++;
    if (langDebounceRef.current) {
      clearTimeout(langDebounceRef.current);
      langDebounceRef.current = null;
    }
    fetchLyrics(current.artist, current.title, duration || current.duration)
      .then((res) => {
        if (cancelled) return;
        setPlain(res.plain);
        setSynced(res.synced);
        if ((res.synced && res.synced.length > 0) || res.plain) {
          setLyricsStatus("ready");
        } else {
          setLyricsStatus("none");
        }
      })
      .catch(() => {
        if (!cancelled) setLyricsStatus("error");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, open]);

  // ---- Fetch artist info on track change ----
  useEffect(() => {
    if (!open || !current?.artist) return;
    let cancelled = false;
    setArtistInfo(null);
    setArtistLoading(true);
    getArtistInfo(current.artist)
      .then((info) => { if (!cancelled) setArtistInfo(info); })
      .finally(() => { if (!cancelled) setArtistLoading(false); });
    return () => { cancelled = true; };
  }, [current?.artist, open]);

  // Display lines = translated when available + selected, else source.
  // CRITICAL: timing always references `synced` (the source) — translated
  // lines reuse the source `time` field so highlight + click-to-seek stay
  // perfectly aligned regardless of translation state.
  const showTranslated = targetLang !== "off" && !!translatedSynced;
  const displaySynced = showTranslated ? translatedSynced : synced;
  const displayPlain =
    targetLang !== "off" && translatedPlain ? translatedPlain : plain;

  // Active line index — ALWAYS computed against the source `synced` array
  // so it never jumps around when a translation arrives or is cleared.
  const activeIdx = useMemo(() => {
    if (!synced || synced.length === 0) return -1;
    let idx = -1;
    for (let i = 0; i < synced.length; i++) {
      if (synced[i].time <= progress + 0.05) idx = i;
      else break;
    }
    return idx;
  }, [synced, progress]);

  // Auto-scroll active line into view (synced + smooth, but only if visible)
  useEffect(() => {
    if (activeIdx >= 0 && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeIdx]);

  // Run a translation for the given language, with caching + race-protection.
  const runTranslate = async (lang: string) => {
    if (lang === "off") {
      setTranslatedPlain(null);
      setTranslatedSynced(null);
      setTranslatingLang(null);
      return;
    }
    if (!plain && !synced) return;

    // Cache hit — apply instantly, no network round-trip.
    const cached = translationCacheRef.current.get(lang);
    if (cached) {
      setTranslatedSynced(cached.synced);
      setTranslatedPlain(cached.plain);
      setTranslatingLang(null);
      return;
    }

    const reqId = ++translateReqIdRef.current;
    setTranslatingLang(lang);
    try {
      if (synced && synced.length > 0) {
        const joined = synced.map((l) => l.text || "♪").join("\n");
        const { data, error } = await supabase.functions.invoke("translate-lyrics", {
          body: { text: joined, targetLanguage: lang, romanize: false },
        });
        if (error) throw error;
        // Drop stale responses (track or language changed mid-flight).
        if (reqId !== translateReqIdRef.current) return;
        const translated = (data as { translated?: string })?.translated ?? "";
        const lines = translated.split(/\r?\n/);
        // Reuse SOURCE time for every translated line so timing is identical.
        const out: LyricLine[] = synced.map((l, i) => ({
          time: l.time,
          text: lines[i] ?? "",
        }));
        const cachedEntry = { synced: out, plain: out.map((l) => l.text).join("\n") };
        translationCacheRef.current.set(lang, cachedEntry);
        setTranslatedSynced(out);
        setTranslatedPlain(cachedEntry.plain);
      } else if (plain) {
        const { data, error } = await supabase.functions.invoke("translate-lyrics", {
          body: { text: plain, targetLanguage: lang, romanize: false },
        });
        if (error) throw error;
        if (reqId !== translateReqIdRef.current) return;
        const translated = (data as { translated?: string })?.translated ?? "";
        translationCacheRef.current.set(lang, { synced: null, plain: translated });
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
      // Only clear loader if this is still the latest request.
      if (reqId === translateReqIdRef.current) setTranslatingLang(null);
    }
  };

  const onLangChange = (next: string) => {
    setTargetLang(next);
    if (next === "off") {
      // Clear immediately on "Original" — no debounce needed.
      void runTranslate("off");
      return;
    }
    // Cache hit applies synchronously — debounce only the network case.
    const cached = translationCacheRef.current.get(next);
    if (cached) {
      setTranslatedSynced(cached.synced);
      setTranslatedPlain(cached.plain);
      setTranslatingLang(null);
      return;
    }
    if (langDebounceRef.current) clearTimeout(langDebounceRef.current);
    langDebounceRef.current = setTimeout(() => {
      void runTranslate(next);
    }, 300);
  };

  // Cleanup pending debounce on unmount
  useEffect(() => {
    return () => {
      if (langDebounceRef.current) clearTimeout(langDebounceRef.current);
    };
  }, []);

  // Click-to-seek — `time` comes from the displayed line, but since we copy
  // the source time onto every translated line above, this is always correct.
  const onLineClick = (time: number) => {
    if (isFinite(time) && time >= 0) seek(time);
  };

  // Touch swipe-down to dismiss
  const onTouchStart = (e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartY.current == null) return;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (dy > 90) onOpenChange(false);
    touchStartY.current = null;
  };

  if (!current) return null;

  const heroBg = artistInfo?.image || current.artwork;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-full w-screen h-[100dvh] sm:h-[100dvh] p-0 gap-0 border-0 rounded-none overflow-hidden bg-background"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Background hero — blurred artwork or artist image */}
        <div className="absolute inset-0 -z-10">
          <img
            src={heroBg}
            alt=""
            aria-hidden
            className="w-full h-full object-cover blur-2xl scale-110 opacity-40"
            onError={(e) => ((e.target as HTMLImageElement).src = "/placeholder.svg")}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/70 to-background" />
        </div>

        {/* Top bar */}
        <header className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onOpenChange(false)}
            aria-label="Close now playing"
          >
            <ChevronDown className="w-6 h-6" />
          </Button>
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Now Playing
            </div>
            <div className="text-xs font-medium truncate max-w-[55vw]">
              {current.album || current.artist}
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLiked((v) => !v)}
            aria-label={liked ? "Unlike" : "Like"}
          >
            <Heart className={cn("w-5 h-5", liked && "fill-primary text-primary")} />
          </Button>
        </header>

        {/* Body — two layouts: lyrics-expanded vs default */}
        {lyricsExpanded ? (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex items-center justify-between px-4 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <img
                  src={current.artwork}
                  alt=""
                  className="w-10 h-10 rounded shadow-md object-cover"
                />
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{current.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{current.artist}</div>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLyricsExpanded(false)}
                aria-label="Exit fullscreen lyrics"
              >
                <Minimize2 className="w-5 h-5" />
              </Button>
            </div>
            <LyricsBlock
              status={lyricsStatus}
              translatingLang={translatingLang}
              displaySynced={displaySynced}
              displayPlain={displayPlain}
              activeIdx={activeIdx}
              activeLineRef={activeLineRef}
              onLineClick={onLineClick}
              targetLang={targetLang}
              onLangChange={onLangChange}
              big
            />
          </div>
        ) : (
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-4 pb-8 max-w-2xl mx-auto w-full">
              {/* Hero artwork */}
              <div className="aspect-square w-full max-w-sm mx-auto mt-2 rounded-2xl overflow-hidden shadow-2xl">
                <img
                  src={current.artwork}
                  alt={current.title}
                  className="w-full h-full object-cover"
                  onError={(e) => ((e.target as HTMLImageElement).src = "/placeholder.svg")}
                />
              </div>

              {/* Title + artist */}
              <div className="mt-5 text-center">
                <h1 className="text-xl sm:text-2xl font-bold truncate">{current.title}</h1>
                <p className="text-sm text-muted-foreground truncate mt-0.5">{current.artist}</p>
              </div>

              {/* Seek bar */}
              <div className="mt-4">
                <Slider
                  value={[progress]}
                  max={duration || 1}
                  step={1}
                  onValueChange={(v) => seek(v[0])}
                  aria-label="Seek"
                />
                <div className="flex items-center justify-between text-xs text-muted-foreground mt-1 tabular-nums">
                  <span>{fmt(progress)}</span>
                  <span>{fmt(duration)}</span>
                </div>
              </div>

              {/* Transport */}
              <div className="flex items-center justify-between mt-3 px-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleShuffle}
                  className={cn("h-10 w-10", shuffle && "text-primary")}
                  aria-label="Shuffle"
                >
                  <Shuffle className="w-5 h-5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={prev} className="h-12 w-12" aria-label="Previous">
                  <SkipBack className="w-6 h-6 fill-current" />
                </Button>
                <Button
                  onClick={togglePlay}
                  className="h-16 w-16 rounded-full bg-foreground text-background hover:bg-foreground hover:scale-105 transition-transform p-0"
                  aria-label={isPlaying ? "Pause" : "Play"}
                >
                  {isPlaying ? <Pause className="w-7 h-7 fill-current" /> : <Play className="w-7 h-7 fill-current ml-0.5" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={next} className="h-12 w-12" aria-label="Next">
                  <SkipForward className="w-6 h-6 fill-current" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={cycleRepeat}
                  className={cn("h-10 w-10", repeat !== "off" && "text-primary")}
                  aria-label="Repeat"
                >
                  {repeat === "one" ? <Repeat1 className="w-5 h-5" /> : <Repeat className="w-5 h-5" />}
                </Button>
              </div>

              {/* Tab switcher */}
              <div className="mt-6 grid grid-cols-3 gap-1 rounded-lg bg-muted/40 p-1">
                <TabBtn active={tab === "lyrics"} onClick={() => setTab("lyrics")} icon={<Music2 className="w-4 h-4" />} label="Lyrics" />
                <TabBtn active={tab === "artist"} onClick={() => setTab("artist")} icon={<User className="w-4 h-4" />} label="Artist" />
                <TabBtn active={tab === "dna"} onClick={() => setTab("dna")} icon={<Disc3 className="w-4 h-4" />} label="SongDNA" />
              </div>

              {/* Tab content */}
              <div className="mt-4">
                {tab === "lyrics" && (
                  <div className="rounded-xl bg-card/60 border border-border/50 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-semibold">Lyrics</h3>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLyricsExpanded(true)}
                        className="h-7 gap-1 text-xs"
                      >
                        <Maximize2 className="w-3.5 h-3.5" /> Expand
                      </Button>
                    </div>
                    <LyricsBlock
                      status={lyricsStatus}
                      translatingLang={translatingLang}
                      displaySynced={displaySynced}
                      displayPlain={displayPlain}
                      activeIdx={activeIdx}
                      activeLineRef={activeLineRef}
                      onLineClick={onLineClick}
                      targetLang={targetLang}
                      onLangChange={onLangChange}
                    />
                  </div>
                )}

                {tab === "artist" && (
                  <ArtistCard
                    artist={current.artist}
                    info={artistInfo}
                    loading={artistLoading}
                  />
                )}

                {tab === "dna" && <SongDNA track={current} />}
              </div>
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
};

// --- Subcomponents ---

const TabBtn = ({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) => (
  <button
    onClick={onClick}
    className={cn(
      "flex items-center justify-center gap-1.5 py-2 rounded-md text-xs font-medium transition-colors",
      active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
    )}
  >
    {icon}
    {label}
  </button>
);

interface LyricsBlockProps {
  status: "idle" | "loading" | "ready" | "none" | "error";
  // The language currently being fetched (null when idle). Used for per-language
  // loading states next to the dropdown so the lyrics body never flashes.
  translatingLang: string | null;
  displaySynced: LyricLine[] | null;
  displayPlain: string | null;
  activeIdx: number;
  activeLineRef: React.MutableRefObject<HTMLDivElement | null>;
  onLineClick: (t: number) => void;
  targetLang: string;
  onLangChange: (l: string) => void;
  big?: boolean;
}

const LyricsBlock = ({
  status,
  translatingLang,
  displaySynced,
  displayPlain,
  activeIdx,
  activeLineRef,
  onLineClick,
  targetLang,
  onLangChange,
  big,
}: LyricsBlockProps) => {
  // Subtle dim when a translation is in flight so the lyrics body never flashes
  // empty / re-mounts. Source lines stay in place; translation swaps in once
  // ready. Combined with stable line keys (time-based) below, this prevents
  // the previous "glitchy" re-render seen on language change.
  const isTranslatingNew = !!translatingLang && translatingLang !== "off";
  const translatingLabel = TRANSLATE_LANGS.find((l) => l.code === translatingLang)?.label;
  return (
    <>
      <div className="flex items-center gap-2 mb-3 px-1">
        <Languages className="w-4 h-4 text-muted-foreground shrink-0" />
        <Select value={targetLang} onValueChange={onLangChange}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue placeholder="Translate to…" />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            {TRANSLATE_LANGS.map((l) => {
              const loading = translatingLang === l.code;
              return (
                <SelectItem key={l.code} value={l.code} className="text-xs">
                  <span className="inline-flex items-center gap-1.5">
                    {loading && <Loader2 className="w-3 h-3 animate-spin" />}
                    {l.label}
                  </span>
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
        {targetLang !== "off" && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => onLangChange("off")}
            aria-label="Show original"
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
        )}
        {isTranslatingNew && (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
            <span className="hidden sm:inline">Translating to {translatingLabel}…</span>
          </span>
        )}
      </div>

      <ScrollArea className={cn(big ? "h-[calc(100dvh-220px)]" : "max-h-[40vh]")}>
        <div
          className={cn(
            "px-2 pb-8 transition-opacity duration-200",
            isTranslatingNew && "opacity-70",
          )}
        >
          {status === "loading" ? (
            <div className="flex flex-col items-center mt-6 gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-primary" />
              <p className="text-xs text-muted-foreground">Loading lyrics…</p>
            </div>
          ) : status === "error" ? (
            <p className="text-center text-sm text-muted-foreground mt-6">Couldn't load lyrics.</p>
          ) : status === "none" ? (
            <p className="text-center text-sm text-muted-foreground mt-6">No lyrics available for this track.</p>
          ) : displaySynced && displaySynced.length > 0 ? (
            <div className={cn("space-y-2", big && "space-y-4")}>
              {displaySynced.map((line, i) => {
                const isActive = i === activeIdx;
                // Stable, time-based key so React reuses the same DOM nodes
                // when the text changes (translation swap) — preventing the
                // re-mount flicker and keeping the active highlight steady.
                return (
                  <div
                    key={`${line.time.toFixed(3)}-${i}`}
                    ref={isActive ? activeLineRef : null}
                    onClick={() => onLineClick(line.time)}
                    className={cn(
                      "cursor-pointer rounded leading-relaxed whitespace-pre-line px-1",
                      "transition-colors duration-200",
                      big ? "text-lg sm:text-xl" : "text-sm",
                      isActive
                        ? "text-primary font-semibold"
                        : i < activeIdx
                          ? "text-muted-foreground/60 hover:text-foreground"
                          : "text-foreground/75 hover:text-foreground",
                    )}
                  >
                    {line.text || "♪"}
                  </div>
                );
              })}
            </div>
          ) : displayPlain ? (
            <pre className={cn("whitespace-pre-wrap font-sans text-foreground/85", big ? "text-base" : "text-sm")}>
              {displayPlain}
            </pre>
          ) : null}
        </div>
      </ScrollArea>
    </>
  );
};

const ArtistCard = ({
  artist,
  info,
  loading,
}: {
  artist: string;
  info: ArtistInfo | null;
  loading: boolean;
}) => {
  const [following, setFollowing] = useState(false);
  return (
    <div className="rounded-xl overflow-hidden bg-card/60 border border-border/50">
      {/* Background image header */}
      <div
        className="relative h-32 sm:h-40 bg-muted"
        style={
          info?.image
            ? { backgroundImage: `url(${info.image})`, backgroundSize: "cover", backgroundPosition: "center" }
            : undefined
        }
      >
        <div className="absolute inset-0 bg-gradient-to-t from-card via-card/40 to-transparent" />
        <div className="absolute bottom-2 left-3 right-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">About the artist</div>
            <div className="text-lg font-bold truncate">{info?.name || artist}</div>
          </div>
          <Button
            size="sm"
            variant={following ? "secondary" : "default"}
            onClick={() => setFollowing((v) => !v)}
            className="shrink-0"
          >
            {following ? "Following" : "Follow"}
          </Button>
        </div>
      </div>
      <div className="p-3">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading bio…
          </div>
        ) : info?.bio ? (
          <>
            <p className="text-sm text-foreground/85 leading-relaxed">{info.bio}</p>
            {info.url && (
              <a
                href={info.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
              >
                Read more on Wikipedia <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No bio available for this artist yet.
          </p>
        )}
      </div>
    </div>
  );
};

const SongDNA = ({ track }: { track: NonNullable<ReturnType<typeof usePlayer>["current"]> }) => {
  // Best-effort, source-aware credits. We don't have a full music-credits
  // database, so we surface what we know (source platform, identifiers,
  // primary artist) plus a placeholder structure for producers/writers/
  // performers/samples that can be filled by future integrations
  // (e.g. MusicBrainz, Genius, ISRC lookups).
  const Row = ({ label, value }: { label: string; value: string }) => (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-border/40 last:border-0">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground/90 text-right truncate">{value}</span>
    </div>
  );
  return (
    <div className="rounded-xl bg-card/60 border border-border/50 p-4 space-y-3">
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Disc3 className="w-4 h-4 text-primary" /> SongDNA
        </h3>
        <p className="text-xs text-muted-foreground">Credits, identifiers, samples & covers.</p>
      </div>

      <section>
        <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Track</h4>
        <Row label="Title" value={track.title} />
        <Row label="Performer" value={track.artist} />
        {track.album && <Row label="Album" value={track.album} />}
        <Row label="Source" value={track.source === "youtube" ? "YouTube" : "Audius"} />
        <Row label="Identifier" value={track.id} />
        <Row label="Duration" value={fmt(track.duration)} />
      </section>

      <section>
        <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Credits</h4>
        <p className="text-xs text-muted-foreground">
          Detailed producer, writer and performer credits will appear here when a credits provider is connected.
        </p>
      </section>

      <section>
        <h4 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">Samples & covers</h4>
        <p className="text-xs text-muted-foreground">
          No sample data available for this track.
        </p>
      </section>
    </div>
  );
};
