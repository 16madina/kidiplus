// POST /api/broadcast-egress-session
// Exchange a signed egress ticket for LiveKit viewer credentials + live meta.

import { createFileRoute } from "@tanstack/react-router";
import { AccessToken } from "livekit-server-sdk";
import { isAllowedOrigin } from "@/lib/api-cors";
import { verifyBroadcastEgressTicket } from "@/lib/broadcast-egress-token";
import { signBroadcastProductImage } from "@/lib/broadcast-egress-sign-image.server";

function corsHeaders(origin: string | null): HeadersInit {
  const base: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
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
      ...corsHeaders(origin),
    },
  });
}

export const Route = createFileRoute("/api/broadcast-egress-session")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, {
          status: 204,
          headers: corsHeaders(request.headers.get("origin")),
        }),

      POST: async ({ request }) => {
        const origin = request.headers.get("origin");
        if (origin && !isAllowedOrigin(origin)) {
          return json({ error: "Origin not allowed" }, 403, origin);
        }

        const LIVEKIT_URL = process.env.LIVEKIT_URL;
        const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
        const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;
        if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
          return json({ error: "LiveKit not configured" }, 500, origin);
        }

        let body: { ticket?: unknown; liveId?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON" }, 400, origin);
        }

        const ticket =
          typeof body.ticket === "string" ? body.ticket.trim() : "";
        const liveId =
          typeof body.liveId === "string" ? body.liveId.trim() : "";
        if (!ticket || !liveId) {
          return json({ error: "Missing ticket or liveId" }, 400, origin);
        }

        const verified = verifyBroadcastEgressTicket(ticket);
        if (!verified || verified.liveId !== liveId) {
          return json({ error: "Invalid or expired ticket" }, 403, origin);
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data: live, error } = await supabaseAdmin
          .from("lives")
          .select("id, room_name, title, status, cover_url, currency, seller_id")
          .eq("id", liveId)
          .maybeSingle();

        if (error || !live) {
          return json({ error: "Live not found" }, 404, origin);
        }
        if (live.room_name !== verified.roomName) {
          return json({ error: "Room mismatch" }, 403, origin);
        }
        if (live.status !== "live" && live.status !== "scheduled") {
          // Allow briefly after start; egress often joins while status is live.
          if (live.status === "ended") {
            return json({ error: "Live ended" }, 410, origin);
          }
        }

        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("display_name, handle")
          .eq("id", live.seller_id)
          .maybeSingle();

        const { data: productRows } = await supabaseAdmin
          .from("live_products")
          .select("id, image_url")
          .eq("live_id", liveId);

        const productImages: Record<string, string> = {};
        await Promise.all(
          (productRows ?? []).map(async (row) => {
            const signed = await signBroadcastProductImage(
              supabaseAdmin,
              row.image_url,
            );
            if (signed) productImages[row.id] = signed;
          }),
        );

        const coverUrl =
          (await signBroadcastProductImage(
            supabaseAdmin,
            live.cover_url,
          )) ?? live.cover_url;

        const identity = `egress-yt-${liveId.slice(0, 8)}-${Date.now().toString(36)}`;
        const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
          identity,
          name: "YouTube Broadcast",
          ttl: "4h",
        });
        at.addGrant({
          roomJoin: true,
          room: live.room_name,
          canPublish: false,
          canSubscribe: true,
          canPublishData: false,
        });

        const token = await at.toJwt();
        return json(
          {
            token,
            url: LIVEKIT_URL,
            identity,
            roomName: live.room_name,
            title: live.title,
            coverUrl,
            currency: live.currency,
            hostName:
              profile?.display_name?.trim() ||
              profile?.handle?.trim() ||
              "Host",
            productImages,
          },
          200,
          origin,
        );
      },
    },
  },
});
