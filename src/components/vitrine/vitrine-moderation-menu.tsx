// Report / block menu for Vitrine UGC (posts + stories) — Apple/Google guideline 1.2.
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Ban, Flag, Loader2, MoreVertical, X } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { ReportSheet } from "@/components/moderation/report-sheet";
import {
  blockUserAndNotify,
  refreshBlockedIds,
} from "@/lib/moderation-db";
import { useAuth } from "@/lib/auth-context";
import { useAuthPrompt } from "@/lib/auth-prompt-context";
import { haptic } from "@/lib/haptics";
import { EASE_IOS } from "@/lib/motion";

export type VitrineModerationTarget = {
  userId: string;
  displayName?: string | null;
  handle?: string | null;
  avatarUrl?: string | null;
  /** Used in the report note so moderators can find the exact UGC. */
  contentKind: "post" | "story";
  contentId: string;
};

export function VitrineModerationMenu({
  target,
  onBlocked,
  onOpenChange,
  buttonClassName,
  sheetZIndex = 110,
}: {
  target: VitrineModerationTarget | null;
  onBlocked?: () => void;
  /** Pause story progress while the sheet is open. */
  onOpenChange?: (open: boolean) => void;
  buttonClassName?: string;
  sheetZIndex?: number;
}) {
  const { t } = useTranslation();
  const { user, guestMode } = useAuth();
  const { openAuth } = useAuthPrompt();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blocking, setBlocking] = useState(false);

  if (!target?.userId) return null;
  // Demo / own content: no report/block.
  if (target.userId.startsWith("demo-") || (user && target.userId === user.id)) {
    return null;
  }

  const setOpen = (open: boolean) => {
    setActionsOpen(open);
    onOpenChange?.(open);
  };

  const requireAuth = () => {
    if (guestMode || !user) {
      openAuth();
      return false;
    }
    return true;
  };

  const openMenu = () => {
    if (!requireAuth()) return;
    haptic.light();
    setOpen(true);
  };

  const onBlock = async () => {
    if (blocking || !requireAuth()) return;
    setBlocking(true);
    haptic.medium();
    const r = await blockUserAndNotify(target.userId, {
      handle: target.handle ?? undefined,
      displayName: target.displayName ?? target.handle ?? undefined,
      avatarUrl: target.avatarUrl ?? null,
    });
    setBlocking(false);
    setOpen(false);
    if (r.ok) {
      await refreshBlockedIds();
      haptic.success();
      toast.success(t("block.blocked"));
      onBlocked?.();
    } else {
      toast.error(t("block.failed"));
    }
  };

  const note = `Vitrine ${target.contentKind}: ${target.contentId}`;

  return (
    <>
      <Press
        aria-label={t("common.more", { defaultValue: "Plus" })}
        hapticOnTap={false}
        onClick={(e) => {
          e.stopPropagation();
          openMenu();
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        className={
          buttonClassName ??
          "h-9 w-9 rounded-full bg-black/40 text-white"
        }
      >
        <MoreVertical size={18} strokeWidth={2.2} />
      </Press>

      <AnimatePresence>
        {actionsOpen && (
          <motion.div
            className="fixed inset-0 flex items-end justify-center bg-black/50"
            style={{ zIndex: sheetZIndex }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          >
            <motion.div
              className="mx-auto w-full max-w-lg rounded-t-3xl bg-background p-4"
              style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 0.22, ease: EASE_IOS }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" />
              <div className="mb-1 flex items-center justify-between">
                <h2 className="min-w-0 truncate text-[16px] font-bold">
                  {target.displayName || target.handle || t("report.title")}
                </h2>
                <Press onClick={() => setOpen(false)} className="h-9 w-9 rounded-full">
                  <X size={18} />
                </Press>
              </div>
              <p className="mb-2 px-1 text-[12px] text-muted-foreground">
                {t("report.subtitle")}
              </p>
              <Press
                onClick={() => {
                  setOpen(false);
                  setReportOpen(true);
                }}
                className="flex !min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left text-[15px] font-semibold"
              >
                <Flag size={20} />
                {t("report.action")}
              </Press>
              <Press
                onClick={() => void onBlock()}
                disabled={blocking}
                className="mt-1 flex !min-h-14 w-full items-center gap-3 rounded-2xl px-3 text-left text-[15px] font-semibold text-red-500"
              >
                {blocking ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Ban size={20} />
                )}
                {t("block.action")}
              </Press>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <ReportSheet
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="user"
        targetId={target.userId}
        defaultNote={note}
        zIndex={sheetZIndex + 1}
      />
    </>
  );
}
