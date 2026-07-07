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
