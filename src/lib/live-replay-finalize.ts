/**
 * Shared finalize helpers for LiveKit egress → replay ready state.
 */

import { EgressInfo, EgressStatus } from "livekit-server-sdk";
import {
  liveReplayExpiresAt,
  liveReplayPublicUrl,
  liveReplayS3Config,
  normalizeReplayStoragePath,
  isPrivateObjectStorageUrl,
} from "@/lib/live-replay-s3";

/** Prefer durable public CDN URL — never store private S3/R2 API URLs. */
export function resolvePublicReplayUrl(
  storagePath: string,
  locationHint?: string | null,
): string | null {
  const path = normalizeReplayStoragePath(storagePath);
  if (!path) return null;

  const s3cfg = liveReplayS3Config();
  if (s3cfg) {
    return liveReplayPublicUrl(s3cfg, path);
  }

  // Last resort when env is misconfigured: only accept already-public https.
  const hint = (locationHint ?? "").trim();
  if (/^https?:\/\//i.test(hint) && !isPrivateObjectStorageUrl(hint)) {
    return hint;
  }
  return null;
}

export function extractReplayStoragePath(
  filepath: string | undefined | null,
): string | null {
  if (!filepath) return null;
  const trimmed = filepath.trim();
  if (!trimmed) return null;

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const u = new URL(trimmed);
      return normalizeReplayStoragePath(u.pathname.replace(/^\//, ""));
    } catch {
      return null;
    }
  }
  const s3Match = /^s3:\/\/[^/]+\/(.+)$/i.exec(trimmed);
  if (s3Match?.[1]) return normalizeReplayStoragePath(s3Match[1]);
  return normalizeReplayStoragePath(trimmed);
}

/** @deprecated Prefer resolvePublicReplayUrl — kept for callers that only have a path. */
export function replayUrlFromLocationOrPath(
  locationOrPath: string,
  storagePath: string,
): string | null {
  return resolvePublicReplayUrl(storagePath, locationOrPath);
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
    extractReplayStoragePath(resultFile) ??
    normalizeReplayStoragePath(opts.storedPath) ??
    null;

  if (!storagePath) {
    await supabaseAdmin
      .from("lives")
      .update({ replay_status: "failed" } as never)
      .eq("id", opts.liveId)
      .eq("replay_egress_id", opts.egressId);
    return "failed";
  }

  // Tiny / empty files are unplayable (common if awaitStartSignal never fired).
  const size =
    typeof fileResult?.size === "bigint"
      ? Number(fileResult.size)
      : typeof fileResult?.size === "number"
        ? fileResult.size
        : null;
  if (size != null && size < 8_000) {
    console.error(
      "[live-replay] egress file too small",
      opts.liveId,
      opts.egressId,
      size,
    );
    await supabaseAdmin
      .from("lives")
      .update({
        replay_status: "failed",
        replay_storage_path: storagePath,
        replay_url: null,
      } as never)
      .eq("id", opts.liveId)
      .eq("replay_egress_id", opts.egressId);
    return "failed";
  }

  const replayUrl = resolvePublicReplayUrl(storagePath, locationHint);

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

  if (locationHint && isPrivateObjectStorageUrl(locationHint)) {
    console.info(
      "[live-replay] ignoring private storage location; using public base URL",
      { liveId: opts.liveId, publicUrl: replayUrl },
    );
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

/** Repair a live row that was marked ready with a private R2/S3 API URL. */
export async function repairLiveReplayPublicUrl(liveId: string): Promise<{
  ok: boolean;
  url?: string;
  error?: string;
}> {
  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );
  const { data: row } = await supabaseAdmin
    .from("lives")
    .select("id, replay_status, replay_url, replay_storage_path")
    .eq("id", liveId)
    .maybeSingle();

  if (!row) return { ok: false, error: "not_found" };
  if (row.replay_status !== "ready") {
    return { ok: false, error: "not_ready" };
  }

  const path =
    normalizeReplayStoragePath(row.replay_storage_path) ??
    extractReplayStoragePath(row.replay_url);

  if (!path) return { ok: false, error: "no_path" };

  const url = resolvePublicReplayUrl(path, row.replay_url);
  if (!url) return { ok: false, error: "no_public_base" };

  const needsUpdate =
    !row.replay_url ||
    row.replay_url !== url ||
    isPrivateObjectStorageUrl(row.replay_url);

  if (needsUpdate) {
    await supabaseAdmin
      .from("lives")
      .update({
        replay_url: url,
        replay_storage_path: path,
      } as never)
      .eq("id", liveId);
  }

  return { ok: true, url };
}
