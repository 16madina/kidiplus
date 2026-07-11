import { useEffect, useState } from "react";
import logoAsset from "@/assets/logo.png.asset.json";


/**
 * KiDi+ brand logo.
 * Renders the uploaded brand mark from Lovable Assets by default,
 * otherwise falls back to a bold wordmark with a gold "+".
 *
 * Gold accent token: var(--primary) (brand gold).
 * In dark mode, the raster logo's navy text becomes invisible on the dark
 * background, so "auto" falls back to the wordmark (white text + gold "+").
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
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === "undefined") return false;
    return document.documentElement.classList.contains("dark");
  });

  useEffect(() => {
    if (typeof document === "undefined") return;
    const el = document.documentElement;
    const update = () => setIsDark(el.classList.contains("dark"));
    update();
    const obs = new MutationObserver(update);
    obs.observe(el, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, []);

  // In dark mode, the raster logo's dark navy wordmark disappears on the
  // dark background. Auto-fallback to the wordmark variant which uses
  // var(--foreground) (white) + gold "+".
  const showImage =
    variant === "image" || (variant === "auto" && !imgFailed && !isDark);


  if (showImage) {
    return (
      <img
        src={logoAsset.url}
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
