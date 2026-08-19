import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_my_earnings",
  title: "List my earnings entries",
  description: "List the signed-in seller's recent KiDi+ earnings entries (sales, gifts, adjustments), newest first.",
  inputSchema: {
    limit: z.number().int().min(1).max(100).default(25).describe("Maximum number of entries to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("seller_earnings")
      .select("id, amount, balance_after, source, status, gift_key, order_id, live_id, created_at")
      .eq("seller_id", ctx.getUserId()!)
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { earnings: data ?? [] },
    };
  },
});
