import { useState } from "react";
import logoAsset from "@/assets/logo.png.asset.json";


/**
 * KiDi+ brand logo.
 * Renders the uploaded brand mark from Lovable Assets by default,
 * otherwise falls back to a bold wordmark with a gold "+".
 *
 * Gold accent token: var(--primary) (brand gold).
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
  const showImage = variant !== "wordmark" && !imgFailed;

  if (showImage) {
    return (
      <img
        src={logoAsset.url}
        alt="KiDi+"

        onError={() => setImgFailed(true)}
        style={{ height: size, width: "auto", display: "block" }}
        className={className}
        draggable={false}
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
