// Public shareable live URL: https://kidiplus.com/live/{liveId}
// Renders the full AppShell then opens the live viewer once mounted.
// Unauthenticated visitors see the AppShell's normal auth-gate flow behind
// the live overlay; authenticated visitors go straight into the live.
import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { useLiveViewer } from "@/lib/live-viewer-context";
import { fetchLiveById } from "@/lib/lives-db";

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
  return (
    <>
      <AppShell />
      <DeepLinkOpener />
    </>
  );
}

function DeepLinkOpener() {
  const { id } = useParams({ from: "/live/$id" });
  const { open, active } = useLiveViewer();

  useEffect(() => {
    let cancelled = false;
    if (active?.liveId === id) return;
    void (async () => {
      const stream = await fetchLiveById(id).catch(() => null);
      if (!cancelled && stream) open(stream);
    })();
    return () => { cancelled = true; };
  }, [id, open, active?.liveId]);

  return null;
}
