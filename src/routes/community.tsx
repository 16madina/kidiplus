import { createFileRoute } from "@tanstack/react-router";
import { LegalDocView } from "@/components/legal/legal-doc-view";
import { pickLegal } from "@/lib/legal-content";
import { useTranslation } from "react-i18next";
import "@/i18n";

export const Route = createFileRoute("/community")({
  component: CommunityPage,
  head: () => ({
    meta: [
      { title: "Directives de la communauté — KiDi+" },
      { name: "description", content: "Directives de la communauté KiDi+ : interdits, bonnes pratiques, conséquences, signalements." },
      { property: "og:title", content: "Directives de la communauté — KiDi+" },
      { property: "og:description", content: "Interdits, bonnes pratiques, conséquences, signalements." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://kidiplus.com/community" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Directives de la communauté — KiDi+",
          description:
            "Directives de la communauté KiDi+ : interdits, bonnes pratiques, conséquences, signalements.",
          inLanguage: "fr",
          mainEntityOfPage: "https://kidiplus.com/community",
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

function CommunityPage() {
  const { i18n } = useTranslation();
  const doc = pickLegal(i18n.language).community;
  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <LegalDocView doc={doc} />
    </main>
  );
}
