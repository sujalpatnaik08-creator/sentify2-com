import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

/**
 * Search Sentify's music catalog (public YouTube-backed search).
 * Returns a compact list of tracks: title, artist, id, duration.
 */
export default defineTool({
  name: "search_music",
  title: "Search music",
  description:
    "Search Sentify's music catalog for songs, artists, or albums. Returns up to 20 matching tracks with title, artist, id, and duration.",
  inputSchema: {
    query: z.string().min(1).max(200).describe("Search query, e.g. 'Taylor Swift Blank Space'."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(20)
      .optional()
      .describe("Maximum number of results to return (default 10, max 20)."),
  },
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: true,
  },
  handler: async ({ query, limit }) => {
    const supabaseUrl = process.env.SUPABASE_URL;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
    if (!supabaseUrl || !publishableKey) {
      return {
        content: [{ type: "text", text: "Server not configured (missing Supabase env)." }],
        isError: true,
      };
    }

    const cap = limit ?? 10;
    try {
      const res = await fetch(`${supabaseUrl}/functions/v1/yt-search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${publishableKey}`,
          apikey: publishableKey,
        },
        body: JSON.stringify({ query, limit: cap }),
      });
      if (!res.ok) {
        const body = await res.text();
        return {
          content: [{ type: "text", text: `Search failed (${res.status}): ${body.slice(0, 300)}` }],
          isError: true,
        };
      }
      const data = await res.json();
      const rawResults = Array.isArray(data?.results) ? data.results : Array.isArray(data) ? data : [];
      const results = rawResults.slice(0, cap).map((r: any) => ({
        id: r.id ?? r.videoId ?? r.trackId ?? null,
        title: r.title ?? r.name ?? "",
        artist: r.artist ?? r.channel ?? r.author ?? "",
        duration: r.duration ?? r.durationSeconds ?? null,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        structuredContent: { results },
      };
    } catch (e) {
      return {
        content: [{ type: "text", text: `Search error: ${(e as Error).message}` }],
        isError: true,
      };
    }
  },
});
