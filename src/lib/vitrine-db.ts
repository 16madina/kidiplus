// Vitrine feed: posts, likes, comments, stories.
// Tables are additive (see supabase/migrations/*_vitrine.sql).
// When tables are missing or empty, we fall back to demo posts so Pour toi is never blank.

import { supabase } from "@/integrations/supabase/client";

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
};

export type VitrineStory = {
  id: string;
  user_id: string;
  media_url: string;
  expires_at: string;
  created_at: string;
  unread?: boolean;
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
      "https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?w=1080&q=80",
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
      "https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=1080&q=80",
      "https://images.unsplash.com/photo-1606107557195-0e29a4b5b4aa?w=1080&q=80",
      "https://images.unsplash.com/photo-1600185365483-26d7a4cc7519?w=1080&q=80",
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
      "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=1080&q=80",
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
      "https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=1080&q=80",
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
      "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?w=1080&q=80",
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
      "https://images.unsplash.com/photo-1585386959984-a4155224a1ad?w=1080&q=80",
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
    media_url: "https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&q=70",
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    created_at: new Date().toISOString(),
    unread: true,
    seller: { display_name: "Maison Or", handle: "maisonor", avatar_url: "https://i.pravatar.cc/120?u=maisonor" },
  },
  {
    id: "demo-s2",
    user_id: "demo-u2",
    media_url: "https://images.unsplash.com/photo-1469334031218-e382a71b716b?w=400&q=70",
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    created_at: new Date().toISOString(),
    unread: true,
    seller: { display_name: "KickLab", handle: "kicklab", avatar_url: "https://i.pravatar.cc/120?u=kicklab" },
  },
  {
    id: "demo-s3",
    user_id: "demo-u3",
    media_url: "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=400&q=70",
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

export async function fetchVitrinePosts(limit = 30): Promise<VitrinePost[]> {
  try {
    const { data, error } = await sb
      .from("vitrine_posts")
      .select(
        `
        id, user_id, media_type, media_urls, caption, product_id, live_id,
        like_count, comment_count, created_at, active,
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

    return data.map((r: any) => ({
      id: r.id,
      user_id: r.user_id,
      media_type: (r.media_type ?? "image") as VitrineMediaType,
      media_urls: normalizeMediaUrls(r.media_urls),
      caption: r.caption,
      product_id: r.product_id,
      live_id: r.live_id,
      like_count: Number(r.like_count ?? 0),
      comment_count: Number(r.comment_count ?? 0),
      created_at: r.created_at,
      liked_by_me: likedIds.has(r.id),
      seller: r.seller ?? null,
      live_status: r.live_id ? (liveStatus.get(r.live_id) ?? null) : null,
    }));
  } catch {
    return DEMO_POSTS;
  }
}

export async function fetchVitrineStories(limit = 30): Promise<VitrineStory[]> {
  try {
    const { data, error } = await sb
      .from("vitrine_stories")
      .select(
        `
        id, user_id, media_url, expires_at, created_at,
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
      media_url: r.media_url,
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
