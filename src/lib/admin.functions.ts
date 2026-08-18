import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Returns the admin flag for the caller.
 * Signed-out (or token-less) callers get `{ isAdmin: false }` instead of a 500 —
 * this endpoint is polled from screens that render before auth is ready.
 */
export const getAdminStatus = createServerFn({ method: "GET" }).handler(async () => {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return { isAdmin: false };

  const authHeader = getRequest()?.headers?.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (!token || token.split(".").length !== 3) return { isAdmin: false };

  const supabase = createClient<Database>(url, key, {
    global: {
      headers: { Authorization: `Bearer ${token}`, apikey: key },
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", key);
        if (!headers.get("Authorization")) headers.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers });
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: claims } = await supabase.auth.getClaims(token);
    const userId = claims?.claims?.sub;
    if (!userId) return { isAdmin: false };
    const { data, error } = await supabase.rpc("is_admin", { _user_id: userId });
    if (error) return { isAdmin: false };
    return { isAdmin: !!data };
  } catch {
    return { isAdmin: false };
  }
});
