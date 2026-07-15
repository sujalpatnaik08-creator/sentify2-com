import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

/**
 * List active listening sessions/devices for the signed-in user (RLS-scoped).
 */
export default defineTool({
  name: "list_my_sessions",
  title: "List my devices",
  description:
    "List the signed-in Sentify user's active listening devices/sessions (device label, platform, last active).",
  inputSchema: {},
  annotations: {
    readOnlyHint: true,
    idempotentHint: true,
    openWorldHint: false,
  },
  handler: async (_input, ctx: ToolContext) => {
    if (!ctx.isAuthenticated()) {
      return {
        content: [{ type: "text", text: "Not authenticated." }],
        isError: true,
      };
    }
    const supabaseUrl = process.env.SUPABASE_URL!;
    const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const supabase = createClient(supabaseUrl, publishableKey, {
      global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await supabase
      .from("user_sessions")
      .select("id, device_label, platform, ip_city, ip_country, last_active_at, created_at")
      .order("last_active_at", { ascending: false })
      .limit(50);

    if (error) {
      return {
        content: [{ type: "text", text: `Failed to list sessions: ${error.message}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? [], null, 2) }],
      structuredContent: { sessions: data ?? [] },
    };
  },
});
