import { auth, defineMcp } from "@lovable.dev/mcp-js";

import getMyProfile from "./tools/get-my-profile";
import listMyLives from "./tools/list-my-lives";
import listMyOrders from "./tools/list-my-orders";
import listMyProducts from "./tools/list-my-products";
import getMyBalances from "./tools/get-my-balances";
import listMyEarnings from "./tools/list-my-earnings";

// The OAuth issuer must be the direct Supabase host; the project ref is the only
// Supabase value that survives publish unchanged.
const projectRef = import.meta.env['VITE_SUPABASE_PROJECT_ID'] ?? "project-ref-unset";

export default defineMcp({
  name: "kidi",
  title: "Kidi+",
  version: "0.1.0",
  instructions:
    "Tools for the KiDi+ live shopping app. Each caller acts as their own signed-in KiDi+ account: read their profile, live shows, sales and purchases, shop products, wallet and earnings balances.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getMyProfile, listMyLives, listMyOrders, listMyProducts, getMyBalances, listMyEarnings],
});
