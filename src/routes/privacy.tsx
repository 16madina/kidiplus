import { createFileRoute } from "@tanstack/react-router";
import { LegalDocView } from "@/components/legal/legal-doc-view";
import { pickLegal } from "@/lib/legal-content";
import { useTranslation } from "react-i18next";
import "@/i18n";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({
    meta: [
      { title: "Politique de confidentialité — KiDi+" },
      { name: "description", content: "Politique de confidentialité de KiDi+ : données collectées, utilisation, tiers, droits, contact." },
      { property: "og:title", content: "Politique de confidentialité — KiDi+" },
      { property: "og:description", content: "Données collectées, utilisation, tiers, droits, contact." },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://kidiplus.com/privacy" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://kidiplus.com/privacy" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Politique de confidentialité — KiDi+",
          inLanguage: "fr",
          mainEntityOfPage: "https://kidiplus.com/privacy",
          publisher: { "@type": "Organization", name: "KiDi+" },
        }),
      },
    ],
  }),
});

function PrivacyPage() {
  const { i18n } = useTranslation();
  const doc = pickLegal(i18n.language).privacy;
  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <LegalDocView doc={doc} />
    </main>
  );
}
