// Upload local audio files for analysis + playback.
// Files are persisted in IndexedDB; AI + DSP run on add.

import { useEffect, useRef, useState } from "react";
import { Helmet } from "react-helmet-async";
import { Upload as UploadIcon, Loader2, Trash2, RefreshCw, Play, FileMusic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { usePlayer } from "@/contexts/PlayerContext";
import { Navigate } from "react-router-dom";
import {
  deleteUpload,
  getUpload,
  listUploads,
  putUpload,
  getAnalysis,
  putAnalysis,
} from "@/lib/analysis-store";
import { analyzeTrack, useAnalysis } from "@/lib/musicologist";
import { AnalysisBadges } from "@/components/AnalysisBadges";
import type { LocalUpload } from "@/types/analysis";
import type { Track } from "@/types/music";
import { Input } from "@/components/ui/input";
import { Sparkles, Check } from "lucide-react";

const MAX_FILE_BYTES = 30 * 1024 * 1024; // 30 MB

const trackIdFromFile = async (file: File) => {
  // Hash first 256 KB + size + name for a stable id without reading whole file
  const slice = await file.slice(0, 256 * 1024).arrayBuffer();
  const hashBuf = await crypto.subtle.digest("SHA-1", slice);
  const hash = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
  return `sentify_upload_${hash}_${file.size}`;
};

const guessTitleArtist = (name: string): { title: string; artist: string } => {
  const stem = name.replace(/\.[^.]+$/, "");
  // "Artist - Title" pattern
  const dash = stem.split(/\s+-\s+/);
  if (dash.length >= 2) return { artist: dash[0].trim(), title: dash.slice(1).join(" - ").trim() };
  return { title: stem, artist: "Unknown artist" };
};

const decodeDuration = (file: File): Promise<number> =>
  new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.src = url;
    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", () => {
      const dur = isFinite(audio.duration) ? audio.duration : 0;
      URL.revokeObjectURL(url);
      resolve(dur);
    });
    audio.addEventListener("error", () => {
      URL.revokeObjectURL(url);
      resolve(0);
    });
  });

const UploadPage = () => {
  const { session, loading } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<LocalUpload[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const refresh = () => listUploads().then(setUploads);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener("sentify:uploads-changed", onChange);
    return () => window.removeEventListener("sentify:uploads-changed", onChange);
  }, []);

  if (loading) return null;
  if (!session) return <Navigate to="/auth" replace />;

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    for (const file of list) {
      if (!file.type.startsWith("audio/")) {
        toast.error(`${file.name} — not an audio file`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error(`${file.name} — exceeds 30 MB limit`);
        continue;
      }
      try {
        const trackId = await trackIdFromFile(file);
        if (await getUpload(trackId)) {
          toast.message(`${file.name} is already in your library`);
          continue;
        }
        const { title, artist } = guessTitleArtist(file.name);
        const durationSec = await decodeDuration(file);
        const upload: LocalUpload = {
          trackId,
          title,
          artist,
          durationSec,
          mime: file.type,
          size: file.size,
          addedAt: Date.now(),
          blob: file,
        };
        await putUpload(upload);
        toast.success(`Added "${title}" — analyzing…`);
        setBusy(trackId);
        void analyzeTrack({
          trackId,
          title,
          artist,
          durationSec,
          audioFile: file,
        })
          .then((res) => {
            if (res) toast.success(`Analyzed "${title}"`);
            else toast.error(`Analysis failed for "${title}"`);
          })
          .finally(() => setBusy(null));
      } catch (e) {
        console.error("[upload] failed", e);
        toast.error(`Failed to add ${file.name}`);
      }
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
  };

  return (
    <>
      <Helmet>
        <title>Upload Music — Sentify Musicologist</title>
        <meta name="description" content="Upload your local audio files. Sentify's AI musicologist auto-detects genre, BPM, key, mood, and the chorus." />
        <link rel="canonical" href="/upload" />
        <meta property="og:title" content="Upload Music — Sentify Musicologist" />
        <meta property="og:description" content="Upload your local audio files. Sentify's AI musicologist auto-detects genre, BPM, key, mood, and the chorus." />
        <meta property="og:url" content="/upload" />
      </Helmet>

      <div className="px-6 md:px-10 py-8 max-w-5xl mx-auto">
        <h1 className="text-3xl md:text-4xl font-black mb-1">Upload music</h1>
        <p className="text-muted-foreground mb-6">
          Drop audio files here — Sentify's musicologist will extract genre, BPM, key, mood, instruments, and the golden minute.
        </p>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-all ${
            dragging ? "border-primary bg-primary/10 scale-[1.01]" : "border-muted-foreground/30 hover:border-primary/50 hover:bg-card/40"
          }`}
        >
          <UploadIcon className="w-12 h-12 mx-auto mb-3 text-muted-foreground" />
          <p className="font-semibold mb-1">Drag and drop audio files</p>
          <p className="text-sm text-muted-foreground">or click to browse · mp3, m4a, wav, flac · up to 30 MB each</p>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && handleFiles(e.target.files)}
          />
        </div>

        <section className="mt-10">
          <h2 className="text-xl font-bold mb-3">Your uploads ({uploads.length})</h2>
          {uploads.length === 0 ? (
            <p className="text-muted-foreground text-sm">No uploads yet.</p>
          ) : (
            <ul className="space-y-2">
              {uploads.map((u) => (
                <UploadRow key={u.trackId} upload={u} busy={busy === u.trackId} onRefresh={refresh} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
};

const UploadRow = ({ upload, busy, onRefresh }: { upload: LocalUpload; busy: boolean; onRefresh: () => void }) => {
  const analysis = useAnalysis(upload.trackId);
  const { playTrack } = usePlayer();
  const [reAnalyzing, setReAnalyzing] = useState(false);

  const play = () => {
    const blobUrl = URL.createObjectURL(upload.blob);
    const track: Track = {
      id: upload.trackId,
      title: upload.title,
      artist: upload.artist,
      artwork: "/placeholder.svg",
      audioUrl: blobUrl,
      duration: upload.durationSec,
      source: "audius",
    };
    playTrack(track);
  };

  const reAnalyze = async () => {
    setReAnalyzing(true);
    try {
      await analyzeTrack({
        trackId: upload.trackId,
        title: upload.title,
        artist: upload.artist,
        durationSec: upload.durationSec,
        audioFile: upload.blob,
        force: true,
      });
      toast.success("Re-analyzed");
    } catch {
      toast.error("Re-analysis failed");
    } finally {
      setReAnalyzing(false);
    }
  };

  const remove = async () => {
    await deleteUpload(upload.trackId);
    toast.success("Removed");
    onRefresh();
  };

  return (
    <li className="bg-card/40 rounded-xl p-4 flex items-center gap-4">
      <div className="w-12 h-12 rounded-md bg-muted flex items-center justify-center shrink-0">
        <FileMusic className="w-6 h-6 text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate">{upload.title}</div>
        <div className="text-xs text-muted-foreground truncate">{upload.artist}</div>
        <div className="mt-2">
          {busy ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Analyzing…
            </div>
          ) : (
            <AnalysisBadges analysis={analysis} compact />
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button size="icon" variant="ghost" onClick={play} title="Play"><Play className="w-4 h-4" /></Button>
        <Button size="icon" variant="ghost" onClick={reAnalyze} disabled={reAnalyzing} title="Re-analyze">
          {reAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        </Button>
        <Button size="icon" variant="ghost" onClick={remove} title="Remove">
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </li>
  );
};

export default UploadPage;
