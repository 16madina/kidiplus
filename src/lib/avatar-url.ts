import { supabase } from "@/integrations/supabase/client";

// In-memory cache of avatar path -> signed URL (bucket is private).
const cache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Resolves an avatar_url stored in profiles to a displayable URL.
 * - Already-absolute URLs (http/https) are returned as-is (external avatars).
 * - Bucket paths (e.g. "<uid>/avatar.jpg") are signed on demand and cached.
 */
export async function resolveAvatarUrl(
  value: string | null | undefined,
): Promise<string | null> {
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;

  const cached = cache.get(value);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;

  const { data, error } = await supabase.storage
    .from("avatars")
    .createSignedUrl(value, 60 * 60 * 24 * 7); // 7 days
  if (error || !data) return null;
  cache.set(value, {
    url: data.signedUrl,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7,
  });
  return data.signedUrl;
}

export function bustAvatarCache(url: string | null, version?: string | number | null) {
  if (!url) return null;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}v=${encodeURIComponent(String(version ?? Date.now()))}`;
}

export function invalidateAvatar(value: string | null | undefined) {
  if (value) cache.delete(value);
}
