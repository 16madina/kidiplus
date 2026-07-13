import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { isNative } from "@/lib/native";
import { EMAIL_CONFIG } from "@/lib/email/config";
import { liveShareUrl } from "@/lib/deep-links";

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
      { property: "og:url", content: liveShareUrl(params.id) },
    ],
    links: [{ rel: "canonical", href: liveShareUrl(params.id) }],
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
  return (
    <>
      <OpenInAppBanner liveId={id} />
      <AppShell />
    </>
  );
}

/** Shown only in mobile Safari/Chrome when the native app did not catch the Universal Link. */
function OpenInAppBanner({ liveId }: { liveId: string }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isNative()) return;
    const ua = navigator.userAgent || "";
    if (!/Android|iPhone|iPad|iPod/i.test(ua)) return;
    setShow(true);
  }, []);

  if (!show) return null;

  const appUrl = `${EMAIL_CONFIG.APP_SCHEME}://live/${encodeURIComponent(liveId)}`;
  const downloadUrl = `${EMAIL_CONFIG.FALLBACK_URL}?next=${encodeURIComponent(`/live/${liveId}`)}`;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[100] flex items-center gap-2 px-3 py-2 text-white"
      style={{
        paddingTop: "max(8px, env(safe-area-inset-top))",
        background: "rgba(16,22,43,0.96)",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div className="min-w-0 flex-1 text-[12px] font-semibold leading-tight">
        Ouvre ce live dans l’app KIDI+
      </div>
      <a
        href={appUrl}
        className="shrink-0 rounded-full bg-rose-600 px-3 py-1.5 text-[12px] font-bold text-white no-underline"
        onClick={() => {
          // If the custom scheme fails (app missing), send to download shortly after.
          window.setTimeout(() => {
            if (!document.hidden) window.location.href = downloadUrl;
          }, 1200);
        }}
      >
        Ouvrir
      </a>
      <a
        href={downloadUrl}
        className="shrink-0 rounded-full px-2.5 py-1.5 text-[11px] font-semibold text-white/80 no-underline"
      >
        Télécharger
      </a>
      <button
        type="button"
        aria-label="Fermer"
        className="shrink-0 px-1 text-[16px] leading-none text-white/60"
        onClick={() => setShow(false)}
      >
        ×
      </button>
    </div>
  );
}
