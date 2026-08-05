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
      const url = new URL(`${supabaseUrl}/functions/v1/yt-search`);
      url.searchParams.set("q", query);
      url.searchParams.set("limit", String(cap));
      url.searchParams.set("category", "music");

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${publishableKey}`,
          apikey: publishableKey,
        },
      });
      if (!res.ok) {
        return {
          content: [{ type: "text", text: `Search failed with status ${res.status}.` }],
          isError: true,
        };
      }
      const data = await res.json();
      const items = Array.isArray(data?.items) ? data.items : [];
      const results = items
        .filter((r: any) => r?.type === "video")
        .slice(0, cap)
        .map((r: any) => ({
          id: r.id,
          title: r.title ?? "",
          artist: r.artist ?? "",
          durationSeconds: r.duration ?? null,
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
