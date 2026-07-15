import { auth, defineMcp } from "@lovable.dev/mcp-js";
import searchMusicTool from "./tools/search-music";
import whoamiTool from "./tools/whoami";
import listSessionsTool from "./tools/list-sessions";

// The OAuth issuer MUST be the direct Supabase host (not the .lovable.cloud proxy).
// Build it from the project ref which Vite inlines as a literal at build time,
// keeping this module import-safe (no runtime env reads at top level).
const projectRef =
  (import.meta as any).env?.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "sentify-mcp",
  title: "Sentify",
  version: "0.1.0",
  instructions:
    "Sentify's MCP server. Use `search_music` to find songs/artists in Sentify's catalog. Use `whoami` and `list_my_sessions` to inspect the signed-in user's account.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [searchMusicTool, whoamiTool, listSessionsTool],
});
