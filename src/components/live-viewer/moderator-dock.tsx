// Viewer-side "moderator dock" — surfaces product-management actions to a
// moderator watching a live. Mirrors the host's compact featured actions
// but limited to what a moderator can safely do (add / feature / start
// auction / put fixed on sale / pick from seller shop). Ending the live
// and ending an auction stay host-only.

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Package, Plus, Shield, Store } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { BottomSheet } from "./bottom-sheet";
import { LiveProductImage } from "./live-product-image";
import { AddProductSheet } from "@/components/broadcast/add-product-sheet";
import { ShopPickerSheet, type PickedShopItem } from "@/components/shop/shop-picker-sheet";
import { haptic } from "@/lib/haptics";
import { formatMoney } from "@/lib/money";
import {
  startAuctionInDb,
  activateFixedInDb,
  stopFixedInDb,
  createLiveProductInDb,
  relaunchUnsoldProductInDb,
  type LiveProductRow,
} from "@/lib/lives-db";
import type { AuctionStartEvt } from "@/lib/live-room";
import type { BProduct } from "@/lib/broadcast-context";

export type ModeratorDockProps = {
  liveId: string;
  userId: string;
  /** Host / seller — used to open their shop catalog. */
  sellerId: string;
  products: LiveProductRow[];
  activeAuction: AuctionStartEvt | null;
  currency: string;
  locale: string;
  broadcastAuctionStart: (evt: AuctionStartEvt) => void;
};

export function ModeratorDock({
  liveId,
  userId,
  sellerId,
  products,
  activeAuction,
  currency,
  locale,
  broadcastAuctionStart,
}: ModeratorDockProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [shopOpen, setShopOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const fmt = (n: number) => formatMoney(n, currency, locale);

  const doStartAuction = async (p: LiveProductRow) => {
    if (p.mode !== "auction") return;
    if (activeAuction && activeAuction.productId !== p.id) {
      toast.error(t("live.auctionAlreadyRunning", "Une enchère est déjà en cours. Termine-la d'abord."));
      return;
    }
    haptic.medium();
    setBusy(true);
    try {
      const res = await startAuctionInDb(p.id);
      if (!res.ok || !res.deadlineMs) {
        const err = res.error ?? "";
        toast.error(
          err === "auction_already_running"
            ? t("live.auctionAlreadyRunning", "Une enchère est déjà en cours. Termine-la d'abord.")
            : (res.error ?? t("moderator.startAuctionFailed", "Impossible de démarrer l'enchère")),
        );
        return;
      }
      broadcastAuctionStart({
        productId: p.id,
        deadlineMs: res.deadlineMs,
        timerSec: res.timerSec ?? p.timer_seconds,
        ...(res.auctionRound != null ? { auctionRound: res.auctionRound } : {}),
      });
      toast.success(t("moderator.auctionStarted", "Enchère démarrée"));
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  const doToggleFixed = async (p: LiveProductRow) => {
    if (p.mode !== "fixed") return;
    haptic.medium();
    if (p.status === "active") await stopFixedInDb(p.id);
    else await activateFixedInDb(p.id);
  };

  const persistProduct = async (
    p: Omit<BProduct, "id"> & { shopProductId?: string },
  ): Promise<boolean> => {
    const res = await createLiveProductInDb({
      liveId,
      userId,
      name: p.name,
      imageFile: p.imageFile ?? null,
      imageUrl: p.image,
      mode: p.mode,
      startPrice: p.startPrice,
      price: p.price,
      stock: p.stock,
      timerSeconds: p.timerSec,
      shopProductId: p.shopProductId ?? null,
      description: p.description ?? null,
      brand: p.brand ?? null,
      condition: p.condition ?? null,
      colors: p.colors ?? [],
      sizes: p.sizes ?? [],
      extraImages: p.extraImages,
      extraImageFiles: p.extraImageFiles,
      bidIncrement: p.bidIncrement ?? null,
    });
    if (!res.ok) {
      toast.error(res.error ?? t("common.error", "Une erreur est survenue"));
      return false;
    }
    return true;
  };

  const onAddProduct = async (p: Omit<BProduct, "id">) => {
    if (busy) return;
    setBusy(true);
    try {
      const ok = await persistProduct(p);
      if (ok) {
        haptic.success();
        toast.success(t("live.productAdded", "Produit ajouté"));
      }
    } finally {
      setBusy(false);
    }
  };

  const onPickFromShop = async (items: PickedShopItem[]) => {
    if (busy || items.length === 0) return;
    setBusy(true);
    try {
      let okCount = 0;
      for (const it of items) {
        if (await persistProduct(it)) okCount += 1;
      }
      if (okCount > 0) {
        haptic.success();
        toast.success(
          okCount === 1
            ? t("live.productAdded", "Produit ajouté")
            : t("moderator.productsAdded", {
                count: okCount,
                defaultValue: "{{count}} produits ajoutés",
              }),
        );
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Compact floating button — bottom-left, above chat composer. */}
      <div
        className="pointer-events-auto absolute z-30"
        style={{
          left: 12,
          bottom: "calc(env(safe-area-inset-bottom) + 68px)",
        }}
      >
        <Press
          onClick={() => { haptic.selection(); setOpen(true); }}
          aria-label={t("moderator.manage", "Gérer les produits")}
          className="!min-h-10 inline-flex h-10 items-center gap-1.5 rounded-full pl-2 pr-3 text-[12px] font-bold text-white"
          style={{
            backgroundColor: "rgba(0,0,0,0.6)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1.5px solid oklch(0.85 0.18 90)",
          }}
        >
          <Shield size={14} className="text-[oklch(0.85_0.18_90)]" />
          {t("moderator.manage", "Gérer")}
        </Press>
      </div>

      <BottomSheet open={open} onClose={() => setOpen(false)} heightPercent={80}>
        <div className="flex h-full min-h-0 flex-col px-4">
          <div className="flex items-center justify-between gap-2 pb-2 pt-1">
            <div className="flex min-w-0 items-center gap-2">
              <Shield size={16} className="shrink-0 text-[oklch(0.75_0.16_85)]" />
              <h2 className="truncate text-[17px] font-bold">
                {t("moderator.title", "Modérateur")}
              </h2>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Press
                onClick={() => { haptic.selection(); setOpen(false); setShopOpen(true); }}
                className="!min-h-9 inline-flex items-center gap-1.5 rounded-full border px-3 text-[12px] font-bold"
                style={{ borderColor: "var(--border)" }}
              >
                <Store size={14} /> {t("moderator.fromShop", "Boutique")}
              </Press>
              <Press
                onClick={() => { haptic.selection(); setOpen(false); setAddOpen(true); }}
                className="!min-h-9 inline-flex items-center gap-1.5 rounded-full bg-foreground px-3 text-[12px] font-bold text-background"
              >
                <Plus size={14} /> {t("moderator.addProduct", "Ajouter")}
              </Press>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto pb-6">
            {products.length === 0 ? (
              <div className="grid place-items-center py-10 text-[13px] text-muted-foreground">
                <Package size={24} className="mb-2 opacity-40" />
                {t("moderator.emptyProducts", "Aucun produit pour le moment")}
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                <AnimatePresence initial={false}>
                  {products.map((p) => {
                    const auctionActive = activeAuction?.productId === p.id;
                    const onSale = p.mode === "fixed" && p.status === "active";
                    const soldOut = p.mode === "auction"
                      ? p.status === "sold"
                      : p.stock <= 0 || p.status === "out";
                    return (
                      <motion.li
                        key={p.id}
                        layout
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-3 rounded-2xl border p-2.5"
                        style={{ borderColor: "var(--border)" }}
                      >
                        <LiveProductImage
                          src={p.image_url}
                          className="h-12 w-12 rounded-xl object-cover"
                          placeholderClassName="bg-muted"
                          iconClassName="text-muted-foreground"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold">{p.name}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {p.mode === "auction"
                              ? `${fmt(p.start_price)} · ${p.timer_seconds}s`
                              : `${fmt(p.price)} · stock ${Math.max(0, p.stock)}`}
                          </p>
                        </div>
                        {p.mode === "auction" ? (
                          p.status === "unsold" ? (
                            <Press
                              onClick={async () => {
                                const res = await relaunchUnsoldProductInDb(p.id);
                                if (!res.ok) toast.error(res.error ?? t("common.error", "Une erreur est survenue"));
                                else { haptic.success(); toast.success(t("live.relaunched")); }
                              }}
                              className="!min-h-9 rounded-full bg-foreground px-3 text-[12px] font-bold text-background"
                            >
                              {t("live.relaunch")}
                            </Press>
                          ) : soldOut ? (
                            <span className="rounded-full bg-muted px-3 py-1.5 text-[11px] font-bold">
                              {t("live.sold")}
                            </span>
                          ) : auctionActive ? (
                            <span
                              className="rounded-full px-3 py-1.5 text-[11px] font-bold text-white"
                              style={{ backgroundColor: "oklch(0.62 0.24 20)" }}
                            >
                              {t("live.live", "En cours")}
                            </span>
                          ) : activeAuction ? (
                            <span className="rounded-full bg-muted px-3 py-1.5 text-[11px] font-bold text-muted-foreground">
                              {t("live.waitOtherAuction", "Enchère en cours")}
                            </span>
                          ) : (
                            <Press
                              onClick={() => { void doStartAuction(p); }}
                              disabled={busy}
                              className="!min-h-9 rounded-full bg-foreground px-3 text-[12px] font-bold text-background disabled:opacity-50"
                            >
                              {t("moderator.startAuction", "Démarrer")}
                            </Press>
                          )
                        ) : soldOut ? (
                          <span className="rounded-full bg-muted px-3 py-1.5 text-[11px] font-bold">
                            {t("live.outOfStock")}
                          </span>
                        ) : (
                          <Press
                            onClick={() => { void doToggleFixed(p); }}
                            className="!min-h-9 rounded-full px-3 text-[12px] font-bold"
                            style={{
                              backgroundColor: onSale ? "oklch(0.72 0.2 145)" : "var(--foreground)",
                              color: onSale ? "white" : "var(--background)",
                            }}
                          >
                            {onSale ? t("moderator.stop", "Arrêter") : t("live.listForSale")}
                          </Press>
                        )}
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>
            )}
          </div>
        </div>
      </BottomSheet>

      <AddProductSheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        currency={currency}
        pickFromShopLabel={t("moderator.pickFromShop", "📦 Boutique du vendeur")}
        onPickFromShop={() => { setAddOpen(false); setShopOpen(true); }}
        onAdd={(p) => { void onAddProduct(p); }}
      />

      <ShopPickerSheet
        open={shopOpen}
        onClose={() => setShopOpen(false)}
        sellerId={sellerId}
        currency={currency}
        onConfirm={(items) => { void onPickFromShop(items); }}
      />
    </>
  );
}
