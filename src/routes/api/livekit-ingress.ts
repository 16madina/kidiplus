import { createFileRoute } from "@tanstack/react-router";
import { IngressClient, IngressInput } from "livekit-server-sdk";
import { isAllowedOrigin } from "@/lib/api-cors";
import { rtmpHostIdentity } from "@/lib/rtmp-host-identity";

/**
 * Create / delete LiveKit RTMP Ingress for a seller's live.
 * Restream / OBS push to the returned url + streamKey; Ingress joins the room.
 */

function corsHeaders(origin: string | null): HeadersInit {
  const base: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && isAllowedOrigin(origin)) {
    base["Access-Control-Allow-Origin"] = origin;
  }
  return base;
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      ...corsHeaders(origin),
    },
  });
}

function livekitHttpHost(url: string): string {
  return url.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
}

export const Route = createFileRoute("/api/livekit-ingress")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => {
        const origin = request.headers.get("origin");
        return new Response(null, {
          status: 204,
          headers: corsHeaders(origin),
        });
      },

      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin && !isAllowedOrigin(origin)) {
          return json({ error: "Origin not allowed" }, 403, origin);
        }

        const LIVEKIT_URL = process.env.LIVEKIT_URL;
        const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
        const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;

        if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
          return json({ error: "LiveKit not configured on server" }, 500, origin);
        }
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return json({ error: "Auth backend not configured on server" }, 500, origin);
        }

        const authHeader = request.headers.get("authorization") ?? "";
        if (!authHeader.startsWith("Bearer ")) {
          return json({ error: "Unauthorized" }, 401, origin);
        }
        const bearer = authHeader.slice("Bearer ".length).trim();
        if (!bearer || bearer.split(".").length !== 3) {
          return json({ error: "Unauthorized" }, 401, origin);
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
        const callerId = claimsData?.claims?.sub ?? null;
        if (claimsError || !callerId) {
          return json({ error: "Unauthorized" }, 401, origin);
        }

        let body: { action?: unknown; liveId?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400, origin);
        }

        const action = body.action === "delete" ? "delete" : body.action === "create" ? "create" : null;
        const liveId = typeof body.liveId === "string" ? body.liveId.trim() : "";
        if (!action || !liveId) {
          return json({ error: "Missing action or liveId" }, 400, origin);
        }
        const uuidRe =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRe.test(liveId)) {
          return json({ error: "Invalid liveId" }, 400, origin);
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: liveRow, error: liveError } = await supabaseAdmin
          .from("lives")
          .select("id, seller_id, room_name, status, ingress_id, broadcast_mode")
          .eq("id", liveId)
          .maybeSingle();

        if (liveError || !liveRow) {
          return json({ error: "Live not found" }, 404, origin);
        }
        if (liveRow.seller_id !== callerId) {
          return json({ error: "Not authorized" }, 403, origin);
        }

        const host = livekitHttpHost(LIVEKIT_URL);
        const ingress = new IngressClient(host, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

        if (action === "delete") {
          const ingressId = (liveRow as { ingress_id?: string | null }).ingress_id;
          if (ingressId) {
            try {
              await ingress.deleteIngress(ingressId);
            } catch (e) {
              console.warn("[livekit-ingress] deleteIngress failed", e);
            }
          }
          await supabaseAdmin
            .from("lives")
            .update({
              ingress_id: null,
              broadcast_mode: "camera",
            } as never)
            .eq("id", liveId);
          return json({ ok: true }, 200, origin);
        }

        // create — replace any previous ingress for this live
        const prevId = (liveRow as { ingress_id?: string | null }).ingress_id;
        if (prevId) {
          try {
            await ingress.deleteIngress(prevId);
          } catch {
            /* ignore */
          }
        }

        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("display_name, handle")
          .eq("id", callerId)
          .maybeSingle();
        const displayName =
          profile?.display_name?.trim() ||
          profile?.handle?.trim() ||
          "Host";

        const participantIdentity = rtmpHostIdentity(callerId);
        let info;
        try {
          info = await ingress.createIngress(IngressInput.RTMP_INPUT, {
            name: `kidi-${liveId.slice(0, 8)}`,
            roomName: liveRow.room_name,
            participantIdentity,
            participantName: displayName.slice(0, 64),
            enableTranscoding: true,
          });
        } catch (e) {
          console.error("[livekit-ingress] createIngress failed", e);
          const msg = e instanceof Error ? e.message : String(e);
          return json(
            {
              error:
                msg.includes("ingress") || msg.includes("Ingress")
                  ? msg
                  : "Failed to create RTMP ingress — is Ingress enabled on LiveKit Cloud?",
            },
            502,
            origin,
          );
        }

        const url = info.url ?? "";
        const streamKey = info.streamKey ?? "";
        const ingressId = info.ingressId ?? "";
        if (!url || !streamKey || !ingressId) {
          return json({ error: "Ingress created without url/streamKey" }, 502, origin);
        }

        const { error: updErr } = await supabaseAdmin
          .from("lives")
          .update({
            ingress_id: ingressId,
            broadcast_mode: "rtmp",
          } as never)
          .eq("id", liveId);
        if (updErr) {
          try {
            await ingress.deleteIngress(ingressId);
          } catch {
            /* ignore */
          }
          return json({ error: "Failed to save ingress on live" }, 500, origin);
        }

        return json(
          {
            url,
            streamKey,
            ingressId,
            participantIdentity,
          },
          200,
          origin,
        );
      },
    },
  },
});
