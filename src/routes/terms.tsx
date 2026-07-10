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
          description:
            "Conditions générales d'utilisation de KiDi+ : règles de la plateforme, obligations des acheteurs et vendeurs.",
          inLanguage: "fr",
          mainEntityOfPage: "https://kidiplus.com/terms",
          image: "https://kidiplus.com/icon-512.png",
          datePublished: "2025-01-01",
          dateModified: "2026-07-10",
          author: { "@type": "Organization", name: "KiDi+", url: "https://kidiplus.com" },
          publisher: {
            "@type": "Organization",
            name: "KiDi+",
            logo: {
              "@type": "ImageObject",
              url: "https://kidiplus.com/icon-512.png",
              width: 512,
              height: 512,
            },
          },
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
