// SongDNA — best-effort metadata extraction from raw track titles.
//
// Real music-database integrations (MusicBrainz, Genius, ISRC lookups) require
// API keys and licensing. Until those are connected we extract everything we
// can from what we already have: the YouTube/Audius title and artist string.
// The patterns below cover the vast majority of releases on YouTube where
// credits are encoded in the title or in parentheses.
//
// Parsed fields:
//   • performers   — primary + featured ("feat.", "ft.", "with", "&", ",", " x ")
//   • producers    — "prod. by X", "(prod X)", "produced by X"
//   • writers      — "written by X", "lyrics by X", "(lyrics: X)"
//   • remixers     — "X Remix", "Remix by X", "X Edit"
//   • samples      — "samples X by Y" or "contains a sample of X"
//   • covers       — "X cover", "cover of X", "originally by X"
//   • version tags — Live, Acoustic, Unplugged, Remastered, Demo, Reprise

import type { Track } from "@/types/music";

export interface SongDNA {
  title: string;
  performers: string[];
  producers: string[];
  writers: string[];
  remixers: string[];
  samples: string[];
  covers: string[];
  versionTags: string[];
  identifiers: { label: string; value: string }[];
}

const dedupe = (arr: string[]): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of arr) {
    const v = raw.trim().replace(/\s+/g, " ");
    if (!v) continue;
    const key = v.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
};

// Split a list-of-people string ("X, Y & Z feat. W") into individual names.
const splitPeople = (s: string): string[] => {
  if (!s) return [];
  return s
    .split(/\s*(?:,| and | & | feat\.? | ft\.? | with | x | vs\.? )\s*/i)
    .map((p) => p.trim())
    .filter(Boolean);
};

const stripChannelSuffixes = (s: string): string =>
  s
    .replace(/\s*-\s*topic$/i, "")
    .replace(/\bvevo$/i, "")
    .replace(/\bofficial\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

const stripQualifiers = (title: string): { clean: string; tags: string[] } => {
  const tags: string[] = [];
  const TAGS: Array<[RegExp, string]> = [
    [/\blive(?: at [^)\]]+)?\b/i, "Live"],
    [/\bacoustic\b/i, "Acoustic"],
    [/\bunplugged\b/i, "Unplugged"],
    [/\bremaster(?:ed)?\b/i, "Remastered"],
    [/\bdemo\b/i, "Demo"],
    [/\breprise\b/i, "Reprise"],
    [/\bextended\b/i, "Extended"],
    [/\bradio edit\b/i, "Radio Edit"],
    [/\binstrumental\b/i, "Instrumental"],
    [/\bkaraoke\b/i, "Karaoke"],
  ];
  let clean = title;
  for (const [re, label] of TAGS) {
    if (re.test(clean)) tags.push(label);
  }
  // Strip generic noise we don't want in the displayed title
  clean = clean
    .replace(/\s*\((?:official|lyric|lyrics|music|video|audio|hd|4k|m\/v|mv|visualizer|color coded)[^)]*\)/gi, "")
    .replace(/\s*\[(?:official|lyric|lyrics|music|video|audio|hd|4k|m\/v|mv|visualizer|color coded)[^\]]*\]/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  return { clean, tags };
};

export function parseSongDNA(track: Track): SongDNA {
  const rawTitle = track.title || "";
  const rawArtist = stripChannelSuffixes(track.artist || "");

  const performers: string[] = [];
  const producers: string[] = [];
  const writers: string[] = [];
  const remixers: string[] = [];
  const samples: string[] = [];
  const covers: string[] = [];

  // Primary performer(s) come from the artist field.
  performers.push(...splitPeople(rawArtist));

  // ---- Featured performers in title ("feat. X", "ft. X (and Y)") ----
  const featRe = /\b(?:feat\.?|ft\.?|featuring)\s+([^()\[\]|/\-–—]+?)(?=\s*[()\[\]|/\-–—]|$)/gi;
  for (const m of rawTitle.matchAll(featRe)) {
    performers.push(...splitPeople(m[1]));
  }

  // ---- Producers ----
  const prodRe = /\bprod(?:uced)?\.?\s*(?:by)?\s*[:\-]?\s*([^()\[\]|/]+?)(?=\s*[)\]|]|$)/gi;
  for (const m of rawTitle.matchAll(prodRe)) {
    producers.push(...splitPeople(m[1]));
  }

  // ---- Writers / lyricists ----
  const writerRe = /\b(?:written|writers?|lyrics?|composed)\s*(?:by)?\s*[:\-]?\s*([^()\[\]|/]+?)(?=\s*[)\]|]|$)/gi;
  for (const m of rawTitle.matchAll(writerRe)) {
    writers.push(...splitPeople(m[1]));
  }

  // ---- Remixers ("X Remix", "Remix by X", "X Edit") ----
  const remixRe1 = /\(([^()]+?)\s+(?:remix|edit|bootleg|flip|rework|vip)\)/gi;
  for (const m of rawTitle.matchAll(remixRe1)) {
    remixers.push(...splitPeople(m[1]));
  }
  const remixRe2 = /\bremix(?:ed)?\s*by\s+([^()\[\]|/]+?)(?=\s*[)\]|]|$)/gi;
  for (const m of rawTitle.matchAll(remixRe2)) {
    remixers.push(...splitPeople(m[1]));
  }

  // ---- Samples ----
  const sampleRe = /\b(?:samples?|contains? a sample of|interpolates)\s+(?:of\s+)?([^()\[\]|]+?)(?=\s*[)\]|]|$)/gi;
  for (const m of rawTitle.matchAll(sampleRe)) {
    samples.push(m[1].trim());
  }

  // ---- Covers ----
  const coverRe1 = /\(([^()]+?)\s+cover\)/gi;
  for (const m of rawTitle.matchAll(coverRe1)) {
    covers.push(`Cover by ${m[1].trim()}`);
  }
  const coverRe2 = /\bcover\s+of\s+([^()\[\]|]+?)(?=\s*[)\]|]|$)/gi;
  for (const m of rawTitle.matchAll(coverRe2)) {
    covers.push(`Cover of ${m[1].trim()}`);
  }
  const origRe = /\boriginally\s+by\s+([^()\[\]|]+?)(?=\s*[)\]|]|$)/gi;
  for (const m of rawTitle.matchAll(origRe)) {
    covers.push(`Originally by ${m[1].trim()}`);
  }

  const { clean: cleanTitle, tags } = stripQualifiers(rawTitle);

  // Identifiers — what we actually know for sure
  const identifiers: { label: string; value: string }[] = [
    { label: "Source", value: track.source === "youtube" ? "YouTube" : "Audius" },
    { label: "Track ID", value: track.id },
  ];
  if (track.source === "youtube") {
    identifiers.push({ label: "YouTube ID", value: track.audioUrl });
  }
  if (track.album) identifiers.push({ label: "Album", value: track.album });

  return {
    title: cleanTitle || rawTitle,
    performers: dedupe(performers),
    producers: dedupe(producers),
    writers: dedupe(writers),
    remixers: dedupe(remixers),
    samples: dedupe(samples),
    covers: dedupe(covers),
    versionTags: dedupe(tags),
    identifiers,
  };
}
