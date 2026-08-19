import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_my_products",
  title: "List my shop products",
  description: "List the signed-in seller's KiDi+ shop products with price, currency and stock.",
  inputSchema: {
    active_only: z.boolean().default(true).describe("Only return products currently visible in the shop."),
    limit: z.number().int().min(1).max(100).default(25).describe("Maximum number of products to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ active_only, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("shop_products")
      .select("id, name, brand, description, price, currency, stock, active, condition, image_url, created_at, updated_at")
      .eq("seller_id", ctx.getUserId()!)
      .order("updated_at", { ascending: false })
      .limit(limit ?? 25);
    if (active_only !== false) query = query.eq("active", true);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { products: data ?? [] },
    };
  },
});
