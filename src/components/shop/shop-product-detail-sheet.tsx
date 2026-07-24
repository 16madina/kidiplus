// Public product detail sheet: swipeable gallery + name/price/description/options.
// Opened from the seller profile Boutique tab, search, and seller's own shop.
import { useEffect, useRef, useState } from "react";
import { X, Package, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
import { Press } from "@/components/press";
import { resolveShopImages, type ShopProduct } from "@/lib/shop-db";
import { formatMoney, normalizeCurrency } from "@/lib/money";
import { useLanguage } from "@/i18n/language-context";
import {
  conditionLabel,
  formatProductMetaLine,
} from "@/lib/live-product-options";
import { haptic } from "@/lib/haptics";

export function ShopProductDetailSheet({
  open,
  onClose,
  product,
  onEdit,
}: {
  open: boolean;
  onClose: () => void;
  product: ShopProduct | null;
  /** When set (seller managing their shop), show an Edit action. */
  onEdit?: (p: ShopProduct) => void;
}) {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const [urls, setUrls] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !product) { setUrls([]); setActive(0); return; }
    const paths = product.images.length > 0 ? product.images : (product.image_url ? [product.image_url] : []);
    void resolveShopImages(paths).then(setUrls);
    setActive(0);
  }, [open, product?.id]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const idx = Math.round(el.scrollLeft / el.clientWidth);
    if (idx !== active) setActive(idx);
  };

  if (!product) return null;
  const cur = normalizeCurrency(product.currency);
  const cond = conditionLabel(product.condition, t);
  const meta = formatProductMetaLine({
    brand: product.brand,
    colors: product.colors,
    sizes: product.sizes,
    conditionText: cond,
  });

  return (
    <BottomSheet open={open} onClose={onClose} heightPercent={88}>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-1 pb-2">
          <h2 className="truncate text-[17px] font-bold">{product.name}</h2>
          <div className="flex items-center gap-1">
            {onEdit ? (
              <Press
                onClick={() => {
                  haptic.selection();
                  onEdit(product);
                }}
                className="!min-h-10 h-10 w-10 rounded-full"
                aria-label={t("shop.editItem", { defaultValue: "Modifier" })}
              >
                <Pencil size={18} />
              </Press>
            ) : null}
            <Press onClick={onClose} className="!min-h-10 h-10 w-10 rounded-full" aria-label={t("common.close")}>
              <X size={20} />
            </Press>
          </div>
        </div>

        {/* Gallery */}
        <div className="relative bg-muted">
          <div
            ref={scrollerRef}
            onScroll={onScroll}
            className="flex snap-x snap-mandatory overflow-x-auto"
            style={{ scrollbarWidth: "none" }}
          >
            {urls.length === 0 ? (
              <div className="grid aspect-square w-full shrink-0 snap-center place-items-center text-muted-foreground">
                <Package size={40} />
              </div>
            ) : (
              urls.map((u, i) => (
                <div key={i} className="aspect-square w-full shrink-0 snap-center">
                  <img
                    src={u}
                    alt=""
                    className="h-full w-full object-cover"
                    onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
                  />
                </div>
              ))
            )}
          </div>
          {urls.length > 1 && (
            <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
              {urls.map((_, i) => (
                <span
                  key={i}
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: i === active ? 18 : 6,
                    background: i === active ? "white" : "rgba(255,255,255,0.55)",
                    boxShadow: "0 0 4px rgba(0,0,0,0.4)",
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[22px] font-bold">{formatMoney(Number(product.price), cur, lang)}</p>
            <p className="text-[12px] text-muted-foreground">×{product.stock}</p>
          </div>

          {meta ? (
            <p className="mt-1 text-[13px] text-muted-foreground">{meta}</p>
          ) : null}

          <p className="mt-2 text-[12px] font-semibold text-foreground/80">
            {t("shop.catalogPrice", {
              defaultValue: "Prix catalogue · vendu en live (enchère ou prix fixe)",
            })}
          </p>

          {product.colors.length > 0 && (
            <div className="mt-4">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("productOptions.colors", "Couleurs")}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {product.colors.map((c) => (
                  <span
                    key={c}
                    className="rounded-full bg-muted px-2.5 py-1 text-[12px] font-medium"
                    style={{ border: "1px solid var(--border)" }}
                  >
                    {c}
                  </span>
                ))}
              </div>
            </div>
          )}

          {product.sizes.length > 0 && (
            <div className="mt-3">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                {t("productOptions.sizes", "Tailles")}
              </p>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {product.sizes.map((s) => (
                  <span
                    key={s}
                    className="rounded-full bg-muted px-2.5 py-1 text-[12px] font-medium"
                    style={{ border: "1px solid var(--border)" }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {product.description ? (
            <p className="mt-4 whitespace-pre-line text-[14px] leading-relaxed text-foreground/90">
              {product.description}
            </p>
          ) : null}

          <p className="mt-4 text-[12px] text-muted-foreground">
            {t("sellerProfile.availableInLives", {
              defaultValue: "Disponible pendant les lives",
            })}
          </p>
        </div>
      </div>
    </BottomSheet>
  );
}
