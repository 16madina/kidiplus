// OrderItemImage — displays an order's product photo.
//
// orders.item_image stores either a direct URL (http/data/blob) or a storage
// object path inside a private bucket ("<uid>/<uuid>.jpg"). Paths must be
// exchanged for a signed URL before the browser can load them. We try the
// live-products bucket first (orders come from lives), then shop-products.

import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { resolveLiveImage } from "@/lib/lives-db";
import { resolveShopImage } from "@/lib/shop-db";
import { cn } from "@/lib/utils";

const DIRECT_IMAGE_RE = /^(https?:|blob:|data:)/i;

async function resolveOrderImage(src: string): Promise<string | null> {
  const fromLive = await resolveLiveImage("live-products", src).catch(() => null);
  if (fromLive) return fromLive;
  return resolveShopImage(src).catch(() => null);
}

export function OrderItemImage({
  src,
  alt = "",
  className,
  iconSize = 18,
}: {
  src: string | null | undefined;
  alt?: string;
  className?: string;
  iconSize?: number;
}) {
  const [displaySrc, setDisplaySrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setFailed(false);
    setDisplaySrc(null);

    if (!src) {
      setFailed(true);
      return () => { alive = false; };
    }
    if (DIRECT_IMAGE_RE.test(src)) {
      setDisplaySrc(src);
      return () => { alive = false; };
    }

    void (async () => {
      // Retry a few times: the signed-URL endpoint can transiently fail
      // right after app resume / network changes.
      const delays = [0, 600, 1500, 3000];
      for (const delay of delays) {
        if (delay) await new Promise((r) => setTimeout(r, delay));
        if (!alive) return;
        const url = await resolveOrderImage(src);
        if (url) {
          if (alive) setDisplaySrc(url);
          return;
        }
      }
      if (alive) setFailed(true);
    })();

    return () => { alive = false; };
  }, [src]);

  if (!displaySrc || failed) {
    return (
      <div className={cn("grid place-items-center bg-muted", className)}>
        <Package size={iconSize} className="text-muted-foreground" />
      </div>
    );
  }

  return (
    <img
      src={displaySrc}
      alt={alt}
      className={className}
      draggable={false}
      onError={() => setFailed(true)}
      onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
    />
  );
}
