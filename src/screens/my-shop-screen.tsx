import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Package,
  Pencil,
  Archive,
  RotateCcw,
  Loader2,
  Bell,
  Menu,
  Radio,
  SlidersHorizontal,
  Sparkles,
  ShoppingBag,
  Users as UsersIcon,
  Video,
  ChevronRight,
  MoreHorizontal,
  ImagePlus,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { supabase } from "@/integrations/supabase/client";
import { PushScreen } from "@/components/push-screen";
import { useAuth } from "@/lib/auth-context";
import { EditProfileScreen } from "@/components/auth/edit-profile-screen";
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
import { resolveAvatarUrl, bustAvatarCache } from "@/lib/avatar-url";

/* ============================================================
   Design tokens — warm cream / gold / navy palette
   ============================================================ */
const CREAM_TOP = "#F6ECD9";
const CREAM_MID = "#EEDDBF";
const CREAM_LOW = "#E4CCA6";
const GOLD = "#C8A24B";
const GOLD_SOFT = "#E8D28A";
const NAVY = "#10162B";
const NAVY_SOFT = "#1C2440";

const CATEGORY_PILLS = [
  { key: "all", label: "Toutes" },
  { key: "accessoires", label: "Accessoires" },
  { key: "sacs", label: "Sacs" },
  { key: "bijoux", label: "Bijoux" },
  { key: "electro", label: "Électronique" },
  { key: "mode", label: "Mode" },
  { key: "maison", label: "Maison" },
];

export function MyShopScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { lang } = useLanguage();
  const { profile } = useAuth();
  const [items, setItems] = useState<ShopProduct[] | null>(null);
  const [imgs, setImgs] = useState<Record<string, string | null>>({});
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ShopProduct | null>(null);
  const [category, setCategory] = useState<string>("all");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [livesCount, setLivesCount] = useState<number>(0);

  const user = profile;

  const load = async () => {
    if (!user) return;
    const rows = await listMyShopProducts(user.id);
    setItems(rows);
    const entries = await Promise.all(
      rows.map(async (r) => [r.id, await resolveShopImage(r.image_url)] as const),
    );
    setImgs((prev) => {
      const next = { ...prev };
      for (const [id, url] of entries) if (url) next[id] = url;
      return next;
    });
  };

  useEffect(() => {
    if (!open || !user) return;
    void load();
    const ch = supabase
      .channel(`my-shop-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shop_products", filter: `seller_id=eq.${user.id}` },
        () => { void load(); },
      )
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [open, user?.id]);

  // Resolve avatar for hero
  useEffect(() => {
    let alive = true;
    if (!user?.avatar_url) { setAvatarUrl(null); return; }
    void resolveAvatarUrl(user.avatar_url).then((url) => {
      if (alive) setAvatarUrl(bustAvatarCache(url, user.avatar_url));
    });
    return () => { alive = false; };
  }, [user?.avatar_url]);

  // Live lives-count (any status) for the seller — “Lives réalisés”
  useEffect(() => {
    if (!open || !user) return;
    let alive = true;
    void (async () => {
      const { count } = await supabase
        .from("lives")
        .select("id", { count: "exact", head: true })
        .eq("seller_id", user.id);
      if (alive) setLivesCount(count ?? 0);
    })();
    return () => { alive = false; };
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

  const activeCount = items?.filter((i) => i.active).length ?? 0;
  const followers = user?.followers_count ?? 0;
  const online = activeCount > 0;

  const filtered = useMemo(() => {
    if (!items) return null;
    if (category === "all") return items;
    const kw = category.toLowerCase();
    return items.filter((p) => p.name.toLowerCase().includes(kw));
  }, [items, category]);

  const featured = useMemo(() => (items ?? []).filter((p) => p.active).slice(0, 8), [items]);

  const shopTitle = user?.display_name ? `${user.display_name} Boutique` : t("shop.title", { defaultValue: "Ma boutique" });
  const initial = (user?.display_name ?? user?.handle ?? "?").slice(0, 1).toUpperCase();

  const headerRight = (
    <div className="flex items-center gap-1">
      <Press aria-label="Notifications" className="relative h-10 w-10 rounded-full text-foreground" onClick={() => haptic.light()}>
        <Bell size={20} />
      </Press>
      <Press aria-label="Menu" className="h-10 w-10 rounded-full text-foreground" onClick={() => haptic.light()}>
        <Menu size={20} />
      </Press>
    </div>
  );

  return (
    <PushScreen open={open} onClose={onClose} title={t("shop.title", { defaultValue: "Ma boutique" })} right={headerRight} zIndex={70}>
      {/* Hero */}
      <div
        className="relative"
        style={{
          background: `linear-gradient(140deg, ${CREAM_TOP} 0%, ${CREAM_MID} 45%, ${CREAM_LOW} 100%)`,
          paddingBottom: 28,
        }}
      >
        {/* subtle silk shimmer overlay */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 60% at 20% 10%, rgba(255,255,255,0.55), transparent 60%), radial-gradient(80% 50% at 90% 30%, rgba(200,162,75,0.25), transparent 70%)",
            mixBlendMode: "screen",
          }}
        />

        {/* Avatar disc */}
        <div className="relative flex flex-col items-center pt-8">
          <div
            className="relative grid place-items-center rounded-full"
            style={{
              height: 132,
              width: 132,
              background: "rgba(255,255,255,0.92)",
              boxShadow: "0 12px 34px rgba(60,40,10,0.18)",
              border: `1.5px solid ${GOLD_SOFT}`,
            }}
          >
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt=""
                className="h-[118px] w-[118px] rounded-full object-cover"
                onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
                draggable={false}
              />
            ) : (
              <div
                className="grid h-[118px] w-[118px] place-items-center rounded-full font-serif text-[26px] font-bold"
                style={{ color: NAVY, letterSpacing: "0.06em" }}
              >
                {initial}
                <div className="absolute mt-9 text-[10px] font-semibold tracking-[0.2em] text-muted-foreground">BOUTIQUE</div>
              </div>
            )}
            {/* edit avatar chip */}
            <Press
              aria-label="Modifier"
              onClick={() => haptic.light()}
              className="absolute -bottom-1 right-2 grid h-8 w-8 place-items-center rounded-full"
              style={{ background: "#fff", border: `1px solid ${GOLD_SOFT}`, boxShadow: "0 2px 6px rgba(0,0,0,0.15)" }}
            >
              <Pencil size={13} style={{ color: NAVY }} />
            </Press>
          </div>

          <h1
            className="mt-5 font-serif text-[30px] font-bold leading-tight"
            style={{ color: NAVY, letterSpacing: "-0.01em" }}
          >
            {shopTitle}
          </h1>
          {user?.bio ? (
            <p className="mt-1.5 max-w-[26ch] px-6 text-center text-[13.5px]" style={{ color: "#4A4132" }}>
              {user.bio} <span aria-hidden>🤎</span>
            </p>
          ) : (
            <p className="mt-1.5 max-w-[28ch] px-6 text-center text-[13.5px]" style={{ color: "#4A4132" }}>
              L'élégance, la qualité, pour vos petits trésors. <span aria-hidden>🤎</span>
            </p>
          )}
        </div>
      </div>

      {/* Stats card */}
      <div className="relative -mt-4 px-4">
        <div
          className="grid grid-cols-4 items-center rounded-2xl bg-card px-2 py-3"
          style={{ boxShadow: "0 12px 30px rgba(20,15,5,0.08)", border: "1px solid rgba(200,162,75,0.18)" }}
        >
          <StatCol icon={<ShoppingBag size={16} style={{ color: GOLD }} />} label="Produits" value={String(items?.length ?? 0)} />
          <StatCol icon={<UsersIcon size={16} style={{ color: GOLD }} />} label="Abonnés" value={formatCompact(followers)} />
          <StatCol icon={<Video size={16} style={{ color: GOLD }} />} label="Lives réalisés" value={String(livesCount)} />
          <div className="flex flex-col items-center gap-0.5 border-l border-border/50 pl-2">
            <span className="text-[10px] font-medium text-muted-foreground">Boutique</span>
            <span className="inline-flex items-center gap-1 text-[13px] font-extrabold" style={{ color: online ? "#12703B" : "#8A8578" }}>
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: online ? "#1FA05A" : "#B4AC96" }}
              />
              {online ? "EN LIGNE" : "HORS LIGNE"}
            </span>
          </div>
        </div>
      </div>

      {/* Actions row */}
      <div className="mt-3 grid grid-cols-3 gap-2 px-4">
        <Press
          onClick={() => { setEditing(null); setFormOpen(true); haptic.light(); }}
          className="!min-h-12 flex h-12 items-center justify-center gap-1.5 rounded-2xl text-[13px] font-bold text-white"
          style={{ background: NAVY }}
        >
          <Plus size={16} />
          <span className="truncate">Ajouter</span>
        </Press>
        <Press
          onClick={() => { haptic.medium(); toast.info("Ouvre l'onglet Live pour démarrer"); onClose(); }}
          className="!min-h-12 flex h-12 items-center justify-center gap-1.5 rounded-2xl text-[13px] font-bold text-white"
          style={{ background: GOLD }}
        >
          <Radio size={15} />
          <span className="truncate">Lancer un live</span>
        </Press>
        <Press
          onClick={() => { haptic.light(); toast.info("Personnalisation à venir"); }}
          className="!min-h-12 flex h-12 items-center justify-center gap-1.5 rounded-2xl bg-card text-[13px] font-bold"
          style={{ border: "1px solid var(--border)", color: NAVY }}
        >
          <SlidersHorizontal size={15} />
          <span className="truncate">Personnaliser</span>
        </Press>
      </div>

      {/* Featured section */}
      {items && items.length > 0 && (
        <section className="mt-6">
          <div className="mb-2 flex items-center justify-between px-4">
            <h2 className="flex items-center gap-1.5 font-serif text-[17px] font-bold" style={{ color: NAVY }}>
              <Sparkles size={16} style={{ color: GOLD }} />
              Produits en vedette
            </h2>
            <Press onClick={() => haptic.light()} className="!min-h-8 flex items-center gap-0.5 text-[12px] font-semibold text-muted-foreground">
              Voir tout
              <ChevronRight size={14} />
            </Press>
          </div>
          {featured.length === 0 ? (
            <p className="px-4 text-[12px] text-muted-foreground">Aucun article actif pour l'instant.</p>
          ) : (
            <div
              className="flex gap-3 overflow-x-auto px-4 pb-2"
              style={{ scrollSnapType: "x mandatory", WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" }}
            >
              {featured.map((p) => (
                <div
                  key={`f-${p.id}`}
                  className="shrink-0 overflow-hidden rounded-2xl bg-card"
                  style={{ width: 160, scrollSnapAlign: "start", border: "1px solid var(--border)" }}
                >
                  <div className="relative aspect-square bg-muted">
                    {imgs[p.id] ? (
                      <img
                        src={imgs[p.id]!}
                        alt=""
                        className="h-full w-full object-cover"
                        onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-muted-foreground"><Package size={28} /></div>
                    )}
                    <span
                      className="absolute left-2 bottom-2 rounded-md px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-white"
                      style={{ background: p.active ? "#12873F" : "#4A4A52" }}
                    >
                      {p.active ? "Actif" : "Archivé"}
                    </span>
                  </div>
                  <div className="p-2.5">
                    <p className="truncate text-[13px] font-semibold" style={{ color: NAVY }}>{p.name}</p>
                    <div className="mt-0.5 flex items-baseline justify-between">
                      <span className="text-[13.5px] font-extrabold" style={{ color: NAVY }}>
                        {formatMoney(Number(p.price), normalizeCurrency(p.currency), lang)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">×{p.stock}</span>
                    </div>
                    <div className="mt-2 flex gap-1">
                      <Press onClick={() => { setEditing(p); setFormOpen(true); }} className="!min-h-8 h-8 flex-1 rounded-lg bg-muted text-[11px] font-semibold">
                        <Pencil size={12} />
                      </Press>
                      <Press onClick={() => void toggleActive(p)} className="!min-h-8 h-8 flex-1 rounded-lg bg-muted text-[11px] font-semibold">
                        {p.active ? <Archive size={12} /> : <RotateCcw size={12} />}
                      </Press>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Categories + grid */}
      <section className="mt-6 pb-8">
        <h2 className="px-4 font-serif text-[19px] font-bold" style={{ color: NAVY }}>
          Toutes les catégories
        </h2>
        <div
          className="mt-2 flex gap-2 overflow-x-auto px-4 pb-2"
          style={{ scrollSnapType: "x proximity", WebkitOverflowScrolling: "touch", overscrollBehaviorX: "contain" }}
        >
          {CATEGORY_PILLS.map((c) => {
            const active = c.key === category;
            return (
              <Press
                key={c.key}
                onClick={() => setCategory(c.key)}
                className="!min-h-9 shrink-0 rounded-full px-4 text-[12.5px] font-bold"
                style={{
                  background: active ? NAVY : "var(--card)",
                  color: active ? "#fff" : NAVY,
                  border: active ? "none" : "1px solid var(--border)",
                  scrollSnapAlign: "start",
                  transition: "background 150ms, color 150ms",
                }}
              >
                {c.label}
              </Press>
            );
          })}
        </div>

        <div className="px-4 pt-3">
          {items === null ? (
            <div className="grid place-items-center py-14"><Loader2 className="animate-spin text-muted-foreground" /></div>
          ) : (filtered && filtered.length === 0) ? (
            <div className="mt-8 flex flex-col items-center py-10 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-muted">
                <Package className="text-muted-foreground" />
              </div>
              <p className="mt-3 max-w-xs text-[13px] text-muted-foreground">
                {items.length === 0
                  ? t("shop.empty", { defaultValue: "Aucun article. Ajoutes-en un pour l'utiliser dans tes prochains lives." })
                  : "Aucun article dans cette catégorie."}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
              {(filtered ?? []).map((p) => (
                <div
                  key={p.id}
                  className="overflow-hidden rounded-2xl bg-card"
                  style={{ border: "1px solid var(--border)", opacity: p.active ? 1 : 0.65 }}
                >
                  <div className="relative aspect-square bg-muted">
                    {imgs[p.id] ? (
                      <img
                        src={imgs[p.id]!}
                        alt=""
                        className="h-full w-full object-cover"
                        onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
                        onError={() => setImgs((prev) => { const n = { ...prev }; delete n[p.id]; return n; })}
                      />
                    ) : (
                      <div className="grid h-full w-full place-items-center text-muted-foreground"><Package size={26} /></div>
                    )}
                    <span
                      className="absolute left-2 bottom-2 rounded-md px-1.5 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wide text-white"
                      style={{ background: p.active ? "#12873F" : "#4A4A52" }}
                    >
                      {p.active ? "Actif" : "Archivé"}
                    </span>
                    <Press
                      aria-label="Actions"
                      onClick={() => { setEditing(p); setFormOpen(true); }}
                      className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-foreground"
                      style={{ boxShadow: "0 1px 4px rgba(0,0,0,0.12)" }}
                    >
                      <MoreHorizontal size={14} />
                    </Press>
                  </div>
                  <div className="p-2">
                    <p className="truncate text-[12.5px] font-semibold" style={{ color: NAVY }}>{p.name}</p>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12.5px] font-extrabold" style={{ color: NAVY }}>
                        {formatMoney(Number(p.price), normalizeCurrency(p.currency), lang)}
                      </span>
                      <span className="text-[10.5px] text-muted-foreground">×{p.stock}</span>
                    </div>
                    <div className="mt-1.5 flex gap-1">
                      <Press onClick={() => { setEditing(p); setFormOpen(true); }} className="!min-h-8 h-8 flex-1 rounded-lg bg-muted text-[10.5px] font-semibold">
                        <Pencil size={11} />
                      </Press>
                      <Press onClick={() => void toggleActive(p)} className="!min-h-8 h-8 flex-1 rounded-lg bg-muted text-[10.5px] font-semibold">
                        {p.active ? <Archive size={11} /> : <RotateCcw size={11} />}
                      </Press>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <ShopProductFormSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        editing={editing}
        onSaved={() => void load()}
      />
    </PushScreen>
  );
}

function StatCol({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      {icon}
      <span className="text-[10px] font-medium text-muted-foreground">{label}</span>
      <span className="text-[15px] font-extrabold" style={{ color: NAVY }}>{value}</span>
    </div>
  );
}

function formatCompact(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".0", "")}k`;
  return String(n);
}
