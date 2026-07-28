/**
 * Auth + CORS helpers for /api/live-replay/* seller routes.
 */

import { isAllowedOrigin } from "@/lib/api-cors";

export function liveReplayCorsHeaders(
  origin: string | null,
  methods = "GET, POST, OPTIONS",
): HeadersInit {
  const base: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Cron-Secret",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && isAllowedOrigin(origin)) {
    base["Access-Control-Allow-Origin"] = origin;
  }
  return base;
}

export function liveReplayJson(
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
      ...liveReplayCorsHeaders(origin, methods),
    },
  });
}

export async function requireLiveReplayApiUser(
  request: Request,
): Promise<
  | { ok: true; userId: string; origin: string | null }
  | { ok: false; response: Response }
> {
  const origin = request.headers.get("origin");
  if (origin && !isAllowedOrigin(origin)) {
    return {
      ok: false,
      response: liveReplayJson({ error: "Origin not allowed" }, 403, origin),
    };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return {
      ok: false,
      response: liveReplayJson(
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
      response: liveReplayJson({ error: "Unauthorized" }, 401, origin),
    };
  }
  const bearer = authHeader.slice("Bearer ".length).trim();
  if (!bearer || bearer.split(".").length !== 3) {
    return {
      ok: false,
      response: liveReplayJson({ error: "Unauthorized" }, 401, origin),
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
      response: liveReplayJson({ error: "Unauthorized" }, 401, origin),
    };
  }

  return { ok: true, userId, origin };
}

export const LIVE_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function livekitHttpHost(url: string): string {
  return url.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
}

export function liveReplayLivekitEnv():
  | { ok: true; host: string; apiKey: string; apiSecret: string }
  | { ok: false; error: string } {
  const LIVEKIT_URL = process.env.LIVEKIT_URL;
  const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
  const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
  if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
    return { ok: false, error: "LiveKit not configured on server" };
  }
  return {
    ok: true,
    host: livekitHttpHost(LIVEKIT_URL),
    apiKey: LIVEKIT_API_KEY,
    apiSecret: LIVEKIT_API_SECRET,
  };
}
