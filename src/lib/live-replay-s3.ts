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
  const path = normalizeReplayStoragePath(storagePath) ?? storagePath.replace(/^\//, "");
  return `${cfg.publicBaseUrl}/${path}`;
}

/** Strip leading bucket name from R2/S3 path-style object keys. */
export function normalizeReplayStoragePath(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  let path = value.trim().replace(/^\//, "");
  if (!path) return null;

  const cfg = liveReplayS3Config();
  const bucket = cfg?.bucket;
  if (bucket) {
    const prefix = `${bucket}/`;
    if (path.toLowerCase().startsWith(prefix.toLowerCase())) {
      path = path.slice(prefix.length);
    }
  }
  // Also strip common default bucket names if env bucket differs.
  for (const b of ["kidiplus-live-replays", "live-replays"]) {
    const prefix = `${b}/`;
    if (path.toLowerCase().startsWith(prefix)) {
      path = path.slice(prefix.length);
      break;
    }
  }
  return path || null;
}

/** True for S3/R2 API hosts that browsers cannot stream without signed auth. */
export function isPrivateObjectStorageUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (host.includes("r2.cloudflarestorage.com")) return true;
    if (host.endsWith(".amazonaws.com") && host.includes("s3")) return true;
    return false;
  } catch {
    return false;
  }
}

export function liveReplayExpiresAt(from: Date = new Date()): string {
  const d = new Date(from.getTime());
  d.setUTCDate(d.getUTCDate() + LIVE_REPLAY_RETENTION_DAYS);
  return d.toISOString();
}

