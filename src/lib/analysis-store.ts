// Per-device IndexedDB store for musicologist results + uploaded local audio.
// Uses `idb` for typed wrapper. Stores survive reloads and live entirely on
// the user's device — no cloud sync.

import { openDB, type IDBPDatabase } from "idb";
import type { AnalysisResult, LocalUpload } from "@/types/analysis";

const DB_NAME = "sentify_musicology_v1";
const ANALYSIS_STORE = "analysis";
const UPLOADS_STORE = "uploads";

let dbPromise: Promise<IDBPDatabase> | null = null;

const getDB = () => {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(ANALYSIS_STORE)) {
          db.createObjectStore(ANALYSIS_STORE, { keyPath: "trackId" });
        }
        if (!db.objectStoreNames.contains(UPLOADS_STORE)) {
          db.createObjectStore(UPLOADS_STORE, { keyPath: "trackId" });
        }
      },
    });
  }
  return dbPromise;
};

// ----- Analysis -----

export async function getAnalysis(trackId: string): Promise<AnalysisResult | undefined> {
  try {
    const db = await getDB();
    return await db.get(ANALYSIS_STORE, trackId);
  } catch {
    return undefined;
  }
}

export async function putAnalysis(result: AnalysisResult): Promise<void> {
  try {
    const db = await getDB();
    await db.put(ANALYSIS_STORE, result);
    window.dispatchEvent(new CustomEvent("sentify:analysis-changed", { detail: { trackId: result.trackId } }));
  } catch (e) {
    console.warn("[analysis-store] put failed", e);
  }
}

export async function deleteAnalysis(trackId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(ANALYSIS_STORE, trackId);
    window.dispatchEvent(new CustomEvent("sentify:analysis-changed", { detail: { trackId } }));
  } catch (e) {
    console.warn("[analysis-store] delete failed", e);
  }
}

export async function listAnalyses(): Promise<AnalysisResult[]> {
  try {
    const db = await getDB();
    return await db.getAll(ANALYSIS_STORE);
  } catch {
    return [];
  }
}

// ----- Uploads -----

export async function getUpload(trackId: string): Promise<LocalUpload | undefined> {
  try {
    const db = await getDB();
    return await db.get(UPLOADS_STORE, trackId);
  } catch {
    return undefined;
  }
}

export async function putUpload(upload: LocalUpload): Promise<void> {
  try {
    const db = await getDB();
    await db.put(UPLOADS_STORE, upload);
    window.dispatchEvent(new CustomEvent("sentify:uploads-changed"));
  } catch (e) {
    console.warn("[analysis-store] uploads put failed", e);
  }
}

export async function deleteUpload(trackId: string): Promise<void> {
  try {
    const db = await getDB();
    await db.delete(UPLOADS_STORE, trackId);
    await deleteAnalysis(trackId);
    window.dispatchEvent(new CustomEvent("sentify:uploads-changed"));
  } catch (e) {
    console.warn("[analysis-store] uploads delete failed", e);
  }
}

export async function listUploads(): Promise<LocalUpload[]> {
  try {
    const db = await getDB();
    const all = await db.getAll(UPLOADS_STORE);
    return all.sort((a, b) => b.addedAt - a.addedAt);
  } catch {
    return [];
  }
}
