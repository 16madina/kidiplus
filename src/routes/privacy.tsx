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
          description:
            "Politique de confidentialité de KiDi+ : quelles données nous collectons, comment elles sont utilisées et vos droits.",
          inLanguage: "fr",
          mainEntityOfPage: "https://kidiplus.com/privacy",
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

function PrivacyPage() {
  const { i18n } = useTranslation();
  const doc = pickLegal(i18n.language).privacy;
  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <LegalDocView doc={doc} />
    </main>
  );
}
