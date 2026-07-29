// POST /api/live-replay/delete
// Seller deletes their own replay early (before the 7-day retention purge).

import { createFileRoute } from "@tanstack/react-router";
import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import {
  LIVE_ID_UUID_RE,
  liveReplayCorsHeaders,
  liveReplayJson,
  requireLiveReplayApiUser,
} from "@/lib/live-replay-api-auth";
import {
  LIVE_REPLAY_BUCKET,
  liveReplayS3Config,
  normalizeReplayStoragePath,
} from "@/lib/live-replay-s3";

async function deleteReplayObject(storagePath: string): Promise<void> {
  const path = normalizeReplayStoragePath(storagePath);
  if (!path) return;

  const s3cfg = liveReplayS3Config();
  if (s3cfg) {
    const client = new S3Client({
      region: s3cfg.region,
      endpoint: s3cfg.endpoint,
      forcePathStyle: s3cfg.forcePathStyle,
      credentials: {
        accessKeyId: s3cfg.accessKey,
        secretAccessKey: s3cfg.secret,
      },
    });
    await client.send(
      new DeleteObjectCommand({
        Bucket: s3cfg.bucket,
        Key: path,
      }),
    );
    return;
  }

  // Fallback: Supabase Storage public bucket (legacy).
  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );
  await supabaseAdmin.storage.from(LIVE_REPLAY_BUCKET).remove([path]);
}

export const Route = createFileRoute("/api/live-replay/delete")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, {
          status: 204,
          headers: liveReplayCorsHeaders(
            request.headers.get("origin"),
            "POST, OPTIONS",
          ),
        }),

      POST: async ({ request }) => {
        const auth = await requireLiveReplayApiUser(request);
        if (!auth.ok) return auth.response;
        const { userId, origin } = auth;

        let body: { liveId?: unknown };
        try {
          body = await request.json();
        } catch {
          return liveReplayJson({ error: "Invalid JSON body" }, 400, origin);
        }

        const liveId =
          typeof body.liveId === "string" ? body.liveId.trim() : "";
        if (!liveId || !LIVE_ID_UUID_RE.test(liveId)) {
          return liveReplayJson({ error: "Missing liveId" }, 400, origin);
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data: liveRow, error } = await supabaseAdmin
          .from("lives")
          .select("id, seller_id, replay_storage_path, replay_status, replay_url")
          .eq("id", liveId)
          .maybeSingle();

        if (error || !liveRow) {
          return liveReplayJson({ error: "Live not found" }, 404, origin);
        }
        if (liveRow.seller_id !== userId) {
          return liveReplayJson({ error: "Not authorized" }, 403, origin);
        }

        const path = normalizeReplayStoragePath(liveRow.replay_storage_path);
        if (path) {
          try {
            await deleteReplayObject(path);
          } catch (e) {
            console.warn("[live-replay/delete] storage remove failed", liveId, e);
            // Still clear metadata so the seller no longer sees the replay.
          }
        }

        const { error: updErr } = await supabaseAdmin
          .from("lives")
          .update({
            replay_status: "expired",
            replay_url: null,
            replay_storage_path: null,
            replay_egress_id: null,
            replay_ready_at: null,
            replay_expires_at: null,
          } as never)
          .eq("id", liveId)
          .eq("seller_id", userId);

        if (updErr) {
          return liveReplayJson(
            { error: "update_failed", message: updErr.message },
            500,
            origin,
          );
        }

        return liveReplayJson({ ok: true }, 200, origin);
      },
    },
  },
});
