import { useState } from "react";
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

type Props = {
  open: boolean;
  provider: "facebook" | "youtube";
  onConfirm: () => void;
  onCancel: () => void;
};

export function SocialConnectDisclaimerDialog({
  open,
  provider,
  onConfirm,
  onCancel,
}: Props) {
  const { t } = useTranslation();
  const isFb = provider === "facebook";

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent className="max-w-[340px] rounded-2xl border-white/10 bg-[#10162B] text-white">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">
            {isFb
              ? t(
                  "broadcast.facebook.disclaimerTitle",
                  "Avant de connecter Facebook",
                )
              : t(
                  "broadcast.youtube.disclaimerTitle",
                  "Avant de connecter YouTube",
                )}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 text-left text-[13px] text-white/75">
            <span className="block">
              {isFb
                ? t(
                    "broadcast.facebook.disclaimerBody1",
                    "KiDi+ diffuse vers une Page Facebook. La Page doit être autorisée à faire des lives (règles Meta : éligibilité Live, compte en règle, etc.).",
                  )
                : t(
                    "broadcast.youtube.disclaimerBody1",
                    "KiDi+ diffuse vers ta chaîne YouTube. YouTube peut refuser un live selon ses règles (vérification, historique, restrictions du compte).",
                  )}
            </span>
            <span className="block">
              {isFb
                ? t(
                    "broadcast.facebook.disclaimerBody2",
                    "Si la Page n’est pas éligible, la connexion peut réussir mais la diffusion échouera. Ce n’est pas un bug KiDi+ — c’est une limite Meta sur ta Page.",
                  )
                : t(
                    "broadcast.youtube.disclaimerBody2",
                    "Si YouTube bloque le live, ce n’est en général pas un bug KiDi+ — c’est une limite du compte YouTube.",
                  )}
            </span>
            <span className="block text-white/55">
              {t(
                "broadcast.social.disclaimerBody3",
                "Les viewers verront l’interface KiDi+ (vidéo, enchères, chat). Pour enchérir ou commenter dans l’app, il faut KiDi+.",
              )}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <AlertDialogAction
            onClick={onConfirm}
            className="w-full rounded-full bg-[#D4AF37] font-bold text-[#10162B] hover:bg-[#D4AF37]/90"
          >
            {t("broadcast.social.disclaimerContinue", "Continuer")}
          </AlertDialogAction>
          <AlertDialogCancel
            onClick={onCancel}
            className="mt-0 w-full rounded-full border-white/20 bg-transparent text-white hover:bg-white/10 hover:text-white"
          >
            {t("broadcast.social.disclaimerCancel", "Annuler")}
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Hook helper: open disclaimer then run connect. */
export function useSocialConnectDisclaimer() {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<null | (() => void)>(null);

  const requestConnect = (fn: () => void) => {
    setPending(() => fn);
    setOpen(true);
  };

  const confirm = () => {
    const fn = pending;
    setOpen(false);
    setPending(null);
    fn?.();
  };

  const cancel = () => {
    setOpen(false);
    setPending(null);
  };

  return { open, requestConnect, confirm, cancel };
}
