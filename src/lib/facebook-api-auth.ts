/**
 * Shared auth + CORS helpers for /api/facebook/* routes.
 */

import { isAllowedOrigin } from "@/lib/api-cors";

export function facebookCorsHeaders(
  origin: string | null,
  methods = "GET, POST, OPTIONS",
): HeadersInit {
  const base: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && isAllowedOrigin(origin)) {
    base["Access-Control-Allow-Origin"] = origin;
  }
  return base;
}

export function facebookJson(
  body: unknown,
  status: number,
  origin: string | null,
  methods?: string,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      ...facebookCorsHeaders(origin, methods),
    },
  });
}

export async function requireFacebookApiUser(
  request: Request,
): Promise<
  | { ok: true; userId: string; origin: string | null }
  | { ok: false; response: Response }
> {
  const origin = request.headers.get("origin");
  if (origin && !isAllowedOrigin(origin)) {
    return {
      ok: false,
      response: facebookJson({ error: "Origin not allowed" }, 403, origin),
    };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return {
      ok: false,
      response: facebookJson(
        { error: "Auth backend not configured on server" },
        500,
        origin,
      ),
    };
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return {
      ok: false,
      response: facebookJson({ error: "Unauthorized" }, 401, origin),
    };
  }
  const bearer = authHeader.slice("Bearer ".length).trim();
  if (!bearer || bearer.split(".").length !== 3) {
    return {
      ok: false,
      response: facebookJson({ error: "Unauthorized" }, 401, origin),
    };
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      storage: undefined,
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const { data: claimsData, error: claimsError } =
    await supabaseAuth.auth.getClaims(bearer);
  const userId = claimsData?.claims?.sub ?? null;
  if (claimsError || !userId || typeof userId !== "string") {
    return {
      ok: false,
      response: facebookJson({ error: "Unauthorized" }, 401, origin),
    };
  }

  return { ok: true, userId, origin };
}
