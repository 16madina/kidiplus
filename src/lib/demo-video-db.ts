// Demo assets runtime source.
//
// The demo COVER image and demo VIDEO can be replaced live by an admin,
// without a redeploy. Their URLs and a shared `demo_version` counter are
// stored in `public.app_config` and are readable by everyone (anon +
// authenticated) via a scoped RLS policy on keys matching `demo_%`.
//
// - Cover is uploaded to the private `demo-covers` bucket; we mint a
//   long-lived signed URL and store it in app_config.
// - Video is uploaded to the private `demo-videos` bucket; same pattern.
// - Every replacement bumps `demo_version`, and the client appends
//   `?v=<demo_version>` to both URLs so the browser and every CDN treat a
//   re-upload as a brand-new resource (no stale cache).

import { supabase } from "@/integrations/supabase/client";
import demoVideoAsset from "@/assets/demo-video.mov.asset.json";
import demoCoverAsset from "@/assets/demo-live-cover.jpg.asset.json";
// Bundled same-origin hashed asset (same pattern as the Live tab badge).
// Do NOT use `/demo-live-poster.jpg` in public/ — Lovable returns 403 for it.
// Do NOT rely on `/__l5e/...` alone — it often fails inside Capacitor WebViews.
import demoPosterBundled from "@/assets/img/demo-live-poster.jpg";

export const DEMO_VIDEO_FALLBACK_URL = demoVideoAsset.url;
/** Always-available poster baked into the JS/CSS bundle. */
export const DEMO_COVER_BUNDLED_URL = demoPosterBundled;
export const DEMO_COVER_FALLBACK_URL = demoPosterBundled;
export const DEMO_COVER_LOVABLE_URL = demoCoverAsset.url;

export const DEMO_VIDEO_CONFIG_KEY = "demo_video_url";
// v2: ignore stale `demo_cover_url` Storage overrides that broke the home card.
export const DEMO_COVER_CONFIG_KEY = "demo_cover_url_v2";
export const DEMO_VERSION_CONFIG_KEY = "demo_version";

export const DEMO_VIDEO_BUCKET = "demo-videos";
export const DEMO_COVER_BUCKET = "demo-covers";

// 10 years — signed URLs are long-lived; re-upload rotates the URL anyway.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365 * 10;

export type DemoConfig = {
  videoUrl: string;
  coverUrl: string;
  version: string;
};

/** Fetch demo config (cover + video + version) from app_config, with
 *  bundled fallbacks. Version defaults to "0" so cache-bust is still
 *  present even on a fresh project. */
export async function fetchDemoConfig(): Promise<DemoConfig> {
  const { data } = await supabase
    .from("app_config")
    .select("key,value")
    .in("key", [DEMO_VIDEO_CONFIG_KEY, DEMO_COVER_CONFIG_KEY, DEMO_VERSION_CONFIG_KEY]);
  const map = new Map<string, string>();
  (data ?? []).forEach((r) => map.set(r.key, r.value));
  return {
    videoUrl: map.get(DEMO_VIDEO_CONFIG_KEY) || DEMO_VIDEO_FALLBACK_URL,
    coverUrl: map.get(DEMO_COVER_CONFIG_KEY) || DEMO_COVER_FALLBACK_URL,
    version: map.get(DEMO_VERSION_CONFIG_KEY) || "0",
  };
}

/** Append `?v=<version>` to a URL (preserving any existing query string). */
export function withVersion(url: string, version: string): string {
  if (!url) return url;
  return url + (url.includes("?") ? "&" : "?") + "v=" + encodeURIComponent(version);
}

/** Back-compat helper used elsewhere in the app. */
export async function fetchDemoVideoUrl(): Promise<string> {
  const cfg = await fetchDemoConfig();
  return withVersion(cfg.videoUrl, cfg.version);
}

async function bumpVersion(): Promise<void> {
  const v = Date.now().toString();
  await supabase
    .from("app_config")
    .upsert(
      { key: DEMO_VERSION_CONFIG_KEY, value: v, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
}

async function uploadToBucket(bucket: string, file: File, defaultExt: string) {
  const ext = (file.name.split(".").pop() || defaultExt).toLowerCase();
  const path = `demo-${Date.now()}.${ext}`;
  const up = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "31536000",
    contentType: file.type || undefined,
    upsert: false,
  });
  if (up.error) throw new Error(up.error.message);

  const signed = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error(signed.error?.message || "Failed to create signed URL");
  }
  return { url: signed.data.signedUrl, path };
}

async function writeConfig(key: string, value: string) {
  const { error } = await supabase
    .from("app_config")
    .upsert(
      { key, value, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );
  if (error) throw new Error(error.message);
}

export type UploadDemoResult = { url: string; path: string };

export async function uploadDemoVideo(file: File): Promise<UploadDemoResult> {
  const res = await uploadToBucket(DEMO_VIDEO_BUCKET, file, "mp4");
  await writeConfig(DEMO_VIDEO_CONFIG_KEY, res.url);
  await bumpVersion();
  return res;
}

export async function uploadDemoCover(file: File): Promise<UploadDemoResult> {
  const res = await uploadToBucket(DEMO_COVER_BUCKET, file, "jpg");
  await writeConfig(DEMO_COVER_CONFIG_KEY, res.url);
  await bumpVersion();
  return res;
}
