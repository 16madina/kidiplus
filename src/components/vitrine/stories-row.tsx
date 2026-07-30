import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import type { VitrineStory } from "@/lib/vitrine-db";

const GOLD = "#E8B93B";
const NAVY = "#10162B";

export function StoriesRow({
  stories,
  collapsed,
}: {
  stories: VitrineStory[];
  collapsed?: boolean;
}) {
  const { t } = useTranslation();
  if (collapsed) return null;

  const onYourStory = () => {
    haptic.light();
    toast(t("vitrine.storySoon"));
  };

  return (
    <div
      className="flex gap-3 overflow-x-auto px-4 py-2"
      style={{ WebkitOverflowScrolling: "touch" }}
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
        <span className="w-full truncate text-center text-[10px] font-medium text-muted-foreground">
          {t("vitrine.yourStory")}
        </span>
      </button>

      {stories.map((s) => {
        const name =
          s.seller?.display_name?.trim() ||
          s.seller?.handle ||
          "…";
        return (
          <Press
            key={s.id}
            onClick={() => {
              haptic.selection();
              toast(t("vitrine.storySoon"));
            }}
            className="!min-h-0 flex w-[68px] shrink-0 flex-col items-center gap-1 !bg-transparent p-0"
          >
            <span
              className="grid h-[62px] w-[62px] place-items-center rounded-full p-[2px]"
              style={{
                background: s.unread
                  ? `linear-gradient(135deg, ${GOLD}, #C8A24B)`
                  : "var(--border)",
              }}
            >
              <span
                className="block h-full w-full overflow-hidden rounded-full"
                style={{ border: "2px solid var(--background)" }}
              >
                <img
                  src={s.seller?.avatar_url || s.media_url}
                  alt=""
                  className="h-full w-full object-cover"
                  draggable={false}
                />
              </span>
            </span>
            <span className="w-full truncate text-center text-[10px] font-medium text-foreground">
              {name}
            </span>
          </Press>
        );
      })}
    </div>
  );
}
