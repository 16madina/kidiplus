/**
 * Helpers to keep DB storage refs as durable object paths.
 * Never persist ephemeral signed URLs — always re-sign at display time.
 */

const BUCKETS = ["live-products", "live-covers", "shop-products", "avatars"] as const;
export type StorageBucket = (typeof BUCKETS)[number];

/**
 * If `value` is a Supabase Storage public/sign/render URL for a known bucket,
 * return { bucket, path }. Otherwise null (external CDN, blob, raw path, etc.).
 */
export function parseSupabaseStorageUrl(
  value: string,
): { bucket: StorageBucket; path: string } | null {
  const trimmed = value.trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) return null;

  const match = trimmed.match(
    /\/storage\/v1\/(?:object|render\/image)\/(?:public|sign)\/([^/]+)\/([^?]+)/i,
  );
  if (!match?.[1] || !match[2]) return null;

  const bucket = decodeURIComponent(match[1]);
  if (!(BUCKETS as readonly string[]).includes(bucket)) return null;

  return {
    bucket: bucket as StorageBucket,
    path: decodeURIComponent(match[2]),
  };
}

/** Strip a leading "bucket/" prefix if the client stored it that way. */
export function stripBucketPrefix(path: string, bucket: string): string {
  const re = new RegExp(`^${bucket.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`, "i");
  return path.replace(/^\/+/, "").replace(re, "");
}

/**
 * Prefer a durable storage path for DB writes.
 * - Supabase signed/public URL → object path
 * - Already a path → as-is
 * - External http(s) / blob / data → unchanged (caller may upload separately)
 */
export function durableStorageRef(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^(blob:|data:)/i.test(trimmed)) return trimmed;
  const parsed = parseSupabaseStorageUrl(trimmed);
  if (parsed) return parsed.path;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return trimmed.replace(/^\/+/, "");
}
