import { supabase } from "@/integrations/supabase/client";

// In-memory cache of avatar path -> signed URL (bucket is private).
const cache = new Map<string, { url: string; expiresAt: number }>();

/**
 * Normalize profiles.avatar_url into a storage object path when possible.
 * Handles raw paths and expired Supabase signed/public URLs so we can re-sign.
 */
function avatarStoragePath(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (!/^https?:\/\//i.test(trimmed)) {
    return trimmed.replace(/^\/+/, "").replace(/^avatars\//i, "");
  }

  const storageMatch = trimmed.match(
    /\/storage\/v1\/object\/(?:public|sign)\/avatars\/([^?]+)/i,
  );
  if (storageMatch?.[1]) return decodeURIComponent(storageMatch[1]);

  const renderMatch = trimmed.match(
    /\/storage\/v1\/render\/image\/public\/avatars\/([^?]+)/i,
  );
  if (renderMatch?.[1]) return decodeURIComponent(renderMatch[1]);

  return null;
}

/**
 * Resolves an avatar_url stored in profiles to a displayable URL.
 * - External http(s) URLs (non-Supabase) are returned as-is.
 * - Bucket paths and Supabase storage URLs are signed on demand and cached.
 */
export async function resolveAvatarUrl(
  value: string | null | undefined,
): Promise<string | null> {
  if (!value) return null;

  const path = avatarStoragePath(value);
  if (!path) {
    // Non-Supabase absolute URL (CDN, pravatar, etc.)
    return /^https?:\/\//i.test(value) ? value : null;
  }

  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.url;

  const { data, error } = await supabase.storage
    .from("avatars")
    .createSignedUrl(path, 60 * 60 * 24 * 7); // 7 days
  if (error || !data) return null;
  cache.set(path, {
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
  if (!value) return;
  const path = avatarStoragePath(value);
  if (path) cache.delete(path);
  cache.delete(value);
}
