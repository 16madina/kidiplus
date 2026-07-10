// Public shareable live URL: https://kidiplus.com/live/{liveId}
// Renders the full AppShell then dispatches a "kidi:open-live" event that
// the shell's deep-link listener consumes to open the live viewer.
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";

export const Route = createFileRoute("/live/$id")({
  head: ({ params }) => ({
    meta: [
      { title: `Live · Kidi+` },
      { name: "description", content: "Rejoins ce live shopping sur Kidi+." },
      { property: "og:title", content: "Live shopping · Kidi+" },
      { property: "og:description", content: "Rejoins ce live shopping en direct sur Kidi+." },
      { property: "og:type", content: "video.other" },
      { name: "robots", content: "index,follow" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:url", content: `https://kidiplus.com/live/${params.id}` },
    ],
  }),
  component: LiveDeepLink,
});

function LiveDeepLink() {
  const { id } = useParams({ from: "/live/$id" });
  useEffect(() => {
    // Fire once mounted; AppShell's existing kidi:open-push listener resolves
    // the live via fetchLiveById and calls openLive().
    window.dispatchEvent(
      new CustomEvent("kidi:push-open", { detail: { kind: "live", live_id: id } }),
    );
  }, [id]);
  return <AppShell />;
}
