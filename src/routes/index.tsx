import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/")({
  component: AppShell,
  head: () => ({
    meta: [
      { title: "KiDi+ — Live Shopping & Enchères en direct" },
      {
        name: "description",
        content:
          "KiDi+ — regarde des lives, participe aux enchères en temps réel et vends à ta communauté.",
      },
      { property: "og:title", content: "KiDi+ — Live Shopping & Enchères en direct" },
      {
        property: "og:description",
        content:
          "KiDi+ — regarde des lives, participe aux enchères en temps réel et vends à ta communauté.",
      },
      { property: "og:url", content: "https://kidiplus.com/" },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/HniuLdmUhpS7IHY6c9micr37Ttj1/social-images/social-1783684301088-ChatGPT_Image_8_juill._2026,_11_h_48_min_49_s.webp" },
    ],
    links: [{ rel: "canonical", href: "https://kidiplus.com/" }],
  }),
});
