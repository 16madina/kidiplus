// Demo video runtime source.
//
// The demo video URL is stored in `public.app_config` under the key
// `demo_video_url`. When present, it overrides the bundled Lovable Assets
// URL. Admins upload a new .mp4 via the admin panel; the upload lands in
// the private `demo-videos` Storage bucket, we mint a very long-lived
// signed URL, and store it in app_config so every client picks it up.

import { supabase } from "@/integrations/supabase/client";
import demoVideoAsset from "@/assets/demo-video.mov.asset.json";

export const DEMO_VIDEO_FALLBACK_URL = demoVideoAsset.url;
export const DEMO_VIDEO_CONFIG_KEY = "demo_video_url";
export const DEMO_VIDEO_BUCKET = "demo-videos";

// 10 years — signed URLs are long-lived; re-upload rotates the URL anyway.
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365 * 10;

export async function fetchDemoVideoUrl(): Promise<string> {
  const { data, error } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", DEMO_VIDEO_CONFIG_KEY)
    .maybeSingle();
  if (error || !data?.value) return DEMO_VIDEO_FALLBACK_URL;
  return data.value;
}

export type UploadDemoResult = { url: string; path: string };

export async function uploadDemoVideo(file: File): Promise<UploadDemoResult> {
  const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
  const path = `demo-${Date.now()}.${ext}`;

  const up = await supabase.storage
    .from(DEMO_VIDEO_BUCKET)
    .upload(path, file, {
      cacheControl: "31536000",
      contentType: file.type || "video/mp4",
      upsert: false,
    });
  if (up.error) throw new Error(up.error.message);

  const signed = await supabase.storage
    .from(DEMO_VIDEO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (signed.error || !signed.data?.signedUrl) {
    throw new Error(signed.error?.message || "Failed to create signed URL");
  }
  const url = signed.data.signedUrl;

  const { error: cfgErr } = await supabase
    .from("app_config")
    .upsert(
      { key: DEMO_VIDEO_CONFIG_KEY, value: url, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    );
  if (cfgErr) throw new Error(cfgErr.message);

  return { url, path };
}
