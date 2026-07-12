import { useEffect, useState } from "react";
import logoAsset from "@/assets/logo.png.asset.json";
import logoDarkAsset from "@/assets/logo-dark.png.asset.json";






/**
 * KiDi+ brand logo.
 * Renders the uploaded brand mark from Lovable Assets by default,
 * otherwise falls back to a bold wordmark with a gold "+".
 *
 * Gold accent token: var(--primary) (brand gold).
 * Automatically swaps to a white-wordmark variant in dark mode.
 */
export function Logo({
  size = 44,
  variant = "auto",
  className,
}: {
  /** Height in px for the image variant; also drives wordmark font-size. */
  size?: number;
  /** "image" forces the image, "wordmark" forces text, "auto" tries image first. */
  variant?: "auto" | "image" | "wordmark";
  className?: string;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    const update = () => setIsDark(root.classList.contains("dark"));
    update();
    const obs = new MutationObserver(update);
    obs.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  const showImage = variant !== "wordmark" && !imgFailed;

  if (showImage) {
    return (
      <img
        src={isDark ? logoDarkAsset.url : logoAsset.url}
        alt="KiDi+"
        onLoad={() => setLoaded(true)}
        onError={() => setImgFailed(true)}
        className={`${className} ${loaded ? "is-loaded" : ""}`}
        draggable={false}
        style={{ height: size, width: "auto", display: "block" }}
      />
    );
  }

  // Wordmark fallback — bold, tight, with the "+" in gold.
  const fontSize = Math.round(size * 0.78);
  return (
    <span
      className={className}
      style={{
        fontSize,
        fontWeight: 900,
        letterSpacing: "-0.03em",
        lineHeight: 1,
        color: "var(--foreground)",
        display: "inline-flex",
        alignItems: "baseline",
      }}
    >
      KiDi
      <span style={{ color: "var(--primary)", marginLeft: "0.02em" }}>+</span>
    </span>
  );
}
