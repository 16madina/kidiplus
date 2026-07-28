/**
 * Shared finalize helpers for LiveKit egress → replay ready state.
 */

import { EgressInfo, EgressStatus } from "livekit-server-sdk";
import {
  liveReplayExpiresAt,
  liveReplayPublicUrl,
  liveReplayS3Config,
} from "@/lib/live-replay-s3";

export function extractReplayStoragePath(
  filepath: string | undefined | null,
): string | null {
  if (!filepath) return null;
  const trimmed = filepath.trim();
  if (!trimmed) return null;
  // Already a public/https URL — use as-is later; return path segment if possible.
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      return u.pathname.replace(/^\//, "");
    } catch {
      return null;
    }
  }
  const s3Match = /^s3:\/\/[^/]+\/(.+)$/i.exec(trimmed);
  if (s3Match?.[1]) return s3Match[1];
  return trimmed.replace(/^\//, "");
}

export function replayUrlFromLocationOrPath(
  locationOrPath: string,
  storagePath: string,
): string | null {
  const trimmed = locationOrPath.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const s3cfg = liveReplayS3Config();
  if (!s3cfg) return null;
  return liveReplayPublicUrl(s3cfg, storagePath);
}

export async function markReplayReady(opts: {
  liveId: string;
  egressId: string;
  storagePath: string;
  replayUrl: string;
  endedAt: string | null;
}): Promise<void> {
  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );
  const baseDate = opts.endedAt ? new Date(opts.endedAt) : new Date();
  const expiresAt = liveReplayExpiresAt(
    Number.isFinite(baseDate.getTime()) ? baseDate : new Date(),
  );
  await supabaseAdmin
    .from("lives")
    .update({
      replay_status: "ready",
      replay_storage_path: opts.storagePath,
      replay_url: opts.replayUrl,
      replay_ready_at: new Date().toISOString(),
      replay_expires_at: expiresAt,
    } as never)
    .eq("id", opts.liveId)
    .eq("replay_egress_id", opts.egressId);
}

export async function applyEgressInfoToLive(opts: {
  liveId: string;
  egressId: string;
  endedAt: string | null;
  storedPath: string | null;
  info: EgressInfo;
}): Promise<"ready" | "failed" | "pending" | "ignored"> {
  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );
  const status = opts.info.status;

  const failed =
    status === EgressStatus.EGRESS_FAILED ||
    status === EgressStatus.EGRESS_ABORTED ||
    status === EgressStatus.EGRESS_LIMIT_REACHED;

  if (failed) {
    await supabaseAdmin
      .from("lives")
      .update({
        replay_status: "failed",
        replay_url: null,
      } as never)
      .eq("id", opts.liveId)
      .eq("replay_egress_id", opts.egressId);
    return "failed";
  }

  if (status !== EgressStatus.EGRESS_COMPLETE) {
    return "pending";
  }

  const fileResult = opts.info.fileResults?.[0];
  const resultFile = fileResult?.filename || fileResult?.location || null;
  const locationHint =
    typeof fileResult?.location === "string" ? fileResult.location : null;
  const storagePath =
    extractReplayStoragePath(resultFile) ?? opts.storedPath ?? null;

  if (!storagePath) {
    await supabaseAdmin
      .from("lives")
      .update({ replay_status: "failed" } as never)
      .eq("id", opts.liveId)
      .eq("replay_egress_id", opts.egressId);
    return "failed";
  }

  const replayUrl =
    (locationHint && /^https?:\/\//i.test(locationHint)
      ? locationHint
      : null) ??
    replayUrlFromLocationOrPath(storagePath, storagePath);

  if (!replayUrl) {
    await supabaseAdmin
      .from("lives")
      .update({
        replay_status: "failed",
        replay_storage_path: storagePath,
      } as never)
      .eq("id", opts.liveId)
      .eq("replay_egress_id", opts.egressId);
    return "failed";
  }

  await markReplayReady({
    liveId: opts.liveId,
    egressId: opts.egressId,
    storagePath,
    replayUrl,
    endedAt: opts.endedAt,
  });
  return "ready";
}
