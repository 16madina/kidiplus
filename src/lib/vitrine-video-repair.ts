// Conversion en masse des anciennes vidéos .mov (QuickTime/HEVC) en MP4/H.264.
//
// Le runtime serveur (Cloudflare Worker) n'a pas ffmpeg : le ré-encodage est
// donc exécuté par le navigateur de l'admin (Safari/macOS/iOS décodent HEVC),
// puis le nouveau fichier est réuploadé et la publication mise à jour via une
// RPC réservée aux admins.

import { supabase } from "@/integrations/supabase/client";
import { transcodeMovToMp4 } from "@/lib/video-transcode";
import { resolveVitrinePublicUrl, uploadVitrineMedia, uploadVitrinePoster } from "@/lib/vitrine-db";

export type LegacyVideoPost = {
  id: string;
  url: string;
  userId: string;
  createdAt: string;
};

export type RepairOutcome = {
  post: LegacyVideoPost;
  status: "converted" | "skipped" | "failed";
  message?: string;
};

const MOV_RE = /\.(mov|qt)(\?|$)/i;

/** Liste les publications vidéo dont le média est un .mov hérité. */
export async function listLegacyMovPosts(limit = 200): Promise<LegacyVideoPost[]> {
  const { data, error } = await supabase
    .from("vitrine_posts")
    .select("id, user_id, media_urls, created_at")
    .eq("media_type", "video")
    .eq("active", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];

  const out: LegacyVideoPost[] = [];
  for (const row of data) {
    const urls = Array.isArray(row.media_urls) ? (row.media_urls as unknown[]) : [];
    const url = typeof urls[0] === "string" ? (urls[0] as string) : "";
    if (!url || !MOV_RE.test(url)) continue;
    out.push({ id: row.id, url, userId: row.user_id, createdAt: row.created_at });
  }
  return out;
}

async function downloadAsFile(url: string): Promise<File | null> {
  try {
    const res = await fetch(resolveVitrinePublicUrl(url), { cache: "no-store" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (blob.size <= 0) return null;
    const name = (url.split("/").pop() || "video.mov").split("?")[0];
    return new File([blob], name, { type: blob.type || "video/quicktime" });
  } catch {
    return null;
  }
}

/** Convertit une publication. Renvoie le résultat détaillé (jamais throw). */
export async function repairLegacyMovPost(
  post: LegacyVideoPost,
  onProgress?: (ratio: number) => void,
): Promise<RepairOutcome> {
  const file = await downloadAsFile(post.url);
  if (!file) return { post, status: "failed", message: "download_failed" };

  let mp4: File;
  try {
    mp4 = await transcodeMovToMp4(file, onProgress);
  } catch (e) {
    return { post, status: "failed", message: (e as Error)?.message || "transcode_failed" };
  }
  if (mp4 === file || !/mp4/i.test(mp4.type)) {
    return { post, status: "skipped", message: "unsupported_on_this_device" };
  }

  const newUrl = await uploadVitrineMedia(mp4);
  if (!newUrl) return { post, status: "failed", message: "upload_failed" };

  const poster = await uploadVitrinePoster(mp4);

  const { data, error } = await supabase.rpc("admin_replace_vitrine_video", {
    _post_id: post.id,
    _new_url: newUrl,
    _new_poster: poster,
  });
  const res = data as { ok?: boolean; error?: string } | null;
  if (error || !res?.ok) {
    return { post, status: "failed", message: error?.message || res?.error || "db_update_failed" };
  }
  return { post, status: "converted" };
}

/** Traite la file séquentiellement (un encodage à la fois pour l'appareil). */
export async function repairAllLegacyMovPosts(
  posts: LegacyVideoPost[],
  onEach: (outcome: RepairOutcome, index: number) => void,
  onProgress?: (index: number, ratio: number) => void,
): Promise<RepairOutcome[]> {
  const results: RepairOutcome[] = [];
  for (let i = 0; i < posts.length; i++) {
    const outcome = await repairLegacyMovPost(posts[i], (r) => onProgress?.(i, r));
    results.push(outcome);
    onEach(outcome, i);
  }
  return results;
}
