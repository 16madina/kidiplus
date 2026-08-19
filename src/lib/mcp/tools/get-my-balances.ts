import { defineTool } from "@lovable.dev/mcp-js";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_my_balances",
  title: "Get my wallet and earnings balances",
  description:
    "Return the signed-in user's KiDi+ wallet balance (buying power) and, for sellers, the earnings balance (available and pending).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);
    const userId = ctx.getUserId()!;

    const [wallet, seller] = await Promise.all([
      supabase.from("wallets").select("balance, currency, updated_at").eq("user_id", userId).maybeSingle(),
      supabase
        .from("seller_balances")
        .select("available, pending, currency, updated_at")
        .eq("seller_id", userId)
        .maybeSingle(),
    ]);

    const error = wallet.error ?? seller.error;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const payload = { wallet: wallet.data ?? null, earnings: seller.data ?? null };
    return { content: [{ type: "text", text: JSON.stringify(payload) }], structuredContent: payload };
  },
});
