// Soft / force update dialog for App Store & Play Store binaries.
// No-op on web. Soft prompts can be snoozed 3 days; force cannot.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { isNative } from "@/lib/native";
import {
  decideUpdate,
  fetchAppVersionPolicy,
  isSnoozed,
  openStoreForPlatform,
  readInstalledNativeVersion,
  snoozeSoftUpdate,
  type NativePlatform,
  type UpdateDecision,
} from "@/lib/native-update";

export function NativeUpdateGate() {
  const { t } = useTranslation();
  const [decision, setDecision] = useState<UpdateDecision | null>(null);
  const [platform, setPlatform] = useState<NativePlatform>("ios");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isNative()) return;
    let cancelled = false;

    void (async () => {
      const installed = await readInstalledNativeVersion();
      if (!installed || cancelled) return;
      setPlatform(installed.platform);

      const policy = await fetchAppVersionPolicy(installed.platform);
      if (!policy || cancelled) return;

      const d = decideUpdate(installed.version, policy);
      if (d.kind === "none") return;
      if (d.kind === "soft" && isSnoozed()) return;

      setDecision(d);
      setOpen(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!decision || decision.kind === "none") return null;

  const forced = decision.kind === "force";
  const title = forced
    ? t("update.forceTitle", { defaultValue: "Mise à jour obligatoire" })
    : t("update.softTitle", { defaultValue: "Nouvelle version disponible" });
  const description =
    decision.policy.message ||
    (forced
      ? t("update.forceBody", {
          defaultValue:
            "Cette version de KiDi+ n'est plus supportée. Mets à jour l'application pour continuer.",
        })
      : t("update.softBody", {
          defaultValue:
            "Une nouvelle version de KiDi+ est disponible sur le store. Mets à jour pour profiter des dernières améliorations.",
        }));

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (forced) {
          setOpen(true);
          return;
        }
        if (!next) snoozeSoftUpdate();
        setOpen(next);
      }}
    >
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {description}
            <span className="mt-2 block text-[11px] text-muted-foreground">
              {t("update.versionHint", {
                defaultValue: "Version installée : {{v}}",
                v: decision.installed,
              })}
              {decision.policy.latestVersion
                ? ` · ${t("update.latestHint", {
                    defaultValue: "Dernière : {{v}}",
                    v: decision.policy.latestVersion,
                  })}`
                : null}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          {!forced && (
            <AlertDialogCancel
              onClick={() => {
                snoozeSoftUpdate();
                setOpen(false);
              }}
            >
              {t("update.later", { defaultValue: "Plus tard" })}
            </AlertDialogCancel>
          )}
          <AlertDialogAction
            onClick={() => {
              void openStoreForPlatform(platform, decision.policy);
              if (!forced) {
                snoozeSoftUpdate();
                setOpen(false);
              }
            }}
          >
            {t("update.cta", { defaultValue: "Mettre à jour" })}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
