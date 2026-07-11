import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PushScreen } from "@/components/push-screen";
import { DemoCard, DemoPlayer, useDemoVideo } from "@/components/home/demo-card";

function SectionHeader({ label }: { label: string }) {
  return (
    <h2 className="mb-2 mt-6 px-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {label}
    </h2>
  );
}


export function DiscoverScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { ok: demoAvailable, url: demoUrl } = useDemoVideo();
  const [playerOpen, setPlayerOpen] = useState(false);

  return (
    <PushScreen
      open={open}
      onClose={() => {
        setPlayerOpen(false);
        onClose();
      }}
      title={t("discover.title", { defaultValue: "Découvrir" })}
      zIndex={75}
    >
      <div className="flex h-full flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-8 pt-2">
          <p className="mb-4 px-2 text-[13px] leading-relaxed text-muted-foreground">
            {t("discover.subtitle", {
              defaultValue: "Apprends à utiliser KiDi+ avec nos tutoriels vidéo.",
            })}
          </p>

          <SectionHeader label={t("discover.featured", { defaultValue: "À la une" })} />

          {demoAvailable !== false && (
            <div className="w-[48%] min-w-[160px] max-w-[200px]">
              <DemoCard onOpen={() => setPlayerOpen(true)} />
            </div>
          )}

          <SectionHeader label={t("discover.comingSoon", { defaultValue: "Prochainement" })} />
          <div className="rounded-2xl border border-border bg-card px-4 py-8 text-center">
            <p className="text-[13px] text-muted-foreground">
              {t("discover.moreVideos", { defaultValue: "D'autres tutoriels arrivent bientôt." })}
            </p>
          </div>
        </div>
      </div>

      <DemoPlayer open={playerOpen} onClose={() => setPlayerOpen(false)} src={demoUrl} />
    </PushScreen>
  );
}
