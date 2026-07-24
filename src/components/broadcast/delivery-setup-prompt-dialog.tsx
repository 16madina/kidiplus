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
  onConfigure: () => void;
  onContinue: () => void;
  onCancel: () => void;
};

/** Warns the host before go-live when delivery settings were never configured. */
export function DeliverySetupPromptDialog({
  open,
  onConfigure,
  onContinue,
  onCancel,
}: Props) {
  const { t } = useTranslation();

  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent className="max-w-[340px] rounded-2xl border-white/10 bg-[#10162B] text-white">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-white">
            {t(
              "broadcast.setup.deliveryPrompt.title",
              "As-tu configuré la livraison ?",
            )}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2 text-left text-[13px] text-white/75">
            <span className="block">
              {t(
                "broadcast.setup.deliveryPrompt.body1",
                "Si tu n’as pas encore réglé tes options de livraison, configure-les maintenant.",
              )}
            </span>
            <span className="block">
              {t(
                "broadcast.setup.deliveryPrompt.body2",
                "Sinon, les acheteurs de n’importe quel pays pourront commander — et tu seras obligé·e de livrer dans ces pays.",
              )}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-col gap-2 sm:flex-col">
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onConfigure();
            }}
            className="w-full rounded-full bg-[#D4AF37] font-bold text-[#10162B] hover:bg-[#D4AF37]/90"
          >
            {t("broadcast.setup.deliveryPrompt.configure", "Configurer la livraison")}
          </AlertDialogAction>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              onContinue();
            }}
            className="w-full rounded-full border border-white/20 bg-transparent font-semibold text-white hover:bg-white/10"
          >
            {t(
              "broadcast.setup.deliveryPrompt.continueAnyway",
              "Continuer sans configurer",
            )}
          </AlertDialogAction>
          <AlertDialogCancel
            onClick={onCancel}
            className="mt-0 w-full rounded-full border-0 bg-transparent text-white/60 hover:bg-white/5 hover:text-white"
          >
            {t("broadcast.setup.deliveryPrompt.cancel", "Annuler")}
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
