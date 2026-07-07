// In-app PushScreen wrappers for each legal document.

import { useTranslation } from "react-i18next";
import { PushScreen } from "@/components/push-screen";
import { LegalDocView } from "./legal-doc-view";
import { pickLegal } from "@/lib/legal-content";

type Kind = "privacy" | "terms" | "community";

export function LegalScreen({ open, onClose, kind, zIndex = 85 }: {
  open: boolean; onClose: () => void; kind: Kind; zIndex?: number;
}) {
  const { i18n, t } = useTranslation();
  const bundle = pickLegal(i18n.language);
  const doc = bundle[kind];
  return (
    <PushScreen open={open} onClose={onClose} title={doc.title} zIndex={zIndex}>
      <LegalDocView doc={doc} kicker={t("legal.appLegal")} />
    </PushScreen>
  );
}
