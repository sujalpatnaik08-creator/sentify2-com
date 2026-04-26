// IndexedDB-backed offline store for downloaded tracks.
// We only persist Audius streams (open & permitted). YouTube tracks are
// surfaced as "stream-only" because re-distributing their MP4 is against
// YouTube ToS — we keep their metadata so users can see them, but we do
// not cache the audio.

import type { Track } from "@/types/music";

const DB_NAME = "sentify-offline";
const DB_VERSION = 1;
const META_STORE = "tracks";  // {id, track, addedAt, size}
const BLOB_STORE = "blobs";   // {id, blob}

let dbPromise: Promise<IDBDatabase> | null = null;
function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(BLOB_STORE)) {
        db.createObjectStore(BLOB_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export interface DownloadedTrackMeta {
  id: string;
  track: Track;
  addedAt: number;
  size: number;
}

function txReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export async function listDownloads(): Promise<DownloadedTrackMeta[]> {
  const db = await openDB();
  const tx = db.transaction(META_STORE, "readonly");
  const all = await txReq<DownloadedTrackMeta[]>(tx.objectStore(META_STORE).getAll() as IDBRequest<DownloadedTrackMeta[]>);
  return all.sort((a, b) => b.addedAt - a.addedAt);
}

export async function isDownloaded(id: string): Promise<boolean> {
  const db = await openDB();
  const tx = db.transaction(META_STORE, "readonly");
  const v = await txReq(tx.objectStore(META_STORE).get(id));
  return !!v;
}

export async function getDownloadedBlob(id: string): Promise<Blob | null> {
  const db = await openDB();
  const tx = db.transaction(BLOB_STORE, "readonly");
  const row = await txReq<{ id: string; blob: Blob } | undefined>(
    tx.objectStore(BLOB_STORE).get(id) as IDBRequest<{ id: string; blob: Blob } | undefined>,
  );
  return row?.blob ?? null;
}

/**
 * Download an Audius track's audio and persist it.
 * YouTube tracks throw — we don't cache them due to ToS.
 * Pass an AbortSignal to support user-initiated cancellation.
 */
export class DownloadCancelledError extends Error {
  constructor() {
    super("Download cancelled");
    this.name = "DownloadCancelledError";
  }
}

export async function downloadTrack(
  track: Track,
  onProgress?: (loaded: number, total: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  if (track.source === "youtube") {
    throw new Error(
      "YouTube tracks can only be streamed live — they cannot be saved offline.",
    );
  }
  // Validate URL
  let url: URL;
  try {
    url = new URL(track.audioUrl);
  } catch {
    throw new Error("Invalid audio URL.");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Unsupported audio protocol.");
  }

  const res = await fetch(url.toString(), { signal });
  if (!res.ok || !res.body) throw new Error(`Download failed (${res.status})`);

  const total = Number(res.headers.get("Content-Length") || 0);
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  try {
    while (true) {
      if (signal?.aborted) {
        await reader.cancel();
        throw new DownloadCancelledError();
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        loaded += value.byteLength;
        onProgress?.(loaded, total);
      }
    }
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw new DownloadCancelledError();
    throw e;
  }
  const blob = new Blob(chunks as BlobPart[], { type: "audio/mpeg" });

  const db = await openDB();
  const tx = db.transaction([META_STORE, BLOB_STORE], "readwrite");
  await Promise.all([
    txReq(tx.objectStore(BLOB_STORE).put({ id: track.id, blob })),
    txReq(tx.objectStore(META_STORE).put({
      id: track.id,
      track,
      addedAt: Date.now(),
      size: blob.size,
    })),
  ]);
}

export async function removeDownload(id: string): Promise<void> {
  const db = await openDB();
  const tx = db.transaction([META_STORE, BLOB_STORE], "readwrite");
  await Promise.all([
    txReq(tx.objectStore(META_STORE).delete(id)),
    txReq(tx.objectStore(BLOB_STORE).delete(id)),
  ]);
}

export async function totalDownloadedBytes(): Promise<number> {
  const all = await listDownloads();
  return all.reduce((sum, x) => sum + (x.size || 0), 0);
}

export function formatBytes(n: number): string {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / Math.pow(1024, i)).toFixed(1)} ${u[i]}`;
}
