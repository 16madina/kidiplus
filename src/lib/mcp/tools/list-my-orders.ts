import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_my_orders",
  title: "List my orders",
  description: "List KiDi+ orders for the signed-in user, either as seller (sales) or as buyer (purchases), newest first.",
  inputSchema: {
    role: z.enum(["seller", "buyer"]).default("seller").describe("Whether to list sales (seller) or purchases (buyer)."),
    fulfillment_status: z
      .string()
      .optional()
      .describe("Optional fulfillment status filter, e.g. pending, shipped, delivered."),
    limit: z.number().int().min(1).max(50).default(20).describe("Maximum number of orders to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ role, fulfillment_status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const column = (role ?? "seller") === "buyer" ? "buyer_id" : "seller_id";
    let query = supabase
      .from("orders")
      .select(
        "id, kind, item_name, amount, delivery_fee, total, currency, status, fulfillment_status, payment_method, delivery_mode, created_at, paid_at, shipped_at, delivered_confirmed_at",
      )
      .eq(column, ctx.getUserId()!)
      .order("created_at", { ascending: false })
      .limit(limit ?? 20);
    if (fulfillment_status) query = query.eq("fulfillment_status", fulfillment_status);

    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { orders: data ?? [] },
    };
  },
});
