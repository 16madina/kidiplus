// Multi-select of active shop products, with per-item mode/start/duration config
// + optional quantity / colors / sizes synced from the shop catalog.
// Called from the live SETUP screen and mid-live add sheet.
import { useEffect, useMemo, useState } from "react";
import { X, Check, Gavel, Tag, Package, Loader2, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
import { Press } from "@/components/press";
import { useAuth } from "@/lib/auth-context";
import {
  listMyShopProducts,
  listSellerActiveShopProducts,
  resolveShopImage,
  type ShopProduct,
} from "@/lib/shop-db";
import { formatMoney, normalizeCurrency, currencySymbol } from "@/lib/money";
import { useLanguage } from "@/i18n/language-context";
import { haptic } from "@/lib/haptics";
import type { BProduct } from "@/lib/broadcast-context";
import {
  conditionLabel,
  formatProductMetaLine,
  type ProductCondition,
} from "@/lib/live-product-options";

const GOLD = "oklch(0.82 0.14 85)";

export type PickedShopItem = Omit<BProduct, "id"> & { shopProductId: string };

type ItemConfig = {
  mode: "fixed" | "auction";
  price: string;
  startPrice: string;
  timerSec: string;
  /** How many units to put on this live (≤ shop stock). */
  stock: string;
  colors: string[];
  sizes: string[];
  brand: string;
  condition: ProductCondition | null;
  optionsOpen: boolean;
};

function defaultConfig(p: ShopProduct): ItemConfig {
  return {
    mode: "fixed",
    price: String(Number(p.price)),
    startPrice: String(Number(p.price)),
    timerSec: "45",
    stock: String(Math.max(1, Number(p.stock) || 1)),
    colors: [...(p.colors ?? [])],
    sizes: [...(p.sizes ?? [])],
    brand: p.brand ?? "",
    condition: p.condition ?? null,
    optionsOpen: false,
  };
}

export function ShopPickerSheet({
  open,
  onClose,
  onConfirm,
  /** When set (e.g. moderator), load this seller's shop instead of the caller's. */
  sellerId,
  currency: currencyProp,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (items: PickedShopItem[]) => void;
  sellerId?: string | null;
  currency?: string;
}) {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { user, profile } = useAuth();
  const currency = normalizeCurrency(currencyProp ?? profile?.currency ?? "EUR");
  const symbol = currencySymbol(currency);
  const [items, setItems] = useState<ShopProduct[] | null>(null);
  const [imgs, setImgs] = useState<Record<string, string | null>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [configs, setConfigs] = useState<Record<string, ItemConfig>>({});
  const [step, setStep] = useState<"pick" | "config">("pick");
  const [query, setQuery] = useState("");
  const [confirming, setConfirming] = useState(false);

  const shopOwnerId = sellerId ?? user?.id ?? null;
  const forOtherSeller = !!sellerId && sellerId !== user?.id;

  useEffect(() => {
    if (!open || !shopOwnerId) return;
    void (async () => {
      const rows = sellerId
        ? (await listSellerActiveShopProducts(sellerId)).filter((r) => r.stock > 0)
        : (await listMyShopProducts(shopOwnerId)).filter((r) => r.active && r.stock > 0);
      setItems(rows);
      const entries = await Promise.all(rows.map(async (r) => [r.id, await resolveShopImage(r.image_url)] as const));
      setImgs(Object.fromEntries(entries));
      setSelected(new Set());
      setConfigs({});
      setStep("pick");
      setQuery("");
      setConfirming(false);
    })();
  }, [open, shopOwnerId, sellerId]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter((p) => p.name.toLowerCase().includes(q));
  }, [items, query]);

  const toggle = (id: string) => {
    haptic.selection();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const goConfig = () => {
    if (!items) return;
    const defaults: Record<string, ItemConfig> = {};
    for (const p of items) {
      if (!selected.has(p.id)) continue;
      defaults[p.id] = configs[p.id] ?? defaultConfig(p);
    }
    setConfigs(defaults);
    setStep("config");
  };

  const toggleTag = (
    id: string,
    key: "colors" | "sizes",
    value: string,
  ) => {
    haptic.selection();
    setConfigs((prev) => {
      const cur = prev[id];
      if (!cur) return prev;
      const list = cur[key];
      const next = list.includes(value)
        ? list.filter((x) => x !== value)
        : [...list, value];
      return { ...prev, [id]: { ...cur, [key]: next } };
    });
  };

  const confirm = () => {
    if (!items || confirming) return;
    setConfirming(true);
    void (async () => {
      try {
        const picked: PickedShopItem[] = [];
        for (const p of items) {
          if (!selected.has(p.id)) continue;
          const c = configs[p.id];
          if (!c) continue;
          const price = Math.max(0, Number(c.price) || 0);
          const startPrice = Math.max(0, Number(c.startPrice) || 0);
          const timerSec = Math.max(10, Number(c.timerSec) || 10);
          const maxStock = Math.max(1, Number(p.stock) || 1);
          const stock = Math.min(maxStock, Math.max(1, Number(c.stock) || 1));
          // Persist durable storage PATHS only — never signed URLs (they expire).
          const paths =
            p.images.length > 0 ? p.images : p.image_url ? [p.image_url] : [];
          const cover = paths[0] ?? "";
          const extraImages = paths.slice(1);
          picked.push({
            name: p.name,
            image: cover,
            mode: c.mode,
            startPrice,
            timerSec,
            price,
            stock,
            shopProductId: p.id,
            description: p.description ?? undefined,
            brand: c.brand.trim() || undefined,
            condition: c.condition,
            colors: c.colors,
            sizes: c.sizes,
            extraImages: extraImages.length ? extraImages : undefined,
          });
        }
        onConfirm(picked);
        onClose();
      } finally {
        setConfirming(false);
      }
    })();
  };

  const selectedCount = selected.size;

  return (
    <BottomSheet open={open} onClose={onClose} heightPercent={92}>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-1 pb-3">
          <h2 className="text-[19px] font-bold">
            {step === "pick"
              ? forOtherSeller
                ? t("shop.pickTitleSeller", { defaultValue: "Boutique du vendeur" })
                : t("shop.pickTitle", { defaultValue: "Choisir depuis ma boutique" })
              : t("shop.configTitle", { defaultValue: "Configurer les articles" })}
          </h2>
          <Press onClick={onClose} className="!min-h-10 h-10 w-10 rounded-full" aria-label={t("common.close")}>
            <X size={20} />
          </Press>
        </div>

        {step === "pick" ? (
          <>
            <div className="px-4 pb-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("shop.searchPlaceholder", { defaultValue: "Rechercher un article…" })}
                className="h-11 w-full rounded-xl border bg-muted px-3 text-[14px] outline-none placeholder:text-muted-foreground/70"
                style={{ borderColor: "var(--border)" }}
              />
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {items === null ? (
                <div className="grid place-items-center py-14"><Loader2 className="animate-spin text-muted-foreground" /></div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center py-16 text-center">
                  <div className="grid h-14 w-14 place-items-center rounded-full bg-muted"><Package className="text-muted-foreground" /></div>
                  <p className="mt-3 max-w-xs text-[13px] text-muted-foreground">
                    {query.trim()
                      ? t("shop.noSearchResults", { defaultValue: "Aucun article trouvé" })
                      : forOtherSeller
                        ? t("shop.emptyPickerSeller", { defaultValue: "Aucun article actif dans la boutique du vendeur." })
                        : t("shop.emptyPicker", { defaultValue: "Aucun article actif. Ajoute des articles dans Ma boutique." })}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {filtered.map((p) => {
                    const on = selected.has(p.id);
                    const meta = formatProductMetaLine({
                      brand: p.brand,
                      colors: p.colors,
                      sizes: p.sizes,
                      conditionText: conditionLabel(p.condition, t),
                    });
                    return (
                      <Press
                        key={p.id}
                        onClick={() => toggle(p.id)}
                        hapticOnTap={false}
                        className="!block relative overflow-hidden rounded-2xl border p-0 text-left"
                        style={{ borderColor: on ? GOLD : "var(--border)", background: "var(--card)" }}
                      >
                        <div className="relative aspect-square bg-muted">
                          {imgs[p.id] ? (
                            <img src={imgs[p.id]!} alt="" className="h-full w-full object-cover" onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")} />
                          ) : (
                            <div className="grid h-full w-full place-items-center text-muted-foreground"><Package size={28} /></div>
                          )}
                          {on && (
                            <div className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full" style={{ background: GOLD, color: "#0a0a12" }}>
                              <Check size={16} strokeWidth={2.5} />
                            </div>
                          )}
                        </div>
                        <div className="p-2">
                          <p className="truncate text-[13px] font-semibold">{p.name}</p>
                          {meta ? (
                            <p className="truncate text-[10px] text-muted-foreground">{meta}</p>
                          ) : null}
                          <p className="text-[13px] font-bold">{formatMoney(Number(p.price), currency, lang)}</p>
                          <p className="text-[11px] text-muted-foreground">×{p.stock}</p>
                        </div>
                      </Press>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="border-t border-border bg-background p-4 pb-safe">
              <Press
                onClick={goConfig}
                disabled={selectedCount === 0}
                className="!min-h-12 h-12 w-full rounded-2xl text-[15px] font-bold text-white disabled:opacity-40"
                style={{ background: "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))" }}
              >
                {t("shop.pickConfirm", { defaultValue: "Continuer ({{n}})", n: selectedCount })}
              </Press>
            </div>
          </>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              <p className="mb-3 text-[12px] text-muted-foreground">
                {t("shop.configHint", {
                  defaultValue:
                    "Choisis enchère ou prix fixe, la quantité pour ce live, puis Options pour couleurs / tailles.",
                })}
              </p>
              {items?.filter((p) => selected.has(p.id)).map((p) => {
                const c = configs[p.id];
                if (!c) return null;
                const update = (patch: Partial<ItemConfig>) =>
                  setConfigs((prev) => ({ ...prev, [p.id]: { ...prev[p.id], ...patch } }));
                const maxStock = Math.max(1, Number(p.stock) || 1);
                const shopColors = p.colors ?? [];
                const shopSizes = p.sizes ?? [];
                const hasShopOptions =
                  !!p.brand ||
                  !!p.condition ||
                  shopColors.length > 0 ||
                  shopSizes.length > 0;

                return (
                  <div key={p.id} className="mb-3 rounded-2xl border border-border bg-card p-3">
                    <div className="flex items-center gap-3">
                      {imgs[p.id] ? (
                        <img src={imgs[p.id]!} alt="" className="h-14 w-14 rounded-xl object-cover" onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")} />
                      ) : (
                        <div className="grid h-14 w-14 place-items-center rounded-xl bg-muted text-muted-foreground"><Package size={20} /></div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[14px] font-semibold">{p.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {t("shop.stockAvailable", {
                            defaultValue: "Stock boutique : {{n}}",
                            n: maxStock,
                          })}
                        </p>
                        <div className="mt-1 flex gap-1">
                          {(["fixed", "auction"] as const).map((m) => {
                            const on = c.mode === m;
                            return (
                              <Press
                                key={m}
                                onClick={() => update({ mode: m })}
                                className="!min-h-7 h-7 rounded-full px-3 text-[11px] font-semibold"
                                style={{
                                  background: on ? "var(--foreground)" : "var(--muted)",
                                  color: on ? "var(--background)" : "var(--muted-foreground)",
                                }}
                              >
                                {m === "fixed" ? (<><Tag size={11} className="mr-1" />{t("shop.fixed", { defaultValue: "Prix fixe" })}</>) : (<><Gavel size={11} className="mr-1" />{t("shop.auction", { defaultValue: "Enchère" })}</>)}
                              </Press>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {c.mode === "fixed" ? (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-semibold uppercase text-muted-foreground">{`${t("shop.price")} (${symbol})`}</label>
                          <input
                            type="text" inputMode="decimal" value={c.price}
                            onChange={(e) => update({ price: e.target.value.replace(/[^0-9.,]/g, "") })}
                            onBlur={(e) => update({ price: String(Math.max(0, Number(e.target.value.replace(",", ".")) || 0)) })}
                            className="mt-1 h-10 w-full rounded-lg border bg-muted px-3 text-[14px]"
                            style={{ borderColor: "var(--border)" }}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold uppercase text-muted-foreground">
                            {t("shop.qtyForLive", { defaultValue: "Qté pour ce live" })}
                          </label>
                          <input
                            type="text" inputMode="numeric" value={c.stock}
                            onChange={(e) => update({ stock: e.target.value.replace(/[^0-9]/g, "") })}
                            onBlur={(e) =>
                              update({
                                stock: String(
                                  Math.min(maxStock, Math.max(1, Number(e.target.value) || 1)),
                                ),
                              })
                            }
                            className="mt-1 h-10 w-full rounded-lg border bg-muted px-3 text-[14px]"
                            style={{ borderColor: "var(--border)" }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[11px] font-semibold uppercase text-muted-foreground">{`${t("shop.startPrice", { defaultValue: "Prix départ" })} (${symbol})`}</label>
                          <input
                            type="text" inputMode="decimal" value={c.startPrice}
                            onChange={(e) => update({ startPrice: e.target.value.replace(/[^0-9.,]/g, "") })}
                            onBlur={(e) => update({ startPrice: String(Math.max(0, Number(e.target.value.replace(",", ".")) || 0)) })}
                            className="mt-1 h-10 w-full rounded-lg border bg-muted px-3 text-[14px]"
                            style={{ borderColor: "var(--border)" }}
                          />
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold uppercase text-muted-foreground">{t("shop.durationSec", { defaultValue: "Durée (s)" })}</label>
                          <input
                            type="text" inputMode="numeric" value={c.timerSec}
                            onChange={(e) => update({ timerSec: e.target.value.replace(/[^0-9]/g, "") })}
                            onBlur={(e) => update({ timerSec: String(Math.max(10, Number(e.target.value) || 10)) })}
                            className="mt-1 h-10 w-full rounded-lg border bg-muted px-3 text-[14px]"
                            style={{ borderColor: "var(--border)" }}
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[11px] font-semibold uppercase text-muted-foreground">
                            {t("shop.qtyForLive", { defaultValue: "Qté pour ce live" })}
                          </label>
                          <input
                            type="text" inputMode="numeric" value={c.stock}
                            onChange={(e) => update({ stock: e.target.value.replace(/[^0-9]/g, "") })}
                            onBlur={(e) =>
                              update({
                                stock: String(
                                  Math.min(maxStock, Math.max(1, Number(e.target.value) || 1)),
                                ),
                              })
                            }
                            className="mt-1 h-10 w-full rounded-lg border bg-muted px-3 text-[14px]"
                            style={{ borderColor: "var(--border)" }}
                          />
                        </div>
                      </div>
                    )}

                    {/* Options — prefilled from shop, editable for this live */}
                    <button
                      type="button"
                      onClick={() => {
                        haptic.selection();
                        update({ optionsOpen: !c.optionsOpen });
                      }}
                      className="mt-3 flex w-full items-center justify-between rounded-xl border bg-muted/50 px-3 py-2.5 text-left"
                      style={{ borderColor: "var(--border)" }}
                    >
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold">
                          {t("productOptions.title", "Options")}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {hasShopOptions
                            ? formatProductMetaLine({
                                brand: c.brand || p.brand,
                                colors: c.colors.length ? c.colors : shopColors,
                                sizes: c.sizes.length ? c.sizes : shopSizes,
                                conditionText: conditionLabel(
                                  c.condition ?? p.condition,
                                  t,
                                ),
                              }) || t("productOptions.subtitle", "Marque, état, couleurs, tailles")
                            : t("shop.optionsEmpty", {
                                defaultValue: "Aucune option en boutique — tu peux en ajouter ici",
                              })}
                        </p>
                      </div>
                      <ChevronRight
                        size={16}
                        className="shrink-0 text-muted-foreground transition-transform"
                        style={{ transform: c.optionsOpen ? "rotate(90deg)" : undefined }}
                      />
                    </button>

                    {c.optionsOpen && (
                      <div className="mt-2 space-y-3 rounded-xl border px-3 py-3" style={{ borderColor: "var(--border)" }}>
                        {(p.brand || c.brand) && (
                          <div>
                            <p className="text-[11px] font-semibold uppercase text-muted-foreground">
                              {t("productOptions.brand", "Marque")}
                            </p>
                            <p className="mt-0.5 text-[13px] font-medium">{c.brand || p.brand}</p>
                          </div>
                        )}
                        {(p.condition || c.condition) && (
                          <div>
                            <p className="text-[11px] font-semibold uppercase text-muted-foreground">
                              {t("productOptions.conditionLabel", "État")}
                            </p>
                            <p className="mt-0.5 text-[13px] font-medium">
                              {conditionLabel(c.condition ?? p.condition, t)}
                            </p>
                          </div>
                        )}

                        {shopColors.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold uppercase text-muted-foreground">
                              {t("shop.pickColors", {
                                defaultValue: "Couleurs pour ce live",
                              })}
                            </p>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {shopColors.map((color) => {
                                const on = c.colors.includes(color);
                                return (
                                  <Press
                                    key={color}
                                    onClick={() => toggleTag(p.id, "colors", color)}
                                    className="!min-h-8 rounded-full px-2.5 text-[12px] font-semibold"
                                    style={{
                                      background: on ? "oklch(0.18 0.04 260)" : "var(--muted)",
                                      color: on ? "white" : "var(--foreground)",
                                      border: on ? "none" : "1px solid var(--border)",
                                    }}
                                  >
                                    {color}
                                  </Press>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {shopSizes.length > 0 && (
                          <div>
                            <p className="text-[11px] font-semibold uppercase text-muted-foreground">
                              {t("shop.pickSizes", {
                                defaultValue: "Tailles pour ce live",
                              })}
                            </p>
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {shopSizes.map((size) => {
                                const on = c.sizes.includes(size);
                                return (
                                  <Press
                                    key={size}
                                    onClick={() => toggleTag(p.id, "sizes", size)}
                                    className="!min-h-8 rounded-full px-2.5 text-[12px] font-semibold"
                                    style={{
                                      background: on ? "oklch(0.18 0.04 260)" : "var(--muted)",
                                      color: on ? "white" : "var(--foreground)",
                                      border: on ? "none" : "1px solid var(--border)",
                                    }}
                                  >
                                    {size}
                                  </Press>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {!hasShopOptions && (
                          <p className="text-[12px] text-muted-foreground">
                            {t("shop.optionsHintEditShop", {
                              defaultValue:
                                "Ajoute couleurs / tailles dans Ma boutique pour les retrouver ici.",
                            })}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-2 border-t border-border bg-background p-4 pb-safe">
              <Press onClick={() => setStep("pick")} className="!min-h-12 h-12 flex-1 rounded-2xl border border-border text-[14px] font-semibold">
                {t("common.back")}
              </Press>
              <Press
                onClick={confirm}
                disabled={confirming}
                className="!min-h-12 h-12 flex-1 rounded-2xl text-[14px] font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))" }}
              >
                {confirming ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  t("shop.addToLive", { defaultValue: "Ajouter au live" })
                )}
              </Press>
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
