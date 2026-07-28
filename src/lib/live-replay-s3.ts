/**
 * S3-compatible config for LiveKit EncodedFileOutput → Supabase Storage
 * (or R2 / any S3 endpoint).
 */

export type LiveReplayS3Config = {
  accessKey: string;
  secret: string;
  bucket: string;
  region: string;
  endpoint: string;
  forcePathStyle: boolean;
  /** Public base for object URLs, e.g. https://xxx.supabase.co/storage/v1/object/public/live-replays */
  publicBaseUrl: string;
};

export const LIVE_REPLAY_BUCKET = "live-replays";
export const LIVE_REPLAY_RETENTION_DAYS = 7;

export function liveReplayS3Config(): LiveReplayS3Config | null {
  const accessKey = (process.env.LIVE_REPLAY_S3_ACCESS_KEY ?? "").trim();
  const secret = (process.env.LIVE_REPLAY_S3_SECRET_KEY ?? "").trim();
  const bucket =
    (process.env.LIVE_REPLAY_S3_BUCKET ?? "").trim() || LIVE_REPLAY_BUCKET;
  const regionRaw = (process.env.LIVE_REPLAY_S3_REGION ?? "").trim();
  // LiveKit Cloud rejects region "auto"; R2 works with us-east-1.
  const region =
    !regionRaw || regionRaw.toLowerCase() === "auto" ? "us-east-1" : regionRaw;
  const endpoint = (process.env.LIVE_REPLAY_S3_ENDPOINT ?? "").trim();
  const forcePathStyle =
    (process.env.LIVE_REPLAY_S3_FORCE_PATH_STYLE ?? "true").trim().toLowerCase() !==
    "false";

  let publicBaseUrl = (process.env.LIVE_REPLAY_PUBLIC_BASE_URL ?? "").trim();
  if (!publicBaseUrl) {
    const supabaseUrl = (process.env.SUPABASE_URL ?? "").trim().replace(/\/$/, "");
    if (supabaseUrl) {
      publicBaseUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}`;
    }
  } else {
    publicBaseUrl = publicBaseUrl.replace(/\/$/, "");
  }

  if (!accessKey || !secret || !endpoint || !publicBaseUrl) {
    return null;
  }

  return {
    accessKey,
    secret,
    bucket,
    region,
    endpoint: endpoint.replace(/\/$/, ""),
    forcePathStyle,
    publicBaseUrl,
  };
}

export function liveReplayObjectPath(liveId: string): string {
  const stamp = Date.now().toString(36);
  return `lives/${liveId}/${stamp}.mp4`;
}

export function liveReplayPublicUrl(
  cfg: LiveReplayS3Config,
  storagePath: string,
): string {
  const path = storagePath.replace(/^\//, "");
  return `${cfg.publicBaseUrl}/${path}`;
}

export function liveReplayExpiresAt(from: Date = new Date()): string {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + LIVE_REPLAY_RETENTION_DAYS);
  return d.toISOString();
}
