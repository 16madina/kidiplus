import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_my_lives",
  title: "List my live shows",
  description: "List the signed-in seller's KiDi+ live shows (scheduled, live or ended), newest first.",
  inputSchema: {
    status: z
      .enum(["scheduled", "live", "ended"])
      .optional()
      .describe("Filter by live status. Omit to include every status."),
    limit: z.number().int().min(1).max(50).default(10).describe("Maximum number of lives to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("lives")
      .select("id, title, description, category, status, currency, cover_url, scheduled_at, started_at, ended_at, viewer_count")
      .eq("seller_id", ctx.getUserId()!)
      .order("scheduled_at", { ascending: false, nullsFirst: false })
      .limit(limit ?? 10);
    if (status) query = query.eq("status", status);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { lives: data ?? [] },
    };
  },
});
