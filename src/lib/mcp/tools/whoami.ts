import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";

/**
 * Return the identity of the signed-in Sentify user for the current MCP session.
 */
export default defineTool({
  name: "whoami",
  title: "Who am I",
  description:
    "Return the identity (user id, email) of the signed-in Sentify user associated with this MCP session.",
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
    const info = {
      user_id: ctx.getUserId(),
      email: ctx.getUserEmail() ?? null,
      client_id: ctx.getClientId() ?? null,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(info, null, 2) }],
      structuredContent: info,
    };
  },
});
