// Vitrine feed: posts, likes, comments, stories.
// Tables are additive (see supabase/migrations/*_vitrine.sql).
// When tables are missing or empty, we fall back to demo posts so Pour toi is never blank.

import { supabase } from "@/integrations/supabase/client";
import { parseSupabaseStorageUrl } from "@/lib/storage-path";
import {
  MUSIC_COLUMNS,
  musicFromRow,
  musicToRow,
  type VitrineMusic,
} from "@/lib/vitrine-music";
import vitrine1 from "@/assets/vitrine/vitrine-1.jpg";
import vitrine2 from "@/assets/vitrine/vitrine-2.jpg";
import vitrine2b from "@/assets/vitrine/vitrine-2b.jpg";
import vitrine2c from "@/assets/vitrine/vitrine-2c.jpg";
import vitrine3 from "@/assets/vitrine/vitrine-3.jpg";
import vitrine4 from "@/assets/vitrine/vitrine-4.jpg";
import vitrine5 from "@/assets/vitrine/vitrine-5.jpg";
import vitrine6 from "@/assets/vitrine/vitrine-6.jpg";

export type VitrineMediaType = "image" | "video" | "carousel";

export type VitrinePost = {
  id: string;
  user_id: string | null;
  media_type: VitrineMediaType;
  media_urls: string[];
  caption: string | null;
  product_id: string | null;
  live_id: string | null;
  like_count: number;
  comment_count: number;
  created_at: string;
  demo?: boolean;
  liked_by_me?: boolean;
  seller?: {
    display_name: string | null;
    handle: string | null;
    avatar_url: string | null;
    is_verified?: boolean;
  } | null;
  /** Resolved live status for CTA when live_id is set. */
  live_status?: "live" | "scheduled" | "ended" | null;
  /** Musique ajoutée à la publication (bibliothèque ou import). */
  music?: VitrineMusic | null;
};

export type VitrineStory = {
  id: string;
  user_id: string;
  media_url: string;
  expires_at: string;
  created_at: string;
  unread?: boolean;
  music?: VitrineMusic | null;
  seller?: {
    display_name: string | null;
    handle: string | null;
    avatar_url: string | null;
  } | null;
};

export type VitrineComment = {
  id: string;
  post_id: string;
  user_id: string;
  body: string;
  created_at: string;
  author?: {
    display_name: string | null;
    handle: string | null;
    avatar_url: string | null;
  } | null;
};

const DEMO_POSTS: VitrinePost[] = [
  {
    id: "demo-1",
    user_id: null,
    media_type: "image",
    media_urls: [
      vitrine1,
    ],
    caption: "Nouvelle collection été — dispo en live ce soir ✨",
    product_id: null,
    live_id: null,
    like_count: 128,
    comment_count: 14,
    created_at: new Date(Date.now() - 3_600_000).toISOString(),
    demo: true,
    seller: { display_name: "Maison Or", handle: "maisonor", avatar_url: "https://i.pravatar.cc/120?u=maisonor" },
  },
  {
    id: "demo-2",
    user_id: null,
    media_type: "carousel",
    media_urls: [
      vitrine2,
      vitrine2b,
      vitrine2c,
    ],
    caption: "Sneakers limited drop — enchères en live demain",
    product_id: "demo-product",
    live_id: null,
    like_count: 342,
    comment_count: 41,
    created_at: new Date(Date.now() - 7_200_000).toISOString(),
    demo: true,
    seller: { display_name: "KickLab", handle: "kicklab", avatar_url: "https://i.pravatar.cc/120?u=kicklab" },
  },
  {
    id: "demo-3",
    user_id: null,
    media_type: "image",
    media_urls: [
      vitrine3,
    ],
    caption: "Beauté glow — swatches en boutique",
    product_id: "demo-product",
    live_id: null,
    like_count: 89,
    comment_count: 7,
    created_at: new Date(Date.now() - 14_400_000).toISOString(),
    demo: true,
    seller: { display_name: "Glow By Aïcha", handle: "glowbyaicha", avatar_url: "https://i.pravatar.cc/120?u=glow" },
  },
  {
    id: "demo-4",
    user_id: null,
    media_type: "image",
    media_urls: [
      vitrine4,
    ],
    caption: "Montres & accessoires — stock limité",
    product_id: null,
    live_id: null,
    like_count: 56,
    comment_count: 3,
    created_at: new Date(Date.now() - 28_800_000).toISOString(),
    demo: true,
    seller: { display_name: "Chrono+ ", handle: "chronoplus", avatar_url: "https://i.pravatar.cc/120?u=chrono" },
  },
  {
    id: "demo-5",
    user_id: null,
    media_type: "image",
    media_urls: [
      vitrine5,
    ],
    caption: "Mode femme — look du jour",
    product_id: "demo-product",
    live_id: null,
    like_count: 210,
    comment_count: 22,
    created_at: new Date(Date.now() - 43_200_000).toISOString(),
    demo: true,
    seller: { display_name: "Atelier Lune", handle: "atelierlune", avatar_url: "https://i.pravatar.cc/120?u=lune" },
  },
  {
    id: "demo-6",
    user_id: null,
    media_type: "image",
    media_urls: [
      vitrine6,
    ],
    caption: "Parfums niche — découvre en live",
    product_id: null,
    live_id: null,
    like_count: 167,
    comment_count: 18,
    created_at: new Date(Date.now() - 86_400_000).toISOString(),
    demo: true,
    seller: { display_name: "Scent Room", handle: "scentroom", avatar_url: "https://i.pravatar.cc/120?u=scent" },
  },
];

const DEMO_STORIES: VitrineStory[] = [
  {
    id: "demo-s1",
    user_id: "demo-u1",
    media_url: vitrine1,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    created_at: new Date().toISOString(),
    unread: true,
    seller: { display_name: "Maison Or", handle: "maisonor", avatar_url: "https://i.pravatar.cc/120?u=maisonor" },
  },
  {
    id: "demo-s2",
    user_id: "demo-u2",
    media_url: vitrine2,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    created_at: new Date().toISOString(),
    unread: true,
    seller: { display_name: "KickLab", handle: "kicklab", avatar_url: "https://i.pravatar.cc/120?u=kicklab" },
  },
  {
    id: "demo-s3",
    user_id: "demo-u3",
    media_url: vitrine3,
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    created_at: new Date().toISOString(),
    unread: false,
    seller: { display_name: "Glow By Aïcha", handle: "glowbyaicha", avatar_url: "https://i.pravatar.cc/120?u=glow" },
  },
];

type AnySb = {
  from: (t: string) => any;
  auth: { getUser: () => Promise<{ data: { user: { id: string } | null } }> };
};

const sb = supabase as unknown as AnySb;

/** Legacy media were uploaded to a previous Supabase project host. */
const LEGACY_STORAGE_HOSTS = ["https://rpersnzjidxtlekbbdtp.supabase.co"];
const CURRENT_STORAGE_HOST = "https://djwuvxpmvrwfjwjamjno.supabase.co";

export function rewriteStorageHost(url: string): string {
  let out = url;
  for (const host of LEGACY_STORAGE_HOSTS) {
    if (out.startsWith(host)) out = CURRENT_STORAGE_HOST + out.slice(host.length);
  }
  return out;
}

/** Rewrite stored Supabase URLs onto the current project so old hosts still play. */
export function resolveVitrinePublicUrl(url: string): string {
  if (!url || url.startsWith("/") || url.startsWith("blob:") || url.startsWith("data:")) {
    return url;
  }
  const rewritten = rewriteStorageHost(url);
  const parsed = parseSupabaseStorageUrl(rewritten);
  if (!parsed) return rewritten;
  const { data } = supabase.storage.from(parsed.bucket).getPublicUrl(parsed.path);
  return data.publicUrl || rewritten;
}

function normalizeMediaUrls(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((u) => typeof u === "string") as string[];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.filter((u) => typeof u === "string");
    } catch { /* ignore */ }
    return [raw];
  }
  return [];
}

function mapPostMedia(raw: unknown): string[] {
  return normalizeMediaUrls(raw).map(resolveVitrinePublicUrl);
}

export async function fetchVitrinePosts(limit = 30): Promise<VitrinePost[]> {
  try {
    const { data, error } = await sb
      .from("vitrine_posts")
      .select(
        `
        id, user_id, media_type, media_urls, caption, product_id, live_id,
        like_count, comment_count, created_at, active, ${MUSIC_COLUMNS},
        seller:profiles!vitrine_posts_user_id_fkey(display_name, handle, avatar_url, is_verified)
        `,
      )
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data || data.length === 0) return DEMO_POSTS;

    const uid = (await sb.auth.getUser()).data.user?.id ?? null;
    let likedIds = new Set<string>();
    if (uid) {
      const { data: likes } = await sb
        .from("vitrine_likes")
        .select("post_id")
        .eq("user_id", uid)
        .in(
          "post_id",
          data.map((r: { id: string }) => r.id),
        );
      likedIds = new Set((likes ?? []).map((l: { post_id: string }) => l.post_id));
    }

    const liveIds = data
      .map((r: { live_id: string | null }) => r.live_id)
      .filter(Boolean) as string[];
    const liveStatus = new Map<string, "live" | "scheduled" | "ended">();
    if (liveIds.length) {
      const { data: lives } = await sb
        .from("lives")
        .select("id, status")
        .in("id", liveIds);
      for (const l of lives ?? []) {
        liveStatus.set(l.id, l.status);
      }
    }

    return data
      .map((r: any) => {
        const media_urls = mapPostMedia(r.media_urls);
        if (media_urls.length === 0 && !r.live_id) return null;
        return {
          id: r.id,
          user_id: r.user_id,
          media_type: (r.media_type ?? "image") as VitrineMediaType,
          media_urls,
          caption: r.caption,
          product_id: r.product_id,
          live_id: r.live_id,
          like_count: Number(r.like_count ?? 0),
          comment_count: Number(r.comment_count ?? 0),
          created_at: r.created_at,
          liked_by_me: likedIds.has(r.id),
          music: musicFromRow(r),
          seller: r.seller ?? null,
          live_status: r.live_id ? (liveStatus.get(r.live_id) ?? null) : null,
        } satisfies VitrinePost;
      })
      .filter(Boolean) as VitrinePost[];
  } catch {
    return DEMO_POSTS;
  }
}

/** Fetch a single Vitrine post by id (deep-link from like/comment notifications). */
export async function fetchVitrinePostById(postId: string): Promise<VitrinePost | null> {
  if (!postId || postId.startsWith("demo-")) {
    return DEMO_POSTS.find((p) => p.id === postId) ?? null;
  }
  try {
    const { data, error } = await sb
      .from("vitrine_posts")
      .select(
        `
        id, user_id, media_type, media_urls, caption, product_id, live_id,
        like_count, comment_count, created_at, active, ${MUSIC_COLUMNS},
        seller:profiles!vitrine_posts_user_id_fkey(display_name, handle, avatar_url, is_verified)
        `,
      )
      .eq("id", postId)
      .maybeSingle();
    if (error || !data) return null;

    const uid = (await sb.auth.getUser()).data.user?.id ?? null;
    let liked = false;
    if (uid) {
      const { data: like } = await sb
        .from("vitrine_likes")
        .select("post_id")
        .eq("user_id", uid)
        .eq("post_id", postId)
        .maybeSingle();
      liked = !!like;
    }

    let liveStatus: "live" | "scheduled" | "ended" | null = null;
    if (data.live_id) {
      const { data: live } = await sb
        .from("lives")
        .select("id, status")
        .eq("id", data.live_id)
        .maybeSingle();
      liveStatus = (live?.status as "live" | "scheduled" | "ended" | undefined) ?? null;
    }

    return {
      id: data.id,
      user_id: data.user_id,
      media_type: (data.media_type ?? "image") as VitrineMediaType,
      media_urls: mapPostMedia(data.media_urls),
      caption: data.caption,
      product_id: data.product_id,
      live_id: data.live_id,
      like_count: Number(data.like_count ?? 0),
      comment_count: Number(data.comment_count ?? 0),
      created_at: data.created_at,
      liked_by_me: liked,
      seller: data.seller ?? null,
      live_status: liveStatus,
    };
  } catch {
    return null;
  }
}

/** Posts published by one user — used on the shop Vitrine tab. */
export async function fetchVitrinePostsByUser(
  userId: string,
  limit = 60,
): Promise<VitrinePost[]> {
  if (!userId) return [];
  try {
    const { data, error } = await sb
      .from("vitrine_posts")
      .select(
        `id, user_id, media_type, media_urls, caption, product_id, live_id, like_count, comment_count, created_at, active, ${MUSIC_COLUMNS}`,
      )
      .eq("user_id", userId)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data
      .map((r: any) => {
        const media_urls = mapPostMedia(r.media_urls);
        if (media_urls.length === 0 && !r.live_id) return null;
        return {
          id: r.id,
          user_id: r.user_id,
          media_type: (r.media_type ?? "image") as VitrineMediaType,
          media_urls,
          caption: r.caption,
          product_id: r.product_id,
          live_id: r.live_id,
          like_count: Number(r.like_count ?? 0),
          comment_count: Number(r.comment_count ?? 0),
          created_at: r.created_at,
        } satisfies VitrinePost;
      })
      .filter(Boolean) as VitrinePost[];
  } catch {
    return [];
  }
}

export async function countVitrinePostsByUser(userId: string): Promise<number> {
  if (!userId) return 0;
  try {
    const { count } = await sb
      .from("vitrine_posts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("active", true);
    return count ?? 0;
  } catch {
    return 0;
  }
}

export async function fetchVitrineStories(limit = 30): Promise<VitrineStory[]> {
  try {
    const { data, error } = await sb
      .from("vitrine_stories")
      .select(
        `
        id, user_id, media_url, expires_at, created_at, ${MUSIC_COLUMNS},
        seller:profiles!vitrine_stories_user_id_fkey(display_name, handle, avatar_url)
        `,
      )
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data || data.length === 0) return DEMO_STORIES;
    return data.map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      media_url: r.media_url ? resolveVitrinePublicUrl(r.media_url) : r.media_url,
      expires_at: r.expires_at,
      created_at: r.created_at,
      unread: true,
      seller: r.seller ?? null,
    }));
  } catch {
    return DEMO_STORIES;
  }
}

export async function toggleVitrineLike(
  postId: string,
  currentlyLiked: boolean,
): Promise<{ ok: boolean; liked: boolean }> {
  if (postId.startsWith("demo-")) {
    return { ok: true, liked: !currentlyLiked };
  }
  const uid = (await sb.auth.getUser()).data.user?.id;
  if (!uid) return { ok: false, liked: currentlyLiked };
  try {
    if (currentlyLiked) {
      const { error } = await sb
        .from("vitrine_likes")
        .delete()
        .eq("post_id", postId)
        .eq("user_id", uid);
      if (error) return { ok: false, liked: currentlyLiked };
      return { ok: true, liked: false };
    }
    const { error } = await sb
      .from("vitrine_likes")
      .insert({ post_id: postId, user_id: uid });
    if (error) return { ok: false, liked: currentlyLiked };
    return { ok: true, liked: true };
  } catch {
    return { ok: false, liked: currentlyLiked };
  }
}

export async function fetchVitrineComments(
  postId: string,
  limit = 40,
): Promise<VitrineComment[]> {
  if (postId.startsWith("demo-")) return [];
  try {
    const { data, error } = await sb
      .from("vitrine_comments")
      .select(
        `
        id, post_id, user_id, body, created_at,
        author:profiles!vitrine_comments_user_id_fkey(display_name, handle, avatar_url)
        `,
      )
      .eq("post_id", postId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data.map((r: any) => ({
      id: r.id,
      post_id: r.post_id,
      user_id: r.user_id,
      body: r.body,
      created_at: r.created_at,
      author: r.author ?? null,
    }));
  } catch {
    return [];
  }
}

export async function addVitrineComment(
  postId: string,
  body: string,
): Promise<VitrineComment | null> {
  if (postId.startsWith("demo-")) return null;
  const uid = (await sb.auth.getUser()).data.user?.id;
  if (!uid) return null;
  const trimmed = body.trim();
  if (!trimmed) return null;
  try {
    const { data, error } = await sb
      .from("vitrine_comments")
      .insert({ post_id: postId, user_id: uid, body: trimmed })
      .select("id, post_id, user_id, body, created_at")
      .maybeSingle();
    if (error || !data) return null;
    return data as VitrineComment;
  } catch {
    return null;
  }
}

export function vitrinePostShareUrl(postId: string): string {
  return `https://kidiplus.com/?vitrine=${encodeURIComponent(postId)}`;
}

export function isVideoUrl(url: string): boolean {
  return /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url) || url.includes("video/");
}

const VITRINE_MAX_BYTES = 100 * 1024 * 1024; // match storage bucket (100 MiB)

function guessVitrineContentType(file: File): string {
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    gif: "image/gif",
    heic: "image/heic",
    heif: "image/heif",
    mp4: "video/mp4",
    m4v: "video/mp4",
    mov: "video/quicktime",
    qt: "video/quicktime",
    webm: "video/webm",
    "3gp": "video/3gpp",
    "3gpp": "video/3gpp",
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    aac: "audio/aac",
    wav: "audio/wav",
    ogg: "audio/ogg",
    oga: "audio/ogg",
    flac: "audio/flac",
  };
  return map[ext] || "application/octet-stream";
}

export type VitrineUploadResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export type UploadProgress = (fraction: number) => void;

const SUPABASE_STORAGE_ORIGIN = CURRENT_STORAGE_HOST;

/** PUT direct vers l'URL signée avec progression réelle (XHR). */
function putWithProgress(
  signedPath: string,
  file: File,
  contentType: string,
  onProgress?: UploadProgress,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    try {
      const clean = signedPath.startsWith("http")
        ? signedPath
        : `${SUPABASE_STORAGE_ORIGIN}/storage/v1${signedPath.startsWith("/") ? "" : "/"}${signedPath}`;
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", clean, true);
      xhr.setRequestHeader("Content-Type", contentType);
      xhr.setRequestHeader("x-upsert", "false");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) onProgress?.(e.loaded / e.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(1);
          resolve({ ok: true });
        } else {
          resolve({ ok: false, error: `http_${xhr.status}` });
        }
      };
      xhr.onerror = () => resolve({ ok: false, error: "network_error" });
      xhr.send(file);
    } catch (e) {
      resolve({ ok: false, error: e instanceof Error ? e.message : "upload_failed" });
    }
  });
}

/** Upload an image/video into the public vitrine-media bucket. */
export async function uploadVitrineMedia(
  file: File,
  onProgress?: UploadProgress,
): Promise<string | null> {
  const r = await uploadVitrineMediaDetailed(file, onProgress);
  return r.ok ? r.url : null;
}


async function requestSignedUpload(
  file: File,
  contentType: string,
  ext: string,
  onProgress?: UploadProgress,
) {
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) return null;

  const res = await fetch("/api/vitrine/signed-upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ ext, contentType }),
  });
  if (!res.ok) {
    let message = `http_${res.status}`;
    try {
      const j = (await res.json()) as { message?: string; error?: string };
      message = j.message || j.error || message;
    } catch {
      /* ignore */
    }
    console.warn("[vitrine] signed-upload API failed", message);
    return { error: message } as const;
  }
  const j = (await res.json()) as {
    ok?: boolean;
    path?: string;
    token?: string;
    publicUrl?: string;
    signedUrl?: string;
  };
  if (!j.path || !j.token || !j.publicUrl) {
    return { error: "signed_url_failed" } as const;
  }

  // Chemin rapide avec progression réelle.
  if (j.signedUrl) {
    const put = await putWithProgress(j.signedUrl, file, contentType, onProgress);
    if (put.ok) return { url: j.publicUrl } as const;
    console.warn("[vitrine] direct PUT failed, fallback SDK", put.error);
  }

  const { error: upErr } = await supabase.storage
    .from("vitrine-media")
    .uploadToSignedUrl(j.path, j.token, file, { contentType, upsert: false });
  if (upErr) {
    console.warn("[vitrine] uploadToSignedUrl failed", upErr.message);
    return { error: upErr.message } as const;
  }
  onProgress?.(1);
  return { url: j.publicUrl } as const;
}

/** Same as uploadVitrineMedia but returns a readable error for toasts. */
export async function uploadVitrineMediaDetailed(
  file: File,
  onProgress?: UploadProgress,
): Promise<VitrineUploadResult> {

  const uid = (await sb.auth.getUser()).data.user?.id;
  if (!uid) return { ok: false, error: "not_authenticated" };
  if (file.size <= 0) return { ok: false, error: "empty_file" };
  if (file.size > VITRINE_MAX_BYTES) return { ok: false, error: "file_too_large" };

  const contentType = guessVitrineContentType(file);
  let ext = (file.name.split(".").pop() || "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!ext || ext === "bin") {
    if (contentType.includes("quicktime")) ext = "mov";
    else if (contentType.startsWith("video/")) ext = "mp4";
    else if (contentType === "image/png") ext = "png";
    else if (contentType === "image/webp") ext = "webp";
    else if (contentType.startsWith("image/")) ext = "jpg";
    else if (contentType === "audio/mpeg") ext = "mp3";
    else if (contentType.startsWith("audio/")) ext = "m4a";
    else ext = "bin";
  }

  // Preferred path: server-minted signed URL (works even if storage RLS
  // migrations were never applied on Lovable).
  const signed = await requestSignedUpload(file, contentType, ext);
  if (signed && "url" in signed && signed.url) {
    return { ok: true, url: signed.url };
  }

  // Fallback: direct client upload (needs bucket + insert policy).
  const path = `${uid}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from("vitrine-media").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType,
  });
  if (error) {
    const msg = (error.message || "").toLowerCase();
    const signedMsg = signed && "error" in signed ? String(signed.error) : "";
    if (msg.includes("bucket") || msg.includes("not found") || /bucket/i.test(signedMsg)) {
      return { ok: false, error: "bucket_missing" };
    }
    if (msg.includes("mime") || msg.includes("not supported") || msg.includes("invalid")) {
      return { ok: false, error: "bad_mime" };
    }
    if (msg.includes("maximum") || msg.includes("too large") || msg.includes("size")) {
      return { ok: false, error: "file_too_large" };
    }
    if (msg.includes("row-level") || msg.includes("policy") || msg.includes("denied")) {
      return { ok: false, error: "forbidden" };
    }
    console.warn("[vitrine] upload failed", error.message, signedMsg);
    return { ok: false, error: error.message || signedMsg || "upload_failed" };
  }
  const { data } = supabase.storage.from("vitrine-media").getPublicUrl(path);
  if (!data.publicUrl) return { ok: false, error: "upload_failed" };
  return { ok: true, url: data.publicUrl };
}

export async function createVitrineStory(
  mediaUrl: string,
  music?: VitrineMusic | null,
): Promise<VitrineStory | null> {
  const uid = (await sb.auth.getUser()).data.user?.id;
  if (!uid || !mediaUrl) return null;
  try {
    const { data, error } = await sb
      .from("vitrine_stories")
      .insert({
        user_id: uid,
        media_url: mediaUrl,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        ...musicToRow(music),
      })
      .select(`id, user_id, media_url, expires_at, created_at, ${MUSIC_COLUMNS}`)
      .maybeSingle();
    if (error) {
      console.warn("[vitrine] create story failed", error.message);
      return null;
    }
    if (!data) return null;

    let seller: VitrineStory["seller"] = null;
    try {
      const { data: prof } = await sb
        .from("profiles")
        .select("display_name, handle, avatar_url")
        .eq("id", uid)
        .maybeSingle();
      if (prof) {
        const { resolveAvatarUrl } = await import("@/lib/avatar-url");
        seller = {
          ...prof,
          avatar_url: (await resolveAvatarUrl(prof.avatar_url)) ?? prof.avatar_url,
        };
      }
    } catch {
      /* ignore */
    }

    return {
      id: data.id,
      user_id: data.user_id,
      media_url: data.media_url,
      expires_at: data.expires_at,
      created_at: data.created_at,
      unread: true,
      music: musicFromRow(data),
      seller,
    };
  } catch (e) {
    console.warn("[vitrine] create story exception", e);
    return null;
  }
}

export async function createVitrinePost(input: {
  mediaUrls: string[];
  mediaType: VitrineMediaType;
  caption?: string;
  productId?: string | null;
  liveId?: string | null;
  music?: VitrineMusic | null;
}): Promise<VitrinePost | null> {
  const uid = (await sb.auth.getUser()).data.user?.id;
  // Live announcements may ship with cover URL only, or caption + live_id.
  if (!uid) return null;
  if (input.mediaUrls.length === 0 && !input.liveId) return null;
  try {
    // Insert + plain select (no join) — join-on-insert fails on some PostgREST
    // setups and made publish look broken after a successful upload.
    const { data, error } = await sb
      .from("vitrine_posts")
      .insert({
        user_id: uid,
        media_type: input.mediaType,
        media_urls: input.mediaUrls,
        caption: input.caption?.trim() || null,
        product_id: input.productId ?? null,
        live_id: input.liveId ?? null,
        active: true,
        ...musicToRow(input.music),
      })
      .select(
        `id, user_id, media_type, media_urls, caption, product_id, live_id, like_count, comment_count, created_at, ${MUSIC_COLUMNS}`,
      )
      .maybeSingle();
    if (error) {
      console.warn("[vitrine] create post failed", error.message);
      return null;
    }
    if (!data) return null;

    let seller: VitrinePost["seller"] = null;
    try {
      const { data: prof } = await sb
        .from("profiles")
        .select("display_name, handle, avatar_url, is_verified")
        .eq("id", uid)
        .maybeSingle();
      if (prof) {
        const { resolveAvatarUrl } = await import("@/lib/avatar-url");
        seller = {
          ...prof,
          avatar_url: (await resolveAvatarUrl(prof.avatar_url)) ?? prof.avatar_url,
        };
      }
    } catch {
      /* ignore */
    }

    return {
      id: data.id,
      user_id: data.user_id,
      media_type: (data.media_type ?? "image") as VitrineMediaType,
      media_urls: normalizeMediaUrls(data.media_urls),
      caption: data.caption,
      product_id: data.product_id,
      live_id: data.live_id,
      like_count: Number(data.like_count ?? 0),
      comment_count: Number(data.comment_count ?? 0),
      created_at: data.created_at,
      liked_by_me: false,
      music: musicFromRow(data),
      seller,
      live_status: null,
    };
  } catch (e) {
    console.warn("[vitrine] create post exception", e);
    return null;
  }
}

export async function deleteVitrinePost(postId: string): Promise<boolean> {
  if (!postId || postId.startsWith("demo-")) return false;
  const uid = (await sb.auth.getUser()).data.user?.id;
  if (!uid) return false;
  const { error } = await sb.from("vitrine_posts").delete().eq("id", postId).eq("user_id", uid);
  if (!error) return true;
  const { error: soft } = await sb
    .from("vitrine_posts")
    .update({ active: false })
    .eq("id", postId)
    .eq("user_id", uid);
  if (soft) {
    console.warn("[vitrine] delete post failed", error.message, soft.message);
    return false;
  }
  return true;
}

export async function deleteVitrineStory(storyId: string): Promise<boolean> {
  if (!storyId || storyId.startsWith("demo-")) return false;
  const uid = (await sb.auth.getUser()).data.user?.id;
  if (!uid) return false;
  const { error } = await sb.from("vitrine_stories").delete().eq("id", storyId).eq("user_id", uid);
  if (error) {
    console.warn("[vitrine] delete story failed", error.message);
    return false;
  }
  return true;
}
