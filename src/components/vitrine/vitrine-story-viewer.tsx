import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Volume2, VolumeX, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { registerOverlay, guardBack } from "@/components/push-screen";
import { EASE_IOS } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { isVideoUrl, type VitrineStory } from "@/lib/vitrine-db";
import {
  resumeVitrinePlayback,
  suspendVitrinePlayback,
} from "@/lib/vitrine-playback";
import { VitrineModerationMenu } from "./vitrine-moderation-menu";

const GOLD = "#E8B93B";
const IMAGE_MS = 5500;

export function VitrineStoryViewer({
  open,
  stories,
  startIndex,
  onClose,
}: {
  open: boolean;
  stories: VitrineStory[];
  startIndex: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(startIndex);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const story = stories[index] ?? null;
  const video = !!(story && isVideoUrl(story.media_url));

  useEffect(() => {
    if (!open) return;
    setIndex(Math.max(0, Math.min(startIndex, stories.length - 1)));
    setProgress(0);
  }, [open, startIndex, stories.length]);

  useEffect(() => {
    if (open) suspendVitrinePlayback("story");
    else resumeVitrinePlayback("story");
    return () => resumeVitrinePlayback("story");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    return registerOverlay(() => {
      if (!guardBack()) return;
      onCloseRef.current();
    }, 96);
  }, [open]);

  useEffect(() => {
    if (!open || !story || video || menuOpen) return;
    setProgress(0);
    const started = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - started) / IMAGE_MS);
      setProgress(p);
      if (p >= 1) {
        goNext();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, story?.id, video, index, menuOpen]);

  useEffect(() => {
    const el = videoRef.current;
    if (!open || !el || !video) return;
    if (menuOpen) {
      el.pause();
      return;
    }
    el.muted = muted;
    void el.play().catch(() => {
      el.muted = true;
      setMuted(true);
      void el.play().catch(() => undefined);
    });
  }, [open, story?.id, video, muted, index, menuOpen]);

  const close = () => {
    if (!guardBack()) return;
    haptic.light();
    onClose();
  };

  const goNext = () => {
    if (index >= stories.length - 1) {
      close();
      return;
    }
    haptic.selection();
    setProgress(0);
    setIndex((i) => i + 1);
  };

  const goPrev = () => {
    if (index <= 0) {
      setProgress(0);
      return;
    }
    haptic.selection();
    setProgress(0);
    setIndex((i) => i - 1);
  };

  if (typeof document === "undefined") return null;

  const name =
    story?.seller?.display_name?.trim() ||
    story?.seller?.handle ||
    "…";

  return createPortal(
    <AnimatePresence>
      {open && story && (
        <motion.div
          key="story-viewer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE_IOS }}
          className="fixed inset-0 z-[96] bg-black"
        >
          <div className="absolute inset-0">
            {video ? (
              <video
                key={story.id}
                ref={videoRef}
                src={story.media_url}
                className="h-full w-full object-contain"
                playsInline
                autoPlay
                muted={muted}
                onTimeUpdate={() => {
                  const el = videoRef.current;
                  if (!el || !el.duration) return;
                  setProgress(el.currentTime / el.duration);
                }}
                onEnded={goNext}
              />
            ) : (
              <img
                key={story.id}
                src={story.media_url}
                alt=""
                className="h-full w-full object-contain"
                draggable={false}
              />
            )}
          </div>

          {/* Tap zones */}
          <button
            type="button"
            aria-label={t("common.back", { defaultValue: "Retour" })}
            className="absolute inset-y-0 left-0 z-20 w-[32%]"
            onClick={goPrev}
          />
          <button
            type="button"
            aria-label={t("common.next", { defaultValue: "Suivant" })}
            className="absolute inset-y-0 right-0 z-20 w-[32%]"
            onClick={goNext}
          />

          <div
            className="pointer-events-none absolute inset-x-0 top-0 z-30 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]"
            style={{
              backgroundImage:
                "linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)",
            }}
          >
            <div className="mb-3 flex gap-1">
              {stories.map((s, i) => (
                <div
                  key={s.id}
                  className="h-[2.5px] flex-1 overflow-hidden rounded-full bg-white/30"
                >
                  <div
                    className="h-full rounded-full bg-white"
                    style={{
                      width:
                        i < index
                          ? "100%"
                          : i === index
                            ? `${Math.round(progress * 100)}%`
                            : "0%",
                    }}
                  />
                </div>
              ))}
            </div>

            <div className="pointer-events-auto flex items-center gap-2 pb-3">
              <div
                className="h-9 w-9 overflow-hidden rounded-full"
                style={{ border: `2px solid ${GOLD}` }}
              >
                {story.seller?.avatar_url ? (
                  <img
                    src={story.seller.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div
                    className="grid h-full w-full place-items-center text-[12px] font-bold text-white"
                    style={{ background: "#10162B" }}
                  >
                    {name.slice(0, 1).toUpperCase()}
                  </div>
                )}
              </div>
              <p className="min-w-0 flex-1 truncate text-[14px] font-bold text-white">
                {name}
              </p>
              {video && (
                <Press
                  onClick={() => {
                    haptic.light();
                    setMuted((m) => !m);
                  }}
                  className="h-9 w-9 rounded-full bg-black/40 text-white"
                >
                  {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </Press>
              )}
              {story.user_id && (
                <VitrineModerationMenu
                  target={{
                    userId: story.user_id,
                    displayName: story.seller?.display_name,
                    handle: story.seller?.handle,
                    avatarUrl: story.seller?.avatar_url,
                    contentKind: "story",
                    contentId: story.id,
                  }}
                  sheetZIndex={120}
                  onOpenChange={setMenuOpen}
                  onBlocked={() => {
                    // Skip this author's remaining stories, or close if none left.
                    const nextIdx = stories.findIndex(
                      (s, i) => i > index && s.user_id !== story.user_id,
                    );
                    if (nextIdx >= 0) {
                      setProgress(0);
                      setIndex(nextIdx);
                    } else {
                      close();
                    }
                  }}
                />
              )}
              <Press
                onClick={close}
                className="h-9 w-9 rounded-full bg-black/40 text-white"
              >
                <X size={18} />
              </Press>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
