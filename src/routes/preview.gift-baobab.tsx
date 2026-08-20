import { createFileRoute } from "@tanstack/react-router";
import { BaobabPreviewStage } from "@/components/gifts/baobab-preview-stage";

export const Route = createFileRoute("/preview/gift-baobab")({
  ssr: false,
  component: BaobabPreviewStage,
  head: () => ({
    meta: [{ title: "Aperçu Baobab d’or — KiDi+" }],
  }),
});
