import { useEffect, useState } from "react";
import { Plus, Package, Pencil, Archive, RotateCcw, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { supabase } from "@/integrations/supabase/client";
import { PushScreen } from "@/components/push-screen";
import { useAuth } from "@/lib/auth-context";
import {
  listMyShopProducts,
  archiveShopProduct,
  reactivateShopProduct,
  resolveShopImage,
  type ShopProduct,
} from "@/lib/shop-db";
import { formatMoney, normalizeCurrency } from "@/lib/money";
import { useLanguage } from "@/i18n/language-context";
import { ShopProductFormSheet } from "@/components/shop/shop-product-form-sheet";
import { haptic } from "@/lib/haptics";

export function MyShopScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { user } = useAuth();
  const [items, setItems] = useState<ShopProduct[] | null>(null);
  const [imgs, setImgs] = useState<Record<string, string | null>>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ShopProduct | null>(null);

  const load = async () => {
    if (!user) return;
    const rows = await listMyShopProducts(user.id);
    setItems(rows);
    // Resolve images in parallel.
    const entries = await Promise.all(rows.map(async (r) => [r.id, await resolveShopImage(r.image_url)] as const));
    setImgs(Object.fromEntries(entries));
  };

  useEffect(() => {
    if (!open || !user) return;
    void load();
    const ch = supabase
      .channel(`my-shop-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_products", filter: `seller_id=eq.${user.id}` }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [open, user?.id]);


  const toggleActive = async (p: ShopProduct) => {
    haptic.medium();
    if (p.active) {
      await archiveShopProduct(p.id);
      toast.success(t("shop.archived", { defaultValue: "Archivé" }));
    } else {
      await reactivateShopProduct(p.id);
      toast.success(t("shop.reactivated", { defaultValue: "Réactivé" }));
    }
    await load();
  };

  return (
    <PushScreen open={open} onClose={onClose} title={t("shop.title", { defaultValue: "Ma boutique" })} zIndex={70}>
      <div className="px-4 py-4">
        <Press
          onClick={() => { setEditing(null); setFormOpen(true); haptic.light(); }}
          className="!min-h-12 mb-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-bold text-white"
          style={{ background: "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))" }}
        >
          <Plus size={18} />
          {t("shop.add", { defaultValue: "Ajouter un article" })}
        </Press>

        {items === null ? (
          <div className="grid place-items-center py-14"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : items.length === 0 ? (
          <div className="mt-8 flex flex-col items-center py-10 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-full bg-muted">
              <Package className="text-muted-foreground" />
            </div>
            <p className="mt-3 max-w-xs text-[14px] text-muted-foreground">
              {t("shop.empty", { defaultValue: "Aucun article. Ajoutes-en un pour l'utiliser dans tes prochains lives." })}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {items.map((p) => (
              <div key={p.id} className={`overflow-hidden rounded-2xl border border-border bg-card ${p.active ? "" : "opacity-60"}`}>
                <div className="relative aspect-square bg-muted">
                  {imgs[p.id] ? (
                    <img src={imgs[p.id]!} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center text-muted-foreground"><Package size={28} /></div>
                  )}
                  <span
                    className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase"
                    style={{
                      background: p.active ? "oklch(0.55 0.18 155 / 0.95)" : "oklch(0.4 0.02 260 / 0.95)",
                      color: "white",
                    }}
                  >
                    {p.active ? t("shop.active", { defaultValue: "Actif" }) : t("shop.archived", { defaultValue: "Archivé" })}
                  </span>
                </div>
                <div className="p-2">
                  <p className="truncate text-[13px] font-semibold">{p.name}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold">{formatMoney(Number(p.price), normalizeCurrency(p.currency), lang)}</span>
                    <span className="text-[11px] text-muted-foreground">×{p.stock}</span>
                  </div>
                  <div className="mt-1.5 flex gap-1">
                    <Press
                      onClick={() => { setEditing(p); setFormOpen(true); }}
                      className="!min-h-8 h-8 flex-1 rounded-lg bg-muted text-[11px] font-semibold"
                    >
                      <Pencil size={12} className="mr-1" />
                      {t("common.edit", { defaultValue: "Modifier" })}
                    </Press>
                    <Press
                      onClick={() => void toggleActive(p)}
                      className="!min-h-8 h-8 flex-1 rounded-lg bg-muted text-[11px] font-semibold"
                    >
                      {p.active ? <Archive size={12} className="mr-1" /> : <RotateCcw size={12} className="mr-1" />}
                      {p.active ? t("shop.archive", { defaultValue: "Archiver" }) : t("shop.reactivate", { defaultValue: "Réactiver" })}
                    </Press>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ShopProductFormSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        onSaved={() => void load()}
      />
    </PushScreen>
  );
}
