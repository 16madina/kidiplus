// POST /api/live-replay/purge
// Cron: delete expired replay objects from Supabase Storage and clear metadata.

import { createFileRoute } from "@tanstack/react-router";
import { LIVE_REPLAY_BUCKET } from "@/lib/live-replay-s3";

function cronSecretOk(request: Request): boolean {
  const expected =
    (process.env.CRON_SECRET ?? "").trim() ||
    (process.env.LIVE_REPLAY_PURGE_SECRET ?? "").trim();
  if (!expected) return false;
  const header = (request.headers.get("x-cron-secret") ?? "").trim();
  return header.length > 0 && header === expected;
}

export const Route = createFileRoute("/api/live-replay/purge")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!cronSecretOk(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        // Ensure SQL mark-expired ran even if cron only hits this HTTP endpoint.
        try {
          await supabaseAdmin.rpc("mark_expired_live_replays");
        } catch {
          // RPC may not exist yet before migration; continue with query filter.
        }

        const nowIso = new Date().toISOString();
        const { data: rows, error } = await supabaseAdmin
          .from("lives")
          .select("id, replay_storage_path, replay_status, replay_expires_at")
          .not("replay_storage_path", "is", null)
          .or(
            `replay_status.eq.expired,and(replay_expires_at.lt.${nowIso})`,
          )
          .limit(200);

        if (error) {
          console.error("[live-replay/purge] query failed", error);
          return Response.json(
            { ok: false, error: error.message },
            { status: 500 },
          );
        }

        let deleted = 0;
        let cleared = 0;
        const failures: string[] = [];

        for (const row of rows ?? []) {
          const path = (row.replay_storage_path ?? "").replace(/^\//, "");
          if (path) {
            const { error: delErr } = await supabaseAdmin.storage
              .from(LIVE_REPLAY_BUCKET)
              .remove([path]);
            if (delErr) {
              failures.push(`${row.id}: ${delErr.message}`);
              console.warn("[live-replay/purge] storage delete", row.id, delErr);
            } else {
              deleted += 1;
            }
          }

          const { error: updErr } = await supabaseAdmin
            .from("lives")
            .update({
              replay_status: "expired",
              replay_url: null,
              replay_storage_path: null,
              replay_egress_id: null,
            } as never)
            .eq("id", row.id);
          if (updErr) {
            failures.push(`${row.id}: ${updErr.message}`);
          } else {
            cleared += 1;
          }
        }

        return Response.json({
          ok: true,
          scanned: (rows ?? []).length,
          deleted,
          cleared,
          failures: failures.slice(0, 20),
        });
      },
    },
  },
});
