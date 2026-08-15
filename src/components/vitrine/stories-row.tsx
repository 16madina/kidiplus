import { useState } from "react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import type { VitrineStory } from "@/lib/vitrine-db";
import { VitrineStoryViewer } from "./vitrine-story-viewer";

const GOLD = "#E8B93B";
const NAVY = "#10162B";

export function StoriesRow({
  stories,
  collapsed,
  tone = "light",
  onCreate,
  onStoryDeleted,
}: {
  stories: VitrineStory[];
  collapsed?: boolean;
  /** Dark = overlay on fullscreen Vitrine feed. */
  tone?: "light" | "dark";
  /** Create a Vitrine post (photo/video). Falls back to stub toast. */
  onCreate?: () => void;
  onStoryDeleted?: (storyId: string) => void;
}) {
  const { t } = useTranslation();
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  if (collapsed) return null;

  const labelColor = tone === "dark" ? "rgba(255,255,255,0.85)" : "var(--foreground)";
  const mutedColor = tone === "dark" ? "rgba(255,255,255,0.55)" : "var(--muted-foreground)";
  const ringIdle = tone === "dark" ? "rgba(255,255,255,0.35)" : "var(--border)";
  const avatarBorder = tone === "dark" ? "rgba(0,0,0,0.55)" : "var(--background)";

  const onYourStory = () => {
    haptic.light();
    if (onCreate) onCreate();
    else toast(t("vitrine.storySoon"));
  };

  return (
    <div
      className="flex gap-3 overflow-x-auto px-4 py-2"
      style={{ WebkitOverflowScrolling: "touch", touchAction: "pan-x" }}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={onYourStory}
        className="flex w-[68px] shrink-0 flex-col items-center gap-1"
      >
        <span
          className="relative grid h-[62px] w-[62px] place-items-center rounded-full"
          style={{ border: `2px dashed color-mix(in oklch, ${GOLD} 70%, transparent)` }}
        >
          <span
            className="grid h-[52px] w-[52px] place-items-center rounded-full text-white"
            style={{ background: NAVY }}
          >
            <Plus size={22} />
          </span>
        </span>
        <span
          className="w-full truncate text-center text-[10px] font-medium"
          style={{ color: mutedColor }}
        >
          {t("vitrine.yourStory")}
        </span>
      </button>

      {stories.map((s, i) => {
        const name =
          s.seller?.display_name?.trim() ||
          s.seller?.handle ||
          "…";
        return (
          <Press
            key={s.id}
            onClick={() => {
              haptic.selection();
              setViewerIndex(i);
            }}
            className="!min-h-0 flex w-[68px] shrink-0 flex-col items-center gap-1 !bg-transparent p-0"
          >
            <span
              className="grid h-[62px] w-[62px] place-items-center rounded-full p-[2px]"
              style={{
                background: s.unread
                  ? `linear-gradient(135deg, ${GOLD}, #C8A24B)`
                  : ringIdle,
              }}
            >
              <span
                className="block h-full w-full overflow-hidden rounded-full"
                style={{ border: `2px solid ${avatarBorder}` }}
              >
                <img
                  src={s.seller?.avatar_url || s.media_url}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </span>
            </span>
            <span
              className="w-full truncate text-center text-[10px] font-medium"
              style={{ color: labelColor }}
            >
              {name}
            </span>
          </Press>
        );
      })}

      <VitrineStoryViewer
        open={viewerIndex != null}
        stories={stories}
        startIndex={viewerIndex ?? 0}
        onClose={() => setViewerIndex(null)}
        onDeleted={onStoryDeleted}
      />
    </div>
  );
}
