// Multi-select of active shop products, with per-item mode/start/duration config.
// Called from the live SETUP screen and mid-live add sheet.
import { useEffect, useMemo, useState } from "react";
import { X, Check, Gavel, Tag, Package, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
import { Press } from "@/components/press";
import { useAuth } from "@/lib/auth-context";
import {
  listMyShopProducts,
  listSellerActiveShopProducts,
  resolveShopImage,
  resolveShopImages,
  type ShopProduct,
} from "@/lib/shop-db";
import { formatMoney, normalizeCurrency, currencySymbol } from "@/lib/money";
import { useLanguage } from "@/i18n/language-context";
import { haptic } from "@/lib/haptics";
import type { BProduct } from "@/lib/broadcast-context";

const GOLD = "oklch(0.82 0.14 85)";

export type PickedShopItem = Omit<BProduct, "id"> & { shopProductId: string };

type ItemConfig = {
  mode: "fixed" | "auction";
  price: string;
  startPrice: string;
  timerSec: string;
};


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
      defaults[p.id] = configs[p.id] ?? {
        mode: "fixed",
        price: String(Number(p.price)),
        startPrice: String(Number(p.price)),
        timerSec: "45",
      };
    }
    setConfigs(defaults);
    setStep("config");
  };

  const confirm = () => {
    if (!items) return;
    void (async () => {
      const picked: PickedShopItem[] = [];
      for (const p of items) {
        if (!selected.has(p.id)) continue;
        const c = configs[p.id];
        if (!c) continue;
        const price = Math.max(0, Number(c.price) || 0);
        const startPrice = Math.max(0, Number(c.startPrice) || 0);
        const timerSec = Math.max(10, Number(c.timerSec) || 10);
        const paths =
          p.images.length > 0 ? p.images : p.image_url ? [p.image_url] : [];
        const resolved = await resolveShopImages(paths);
        const cover = resolved[0] ?? imgs[p.id] ?? "";
        const extraImages = resolved.slice(1);
        picked.push({
          name: p.name,
          // Store the signed URL so viewers see it as-is (24h TTL from resolveShopImage).
          image: cover,
          mode: c.mode,
          startPrice,
          timerSec,
          price,
          stock: p.stock,
          shopProductId: p.id,
          description: p.description ?? undefined,
          brand: p.brand ?? undefined,
          condition: p.condition ?? null,
          colors: p.colors ?? [],
          sizes: p.sizes ?? [],
          extraImages: extraImages.length ? extraImages : undefined,
        });
      }
      onConfirm(picked);
      onClose();
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
              {items?.filter((p) => selected.has(p.id)).map((p) => {
                const c = configs[p.id];
                if (!c) return null;
                const update = (patch: Partial<ItemConfig>) =>
                  setConfigs((prev) => ({ ...prev, [p.id]: { ...prev[p.id], ...patch } }));
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
                      <div className="mt-3">
                        <label className="text-[11px] font-semibold uppercase text-muted-foreground">{`${t("shop.price")} (${symbol})`}</label>
                        <input
                          type="text" inputMode="decimal" value={c.price}
                          onChange={(e) => update({ price: e.target.value.replace(/[^0-9.,]/g, "") })}
                          onBlur={(e) => update({ price: String(Math.max(0, Number(e.target.value.replace(",", ".")) || 0)) })}
                          className="mt-1 h-10 w-full rounded-lg border bg-muted px-3 text-[14px]"
                          style={{ borderColor: "var(--border)" }}
                        />
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
                className="!min-h-12 h-12 flex-1 rounded-2xl text-[14px] font-bold text-white"
                style={{ background: "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))" }}
              >
                {t("shop.addToLive", { defaultValue: "Ajouter au live" })}
              </Press>
            </div>
          </>
        )}
      </div>
    </BottomSheet>
  );
}
