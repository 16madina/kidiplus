// OrderItemImage — displays an order's product photo.
//
// orders.item_image may be:
//   • a durable storage path ("uid/uuid.jpg")
//   • a (possibly expired) Supabase signed URL — re-sign via path extract
//   • an external http(s) URL
// Always resolve through live-products then shop-products helpers.

import { useEffect, useState } from "react";
import { Package } from "lucide-react";
import { resolveLiveImage } from "@/lib/lives-db";
import { resolveShopImage } from "@/lib/shop-db";
import { parseSupabaseStorageUrl } from "@/lib/storage-path";
import { cn } from "@/lib/utils";

async function resolveOrderImage(src: string): Promise<string | null> {
  const parsed = parseSupabaseStorageUrl(src);
  if (parsed?.bucket === "shop-products") {
    return resolveShopImage(src, "thumb").catch(() => null);
  }
  if (parsed?.bucket === "live-products" || parsed?.bucket === "live-covers") {
    return resolveLiveImage(parsed.bucket, src, "thumb").catch(() => null);
  }
  // Path or unknown: try live first (auction orders), then shop.
  const fromLive = await resolveLiveImage("live-products", src, "thumb").catch(() => null);
  if (fromLive) return fromLive;
  return resolveShopImage(src, "thumb").catch(() => null);
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
      return () => {
        alive = false;
      };
    }

    void (async () => {
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

    return () => {
      alive = false;
    };
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
