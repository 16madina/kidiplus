import { useEffect, useState } from "react";
import {
  Heart,
  MessageCircle,
  Share2,
  Store,
  Radio,
  Bell,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import { nativeShare } from "@/lib/native";
import { useAuth } from "@/lib/auth-context";
import { useAuthPrompt } from "@/lib/auth-prompt-context";
import { useSellerProfile } from "@/lib/seller-profile-context";
import { useLiveViewer } from "@/lib/live-viewer-context";
import { fetchLiveById } from "@/lib/lives-db";
import {
  addLiveReminder,
  hasLiveReminder,
  removeLiveReminder,
} from "@/lib/live-reminders-db";
import {
  toggleVitrineLike,
  vitrinePostShareUrl,
  type VitrinePost,
} from "@/lib/vitrine-db";
import { resolveAvatarUrl } from "@/lib/avatar-url";
import { MediaCarousel } from "./vitrine-vertical-pager";
import { VitrineCommentsSheet } from "./vitrine-comments-sheet";
import { VitrineModerationMenu } from "./vitrine-moderation-menu";

const GOLD = "#E8B93B";

export function VitrinePostCard({
  post,
  onUpdated,
  onBlocked,
  onDeleted,
  autoOpenComments = false,
  highlightCommentId = null,
  onCommentsAutoOpened,
  active = true,
}: {
  post: VitrinePost;
  onUpdated?: (p: VitrinePost) => void;
  /** After block: parent should drop this author from the feed. */
  onBlocked?: () => void;
  /** After the owner deletes this post. */
  onDeleted?: () => void;
  /** Deep-link from Activity / push: open comments once after landing on this post. */
  autoOpenComments?: boolean;
  highlightCommentId?: string | null;
  onCommentsAutoOpened?: () => void;
  /** False while this card is the off-screen neighbour used for prefetch. */
  active?: boolean;
}) {
  const { t } = useTranslation();
  const { user, guestMode } = useAuth();
  const { openAuth } = useAuthPrompt();
  const { open: openSeller } = useSellerProfile();
  const { open: openLive } = useLiveViewer();
  const [liked, setLiked] = useState(!!post.liked_by_me);
  const [likes, setLikes] = useState(post.like_count);
  const [comments, setComments] = useState(post.comment_count);
  const [commentsOpen, setCommentsOpen] = useState(false);

  useEffect(() => {
    if (!autoOpenComments) return;
    setCommentsOpen(true);
    onCommentsAutoOpened?.();
  }, [autoOpenComments, post.id]); // onCommentsAutoOpened intentionally omitted (parent inline callback)
  const [reminding, setReminding] = useState(false);
  const [reminded, setReminded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    post.seller?.avatar_url ?? null,
  );

  useEffect(() => {
    setLiked(!!post.liked_by_me);
    setLikes(post.like_count);
    setComments(post.comment_count);
  }, [post.id, post.liked_by_me, post.like_count, post.comment_count]);

  useEffect(() => {
    let alive = true;
    setAvatarUrl(post.seller?.avatar_url ?? null);
    void resolveAvatarUrl(post.seller?.avatar_url).then((url) => {
      if (alive) setAvatarUrl(url);
    });
    return () => {
      alive = false;
    };
  }, [post.id, post.seller?.avatar_url]);

  const requireAuth = () => {
    if (guestMode || !user) {
      openAuth();
      return false;
    }
    return true;
  };

  const onLike = async () => {
    if (!requireAuth()) return;
    haptic.light();
    const prevLiked = liked;
    const prevLikes = likes;
    const nextLiked = !prevLiked;
    const nextLikes = Math.max(0, prevLikes + (nextLiked ? 1 : -1));
    setLiked(nextLiked);
    setLikes(nextLikes);
    const res = await toggleVitrineLike(post.id, prevLiked);
    if (!res.ok) {
      setLiked(prevLiked);
      setLikes(prevLikes);
      return;
    }
    onUpdated?.({ ...post, liked_by_me: res.liked, like_count: nextLikes });
  };

  const onShare = async () => {
    haptic.light();
    const url = vitrinePostShareUrl(post.id);
    const title = post.seller?.display_name || "KiDi+";
    try {
      await nativeShare({ title, text: post.caption ?? title, url });
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        toast.success(t("vitrine.linkCopied", { defaultValue: "Lien copié" }));
      } catch { /* ignore */ }
    }
  };

  const onShop = () => {
    haptic.light();
    const handle = post.seller?.handle;
    if (handle) openSeller(handle);
  };

  const runCta = async () => {
    haptic.medium();
    if (post.live_id && post.live_status === "live") {
      const stream = await fetchLiveById(post.live_id).catch(() => null);
      if (stream) openLive(stream);
      return;
    }
    if (post.live_id && post.live_status === "scheduled") {
      if (!requireAuth() || !user) return;
      setReminding(true);
      try {
        const has = await hasLiveReminder(user.id, post.live_id);
        if (has) {
          await removeLiveReminder(user.id, post.live_id);
          setReminded(false);
          toast(t("vitrine.cta.remind"));
        } else {
          await addLiveReminder(user.id, post.live_id);
          setReminded(true);
          toast.success(t("vitrine.cta.reminded"));
        }
      } catch {
        toast.error("Erreur");
      } finally {
        setReminding(false);
      }
      return;
    }
    onShop();
  };

  const ctaLabel = (() => {
    if (post.live_id && post.live_status === "live") return t("vitrine.cta.join");
    if (post.live_id && post.live_status === "scheduled") {
      return reminded ? t("vitrine.cta.reminded") : t("vitrine.cta.remind");
    }
    if (post.product_id) return t("vitrine.cta.viewProduct");
    return t("vitrine.cta.viewShop");
  })();

  const sellerName =
    post.seller?.display_name?.trim() || post.seller?.handle || "…";

  return (
    <div className="relative h-full w-full bg-black">
      <MediaCarousel
        urls={post.media_urls}
        poster={post.poster_url ?? null}

        className="absolute inset-0 h-full w-full object-cover"
        forceVideo={post.media_type === "video"}
        active={active}
        music={post.music ?? null}
      />

      {post.user_id && (
        <div
          className="pointer-events-auto absolute right-3 z-[36]"
          style={{ top: "max(4.5rem, calc(env(safe-area-inset-top) + 3.5rem))" }}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
        >
          <VitrineModerationMenu
            target={{
              userId: post.user_id,
              displayName: post.seller?.display_name,
              handle: post.seller?.handle,
              avatarUrl: post.seller?.avatar_url ?? avatarUrl,
              contentKind: "post",
              contentId: post.id,
            }}
            onBlocked={onBlocked}
            onDeleted={onDeleted}
            onOpenChange={setMenuOpen}
            onManage={() => {
              const handle = post.seller?.handle;
              if (!handle) {
                toast.error(t("vitrine.manageShopFail", { defaultValue: "Ajoute un @pseudo pour ouvrir ta boutique." }));
                return;
              }
              openSeller(handle, "vitrine");
            }}
            buttonClassName="grid h-10 w-10 place-items-center rounded-full bg-black/55 text-white shadow-md"
          />
        </div>
      )}

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[15]"
        style={{
          height: "42%",
          backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.78), rgba(0,0,0,0))",
        }}
      />

      <div
        className="pointer-events-auto absolute bottom-[22%] right-2 z-[30] flex flex-col items-center gap-4"
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <Press
          onClick={onShop}
          className="!min-h-0 relative grid h-11 w-11 place-items-center rounded-full p-0"
          style={{ background: GOLD, boxShadow: "0 4px 12px rgba(0,0,0,0.35)" }}
        >
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
              style={{ border: `2px solid ${GOLD}` }}
              onError={() => setAvatarUrl(null)}
            />
          ) : (
            <span
              className="grid h-10 w-10 place-items-center rounded-full text-[13px] font-bold text-[#10162B]"
              style={{ background: GOLD, border: `2px solid ${GOLD}` }}
            >
              {(sellerName || "?").slice(0, 1).toUpperCase()}
            </span>
          )}
        </Press>
        <RailBtn
          icon={<Heart size={22} fill={liked ? GOLD : "none"} color={liked ? GOLD : "#fff"} />}
          label={String(likes)}
          onClick={onLike}
          aria={t("vitrine.like")}
        />
        <RailBtn
          icon={<MessageCircle size={22} color="#fff" />}
          label={String(comments)}
          onClick={() => {
            haptic.light();
            setCommentsOpen(true);
          }}
          aria={t("vitrine.comment")}
        />
        <RailBtn
          icon={<Share2 size={22} color="#fff" />}
          label={t("vitrine.share")}
          onClick={onShare}
          aria={t("vitrine.share")}
        />
        <RailBtn
          icon={<Store size={22} color="#fff" />}
          label={t("vitrine.shop")}
          onClick={onShop}
          aria={t("vitrine.shop")}
        />
      </div>

      <div
        className="pointer-events-auto absolute inset-x-0 bottom-0 z-[30] px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onShop}
          className="text-left text-[15px] font-bold text-white"
        >
          {sellerName}
        </button>
        {post.caption && (
          <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-white/90">
            {post.caption}
          </p>
        )}
        {!menuOpen && (
          <Press
            onClick={() => void runCta()}
            disabled={reminding}
            className="mt-2 !min-h-8 inline-flex h-8 items-center justify-center gap-1.5 rounded-full px-3 text-[12px] font-bold text-[#10162B]"
            style={{ background: GOLD }}
          >
            {post.live_status === "live" ? (
              <Radio size={14} />
            ) : post.live_status === "scheduled" ? (
              <Bell size={14} />
            ) : (
              <Store size={14} />
            )}
            {ctaLabel}
          </Press>
        )}
      </div>

      <VitrineCommentsSheet
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        postId={post.id}
        highlightCommentId={highlightCommentId}
        onCommentAdded={() => {
          const next = comments + 1;
          setComments(next);
          onUpdated?.({ ...post, comment_count: next, liked_by_me: liked, like_count: likes });
        }}
      />
    </div>
  );
}

function RailBtn({
  icon,
  label,
  onClick,
  aria,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  aria: string;
}) {
  return (
    <Press
      aria-label={aria}
      onClick={onClick}
      className="!min-h-0 flex flex-col items-center gap-0.5 !bg-transparent p-0 text-white"
    >
      <span className="grid h-10 w-10 place-items-center drop-shadow-md">{icon}</span>
      <span className="text-[10px] font-semibold drop-shadow-md">{label}</span>
    </Press>
  );
}
