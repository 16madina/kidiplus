import { useContext, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X, RefreshCw, Plus, Trash2, Image as ImageIcon, Sparkles, Camera } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { Logo } from "@/components/brand/logo";
import { BroadcastVideo } from "./broadcast-video";
import { AddProductSheet } from "./add-product-sheet";
import { useBroadcast } from "@/lib/broadcast-context";
import {
  BROADCAST_CATEGORY_KEYS,
  BROADCAST_CATEGORY_LABEL_KEY,
  BROADCAST_CATEGORY_FR_FALLBACK,
} from "@/lib/broadcast-categories";
import { EASE_IOS, listContainer, listItem } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { createObjectUrlTracker, isBlobUrl } from "@/lib/object-url";
import { makeRoomName } from "@/lib/livekit";
import {
  blobUrlToFile,
  createLiveInDb,
  createScheduledLiveInDb,
  updateScheduledLiveInDb,
  uploadLiveImage,
} from "@/lib/lives-db";
import { formatMoney } from "@/lib/money";
import { useImmersiveScope } from "@/lib/immersive-context";
import { TabVisibilityContext } from "@/components/app-shell";
import { ScheduleLiveSetup } from "./schedule-live-setup";

const GOLD = "oklch(0.82 0.14 85)";
const GOLD_SOFT = "oklch(0.82 0.14 85 / 0.35)";



export function BroadcastSetup({ onExit }: { onExit: () => void }) {
  const { t } = useTranslation();
  const b = useBroadcast();
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [showAdd, setShowAdd] = useState(false);
  const [previewRetryKey, setPreviewRetryKey] = useState(0);

  // Full-screen immersive flow: hide the app's bottom tab bar while the setup
  // screen is on-screen. Gated by TabVisibility so it doesn't stay pushed when
  // the Live tab is mounted-but-hidden behind another tab.
  const tabVisible = useContext(TabVisibilityContext);
  useImmersiveScope(tabVisible);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const urlTrackerRef = useRef(createObjectUrlTracker());

  // Cleanup any blob URLs we created for the cover on unmount.
  useEffect(() => {
    const tracker = urlTrackerRef.current;
    return () => tracker.disposeAll();
  }, []);

  const pickCover = () => {
    // Direct programmatic click inside a user-gesture handler — required for
    // the file dialog to open reliably across browsers, and NOT swallowed by
    // Press/motion whileTap animations.
    coverInputRef.current?.click();
  };

  const onCoverFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = urlTrackerRef.current.track(URL.createObjectURL(file));
    if (isBlobUrl(b.cover)) urlTrackerRef.current.revoke(b.cover);
    b.setCover(url);
    b.setCoverFile(file);
    e.target.value = "";
    haptic.selection();
  };

  const canLaunch = b.title.trim().length > 0 && b.products.length > 0;
  const [launching, setLaunching] = useState(false);


  const uploadProducts = async () =>
    Promise.all(
      b.products.map(async (p, index) => {
        let imagePath: string | null = null;
        if (p.imageFile) {
          imagePath = await uploadLiveImage("live-products", p.imageFile, b.hostIdentity!);
        } else if (p.image && isBlobUrl(p.image)) {
          const file = await blobUrlToFile(p.image, `${p.name || "product"}.jpg`);
          imagePath = await uploadLiveImage("live-products", file, b.hostIdentity!);
        } else {
          imagePath = p.image || null;
        }
        return {
          name: p.name,
          imagePath,
          mode: p.mode,
          startPrice: p.startPrice,
          price: p.price,
          stock: p.stock,
          timerSeconds: p.timerSec,
          position: index,
        };
      }),
    );

  const uploadCover = async (): Promise<string | null> => {
    if (b.coverFile) return uploadLiveImage("live-covers", b.coverFile, b.hostIdentity!);
    if (b.cover && !isBlobUrl(b.cover) && !b.cover.startsWith("http")) return b.cover;
    if (b.cover && !isBlobUrl(b.cover)) return b.cover;
    return null;
  };

  const launch = async () => {
    if (!canLaunch || launching) return;
    if (!b.hostIdentity) {
      toast.error(t("auth.errors.notSignedIn", "Sign in to go live"));
      return;
    }
    haptic.medium();
    setLaunching(true);
    try {
      const coverPath = await uploadCover();
      const productsForDb = await uploadProducts();

      if (b.mode === "schedule") {
        const seed = b.hostIdentity.slice(0, 8) || "seller";
        const room = makeRoomName(seed);
        await createScheduledLiveInDb({
          sellerId: b.hostIdentity,
          title: b.title.trim(),
          category: b.category,
          coverPath,
          roomName: room,
          currency: b.currency,
          products: productsForDb,
          scheduledAt: new Date(b.scheduledAt!).toISOString(),
        });
        toast.success(t("schedule.savedToast", "Live programmé 📅"));
        onExit();
        return;
      }

      if (b.mode === "edit" && b.editingLiveId) {
        await updateScheduledLiveInDb(b.editingLiveId, {
          title: b.title.trim(),
          category: b.category,
          coverPath,
          scheduledAt: new Date(b.scheduledAt!).toISOString(),
          products: productsForDb,
        });
        toast.success(t("schedule.updatedToast", "Live modifié"));
        onExit();
        return;
      }

      // mode === "now"
      const seed = b.hostIdentity.slice(0, 8) || "seller";
      const room = makeRoomName(seed);
      const { liveId, productIds } = await createLiveInDb({
        sellerId: b.hostIdentity,
        title: b.title.trim(),
        category: b.category,
        coverPath,
        roomName: room,
        currency: b.currency,
        products: productsForDb,
      });

      b.setRoomName(room);
      b.setLiveId(liveId);
      b.setProductDbIds(productIds);
      b.goLive();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t("broadcast.setup.launchFailed", "Could not start live") + ` — ${msg}`);
      setLaunching(false);
    }
  };





  // Scheduled / edit flows use a dedicated numbered-card layout.
  if (b.mode === "schedule" || b.mode === "edit") {
    return <ScheduleLiveSetup onExit={onExit} />;
  }

  return (
    <motion.div
      key="setup"
      initial={{ opacity: 0, scale: 1.02 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.3, ease: EASE_IOS }}
      className="relative h-full w-full overflow-hidden"
      style={{
        background:
          "radial-gradient(120% 80% at 50% 0%, oklch(0.19 0.05 260) 0%, oklch(0.11 0.03 260) 55%, #05060a 100%)",
      }}
    >
      {/* Camera preview area (top half) */}
      <div className="absolute inset-x-0 top-0 h-[52%] overflow-hidden">
        <BroadcastVideo
          key={previewRetryKey}
          facing={facing}
          enabled={true}
          fallbackImage={b.cover}
          onRequestRetry={() => setPreviewRetryKey((k) => k + 1)}
        />
      </div>

      {/* Top bar — X · KIDI+ · Refresh */}
      <div
        className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
      >
        <Press
          onClick={onExit}
          aria-label={t("common.close")}
          className="!min-h-11 !min-w-11 h-11 w-11 rounded-full p-0 text-white"
          style={{
            backgroundColor: "rgba(10,12,20,0.55)",
            border: `1px solid ${GOLD_SOFT}`,
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          <X size={20} />
        </Press>
        <Logo size={72} withGoldFrame={false} />
        <Press
          onClick={() => {
            haptic.selection();
            setFacing((f) => (f === "user" ? "environment" : "user"));
            setPreviewRetryKey((k) => k + 1);
          }}
          aria-label={t("broadcast.live.flipCam")}
          className="!min-h-11 !min-w-11 h-11 w-11 rounded-full p-0"
          style={{
            backgroundColor: "rgba(10,12,20,0.55)",
            border: `1px solid ${GOLD_SOFT}`,
            color: GOLD,
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          <RefreshCw size={18} />
        </Press>
      </div>

      {/* Bottom sheet */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 px-4 pt-3"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)",
          background:
            "linear-gradient(to bottom, oklch(0.13 0.035 260 / 0.92) 0%, oklch(0.10 0.03 260) 25%, #05060a 100%)",
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          borderTop: `1px solid ${GOLD_SOFT}`,
          boxShadow: "0 -20px 50px rgba(0,0,0,0.55)",
        }}
      >
        {/* drag handle */}
        <div className="mx-auto mb-1 h-1 w-10 rounded-full" style={{ background: GOLD_SOFT }} />

        {/* Cover + title */}
        <div className="flex items-start gap-3">
          <Press
            onClick={pickCover}
            className="!min-h-16 relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl p-0"
            style={{
              backgroundColor: "oklch(0.16 0.04 260 / 0.9)",
              border: `1.5px solid ${GOLD}`,
              boxShadow: `0 0 16px ${GOLD_SOFT}`,
            }}
            aria-label={t("broadcast.setup.addCover")}
          >
            {b.cover ? (
              <motion.img
                key={b.cover}
                src={b.cover}
                alt=""
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, ease: EASE_IOS }}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="grid h-full w-full place-items-center" style={{ color: GOLD }}>
                <ImageIcon size={24} strokeWidth={1.6} />
                <Sparkles
                  size={10}
                  className="absolute right-1.5 top-1.5"
                  style={{ color: GOLD }}
                />
              </div>
            )}
          </Press>
          <input
            value={b.title}
            onChange={(e) => b.setTitle(e.target.value)}
            placeholder={t("broadcast.setup.titlePlaceholder", "Titre du live...")}
            maxLength={80}
            className="h-16 flex-1 rounded-2xl px-4 text-[15px] font-medium text-white placeholder:text-white/50 outline-none"
            style={{
              backgroundColor: "oklch(0.16 0.04 260 / 0.7)",
              border: `1px solid ${GOLD_SOFT}`,
            }}
          />
          <input
            ref={coverInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={onCoverFile}
          />
        </div>

        {/* Category pills */}
        <div
          className="flex gap-2 overflow-x-auto pb-1"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {BROADCAST_CATEGORY_KEYS.map((c) => {
            const active = c === b.category;
            const label = t(
              BROADCAST_CATEGORY_LABEL_KEY[c],
              BROADCAST_CATEGORY_FR_FALLBACK[c],
            );
            return (
              <Press
                key={c}
                onClick={() => {
                  haptic.selection();
                  b.setCategory(c);
                }}
                className="!min-h-9 h-9 shrink-0 rounded-full px-4 text-[13px] font-semibold"
                style={{
                  color: active ? "#0a0a12" : "white",
                  background: active
                    ? `linear-gradient(135deg, ${GOLD}, oklch(0.72 0.16 70))`
                    : "transparent",
                  border: active ? "none" : `1px solid ${GOLD_SOFT}`,
                  boxShadow: active ? `0 6px 18px ${GOLD_SOFT}` : "none",
                }}
              >
                {label}
              </Press>
            );
          })}
        </div>

        {/* Products */}
        <div>
          <div className="mb-2">
            <span className="text-[14px] font-bold text-white">
              {t("broadcast.setup.products", "Produits")} ({b.products.length})
            </span>
          </div>
          <motion.div
            variants={listContainer}
            initial="hidden"
            animate="show"
            className="flex gap-2 overflow-x-auto pb-1"
          >
            {b.products.map((p) => (
              <motion.div
                key={p.id}
                variants={listItem}
                className="relative flex w-20 shrink-0 flex-col gap-1"
              >
                <div
                  className="relative h-20 w-20 overflow-hidden rounded-2xl"
                  style={{ border: `1px solid ${GOLD_SOFT}` }}
                >
                  <img src={p.image} alt="" className="h-full w-full object-cover" />
                  <Press
                    onClick={() => b.removeProduct(p.id)}
                    aria-label={t("common.remove")}
                    className="!min-h-6 !min-w-6 absolute right-1 top-1 h-6 w-6 rounded-full p-0 text-white"
                    style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
                  >
                    <Trash2 size={11} />
                  </Press>
                </div>
                <span className="truncate text-[10px] font-medium text-white">{p.name}</span>
                <span className="text-[9px] text-white/60">
                  {p.mode === "auction"
                    ? `dès ${formatMoney(p.startPrice, b.currency, "fr")}`
                    : formatMoney(p.price, b.currency, "fr")}
                </span>
              </motion.div>
            ))}
            <Press
              onClick={() => setShowAdd(true)}
              className="!min-h-20 flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl p-0"
              style={{
                border: `2px dashed ${GOLD}`,
                background: "transparent",
                color: GOLD,
              }}
            >
              <Plus size={22} strokeWidth={2} />
              <span className="text-[10px] font-semibold">{t("common.add", "Ajouter")}</span>
            </Press>
          </motion.div>
        </div>

        {/* Launch */}
        <Press
          onClick={launch}
          disabled={!canLaunch || launching}
          hapticOnTap={false}
          className="!min-h-14 mt-1 h-14 w-full rounded-2xl text-[16px] font-bold disabled:opacity-40"
          style={{
            background: `linear-gradient(135deg, ${GOLD}, oklch(0.72 0.16 70))`,
            boxShadow: `0 10px 30px ${GOLD_SOFT}`,
            color: "#0a0a12",
          }}
        >
          {launching ? t("common.loading") : t("broadcast.setup.start", "Lancer le live")}
        </Press>
      </div>

      <AddProductSheet
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdd={(p) => b.addProduct(p)}
      />
    </motion.div>
  );
}
