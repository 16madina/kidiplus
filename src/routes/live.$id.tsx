import { createFileRoute, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { isNative } from "@/lib/native";
import { EMAIL_CONFIG } from "@/lib/email/config";
import { liveShareUrl } from "@/lib/deep-links";

/**
 * Shared live link: https://kidiplus.com/live/:id
 *
 * - App already installed + Universal Link → iOS/Android opens KiDi+ on this live.
 * - Mobile browser (no app) → try kidiplus:// then App Store / Play Store (not web live).
 * - Desktop → download page with both store buttons.
 */
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
  const [mode, setMode] = useState<"native" | "bridge" | "loading">("loading");

  useEffect(() => {
    if (isNative()) {
      setMode("native");
      window.dispatchEvent(
        new CustomEvent("kidi:push-open", {
          detail: { kind: "live", live_id: id },
        }),
      );
      return;
    }
    setMode("bridge");
  }, [id]);

  if (mode === "loading") {
    return <BridgeShell message="KiDi+…" />;
  }

  if (mode === "native") {
    return <AppShell />;
  }

  return <LiveStoreBridge liveId={id} />;
}

function storeUrlForUserAgent(ua: string): string {
  if (/iPhone|iPad|iPod/i.test(ua)) return EMAIL_CONFIG.APP_STORE_URL;
  if (/Android/i.test(ua)) return EMAIL_CONFIG.PLAY_STORE_URL;
  return `${EMAIL_CONFIG.FALLBACK_URL.replace(/\/$/, "")}`;
}

function LiveStoreBridge({ liveId }: { liveId: string }) {
  const [status, setStatus] = useState("Ouverture de KiDi+…");
  const path = `/live/${liveId}`;
  const appUrl = `${EMAIL_CONFIG.APP_SCHEME}://live/${encodeURIComponent(liveId)}`;
  const downloadWithNext = `${EMAIL_CONFIG.FALLBACK_URL.replace(/\/$/, "")}?next=${encodeURIComponent(path)}`;

  useEffect(() => {
    try {
      window.localStorage.setItem("kidi.pending_path", path);
    } catch {
      /* ignore */
    }

    const ua = navigator.userAgent || "";
    const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);

    // Desktop / unknown: landing with both stores (no web live).
    if (!isMobile) {
      setStatus("Redirection vers le téléchargement…");
      window.location.replace(downloadWithNext);
      return;
    }

    const storeUrl = storeUrlForUserAgent(ua);
    setStatus("Si l’app ne s’ouvre pas, redirection vers le store…");

    const start = Date.now();
    const timer = window.setTimeout(() => {
      // App didn't come to foreground → send to the right store.
      if (Date.now() - start < 2800 && !document.hidden) {
        window.location.replace(storeUrl);
      }
    }, 1400);

    // Try native scheme first (covers cases Universal Link didn't catch).
    window.location.href = appUrl;

    return () => window.clearTimeout(timer);
  }, [appUrl, downloadWithNext, path]);

  return <BridgeShell message={status} />;
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
        <p style={{ margin: "10px 0 0", fontSize: 14, opacity: 0.85 }}>{message}</p>
      </div>
    </main>
  );
}
