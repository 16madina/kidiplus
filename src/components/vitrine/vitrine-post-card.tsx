import { useState } from "react";
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
import { MediaCarousel } from "./vitrine-vertical-pager";
import { VitrineCommentsSheet } from "./vitrine-comments-sheet";

const GOLD = "#E8B93B";

export function VitrinePostCard({
  post,
  onUpdated,
}: {
  post: VitrinePost;
  onUpdated?: (p: VitrinePost) => void;
}) {
  const { t } = useTranslation();
  const { user, guestMode } = useAuth();
  const { openAuth } = useAuthPrompt();
  const { open: openSeller } = useSellerProfile();
  const { open: openLive } = useLiveViewer();
  const [liked, setLiked] = useState(!!post.liked_by_me);
  const [likes, setLikes] = useState(post.like_count);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [reminding, setReminding] = useState(false);
  const [reminded, setReminded] = useState(false);

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
    const next = !liked;
    setLiked(next);
    setLikes((n) => Math.max(0, n + (next ? 1 : -1)));
    const res = await toggleVitrineLike(post.id, liked);
    if (!res.ok) {
      setLiked(liked);
      setLikes(post.like_count);
    } else {
      onUpdated?.({ ...post, liked_by_me: res.liked, like_count: likes + (res.liked ? 1 : -1) });
    }
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
        toast.success("Lien copié");
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
    if (post.product_id) {
      onShop();
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
        className="absolute inset-0 h-full w-full object-cover"
      />

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 z-[15]"
        style={{
          height: "42%",
          backgroundImage: "linear-gradient(to top, rgba(0,0,0,0.78), rgba(0,0,0,0))",
        }}
      />

      {/* Right rail */}
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
          {post.seller?.avatar_url ? (
            <img
              src={post.seller.avatar_url}
              alt=""
              className="h-10 w-10 rounded-full object-cover"
              style={{ border: `2px solid ${GOLD}` }}
            />
          ) : (
            <Store size={18} color="#10162B" />
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
          label={String(post.comment_count)}
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

      {/* Bottom meta + CTA */}
      <div
        className="pointer-events-auto absolute inset-x-0 bottom-0 z-[30] px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))]"
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
        <Press
          onClick={() => void runCta()}
          disabled={reminding}
          className="mt-3 !min-h-10 flex h-10 items-center justify-center gap-2 rounded-full px-4 text-[14px] font-bold text-[#10162B]"
          style={{ background: GOLD }}
        >
          {post.live_status === "live" ? (
            <Radio size={16} />
          ) : post.live_status === "scheduled" ? (
            <Bell size={16} />
          ) : (
            <Store size={16} />
          )}
          {ctaLabel}
        </Press>
      </div>

      <VitrineCommentsSheet
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        postId={post.id}
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
