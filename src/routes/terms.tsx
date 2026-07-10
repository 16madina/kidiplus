import { createFileRoute } from "@tanstack/react-router";
import { LegalDocView } from "@/components/legal/legal-doc-view";
import { pickLegal } from "@/lib/legal-content";
import { useTranslation } from "react-i18next";
import "@/i18n";

export const Route = createFileRoute("/terms")({
  component: TermsPage,
  head: () => ({
    meta: [
      { title: "Conditions d'utilisation — KiDi+" },
      { name: "description", content: "Conditions d'utilisation de KiDi+ : éligibilité, ventes, paiements, modération, contact." },
      { property: "og:title", content: "Conditions d'utilisation — KiDi+" },
      { property: "og:description", content: "Éligibilité, ventes, paiements, modération, contact." },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://kidiplus.com/terms" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://kidiplus.com/terms" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Conditions d'utilisation — KiDi+",
          inLanguage: "fr",
          mainEntityOfPage: "https://kidiplus.com/terms",
          publisher: { "@type": "Organization", name: "KiDi+" },
        }),
      },
    ],
  }),
});

function TermsPage() {
  const { i18n } = useTranslation();
  const doc = pickLegal(i18n.language).terms;
  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <LegalDocView doc={doc} />
    </main>
  );
}
