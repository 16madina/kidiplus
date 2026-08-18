import { createFileRoute } from "@tanstack/react-router";
import { DefiPlusPreviewStage } from "@/components/defi-plus/defi-plus-preview-stage";

export const Route = createFileRoute("/preview/defi-plus")({
  component: DefiPlusPreviewStage,
  head: () => ({
    meta: [{ title: "Aperçu Défi Plus — KiDi+" }],
  }),
});
