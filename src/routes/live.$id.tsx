import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { isNative } from "@/lib/native";
import { EMAIL_CONFIG } from "@/lib/email/config";
import { liveShareUrl } from "@/lib/deep-links";

/**
 * Shared live link: https://kidiplus.com/live/:id
 *
 * - App installed (Universal Link) → open this live in KiDi+.
 * - No app → /download (App Store / Play Store / continue on web).
 * - ?web=1 → stay on the web live viewer (chosen from the download page).
 */
export const Route = createFileRoute("/live/$id")({
  validateSearch: (search: Record<string, unknown>) => ({
    web: search.web === true || search.web === "1" || search.web === 1,
  }),
  head: ({ params }) => ({
    meta: [
      { title: `Live · Kidi+` },
      { name: "description", content: "Rejoins ce live shopping sur Kidi+." },
      { property: "og:title", content: "Live shopping · Kidi+" },
      {
        property: "og:description",
        content: "Rejoins ce live shopping en direct sur Kidi+.",
      },
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
  const { web } = Route.useSearch();
  const [mode, setMode] = useState<"app" | "web" | "bridge" | "loading">(
    "loading",
  );

  useEffect(() => {
    if (isNative()) {
      setMode("app");
      window.dispatchEvent(
        new CustomEvent("kidi:push-open", {
          detail: { kind: "live", live_id: id },
        }),
      );
      return;
    }
    if (web) {
      setMode("web");
      return;
    }
    setMode("bridge");
  }, [id, web]);

  if (mode === "loading" || mode === "bridge") {
    return (
      <>
        {mode === "bridge" ? <LiveDownloadBridge liveId={id} /> : null}
        <BridgeShell message="KiDi+…" />
      </>
    );
  }

  // Native app shell, or explicit “continue on web”.
  return <AppShell />;
}

/** Try native app briefly, then land on the download chooser page. */
function LiveDownloadBridge({ liveId }: { liveId: string }) {
  useEffect(() => {
    const path = `/live/${liveId}`;
    const downloadUrl = `${EMAIL_CONFIG.FALLBACK_URL.replace(/\/$/, "")}?next=${encodeURIComponent(path)}`;
    const appUrl = `${EMAIL_CONFIG.APP_SCHEME}://live/${encodeURIComponent(liveId)}`;

    try {
      window.localStorage.setItem("kidi.pending_path", path);
    } catch {
      /* ignore */
    }

    const ua = navigator.userAgent || "";
    const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);

    if (!isMobile) {
      window.location.replace(downloadUrl);
      return;
    }

    const start = Date.now();
    const timer = window.setTimeout(() => {
      if (Date.now() - start < 2800 && !document.hidden) {
        window.location.replace(downloadUrl);
      }
    }, 1400);

    window.location.href = appUrl;
    return () => window.clearTimeout(timer);
  }, [liveId]);

  return null;
}

function BridgeShell({ message }: { message: string }) {
  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: 28,
        background: "#10162B",
        color: "#fff",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        textAlign: "center",
      }}
    >
      <div>
        <p style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>KiDi+</p>
        <p style={{ margin: "10px 0 0", fontSize: 14, opacity: 0.85 }}>
          {message}
        </p>
      </div>
    </main>
  );
}
