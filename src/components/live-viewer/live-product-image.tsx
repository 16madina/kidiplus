import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { resolveProductDisplayImage, type LiveImageSize } from "@/lib/lives-db";
import { cn } from "@/lib/utils";

export function LiveProductImage({
  src,
  alt = "",
  className,
  placeholderClassName,
  iconClassName,
  draggable = false,
  size = "card",
}: {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  placeholderClassName?: string;
  iconClassName?: string;
  draggable?: boolean;
  size?: LiveImageSize;
}) {
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    setDisplaySrc(null);

    if (!src) {
      setFailed(true);
      return () => {
        alive = false;
      };
    }

    // blob/data only — https may be an expired signed URL; always re-resolve.
    if (/^(blob:|data:)/i.test(src)) {
      setDisplaySrc(src);
      return () => {
        alive = false;
      };
    }

    void (async () => {
      const delays = [0, 500, 1200, 2500, 4000];
      for (const delay of delays) {
        if (delay) await new Promise((r) => setTimeout(r, delay));
        if (!alive) return;
        const signed = await resolveProductDisplayImage(src, size);
        if (signed) {
          if (alive) setDisplaySrc(signed);
          return;
        }
      }
      // Egress / guests may already hold a service-signed https URL — use it
      // if client re-sign keeps failing (private bucket RLS).
      if (alive && /^https?:\/\//i.test(src)) {
        setDisplaySrc(src);
        return;
      }
      if (alive) setFailed(true);
    })();

    return () => {
      alive = false;
    };
  }, [src, size]);

  if (!displaySrc || failed) {
    return (
      <div className={cn("grid place-items-center bg-white/10", className, placeholderClassName)}>
        <Package size={18} className={cn("text-white/60", iconClassName)} />
      </div>
    );
  }

  return (
    <img
      src={displaySrc}
      alt={alt}
      className={className}
      draggable={draggable}
      onError={() => setFailed(true)}
      onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
    />
  );
}