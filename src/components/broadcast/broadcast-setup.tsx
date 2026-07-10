import { useContext, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X, RefreshCw, Plus, Trash2, Image as ImageIcon, Camera, ChevronDown, Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { Logo } from "@/components/brand/logo";
import { BroadcastVideo } from "./broadcast-video";
import { AddProductSheet } from "./add-product-sheet";
import { ShopPickerSheet } from "@/components/shop/shop-picker-sheet";
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
import { useAuth } from "@/lib/auth-context";
import { CoverCropperSheet } from "./cover-cropper-sheet";

const MIN_TITLE_LENGTH = 3;
const MAX_TITLE_LENGTH = 80;

const GOLD = "oklch(0.82 0.14 85)";
const GOLD_SOFT = "oklch(0.82 0.14 85 / 0.35)";



export function BroadcastSetup({ onExit }: { onExit: () => void }) {
  const { t } = useTranslation();
  const b = useBroadcast();
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [showAdd, setShowAdd] = useState(false);
  const [showShopPicker, setShowShopPicker] = useState(false);
  const [previewRetryKey, setPreviewRetryKey] = useState(0);
  const [showMoreCats, setShowMoreCats] = useState(false);

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

  // Prefill title with the shop/display name and cover with the shop avatar,
  // so the user can launch a live without extra taps. They can still tap the
  // cover or edit the title to override.
  const { profile } = useAuth();
  useEffect(() => {
    if (!profile) return;
    if (!b.title.trim() && profile.display_name) {
      b.setTitle(profile.display_name);
    }
    if (!b.cover && !b.coverFile && profile.avatar_url) {
      b.setCover(profile.avatar_url);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.display_name, profile?.avatar_url]);

  // Raw (uncropped) source we last loaded into the cropper. Lets the user
  // re-open the cropper to fine-tune without re-picking the file.
  const [rawCoverSrc, setRawCoverSrc] = useState<string | null>(null);
  const [cropperOpen, setCropperOpen] = useState(false);

  const pickCover = () => {
    // If we already have a raw source (a previously picked file, or the
    // prefilled shop avatar URL), tapping the cover re-opens the cropper.
    if (rawCoverSrc) {
      setCropperOpen(true);
      haptic.selection();
      return;
    }
    // Direct programmatic click inside a user-gesture handler — required for
    // the file dialog to open reliably across browsers, and NOT swallowed by
    // Press/motion whileTap animations.
    coverInputRef.current?.click();
  };

  const onCoverFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = urlTrackerRef.current.track(URL.createObjectURL(file));
    setRawCoverSrc(url);
    setCropperOpen(true);
    e.target.value = "";
    haptic.selection();
  };

  // When we prefill the cover from the user's profile avatar, keep the URL as
  // the raw source too — so the first tap opens the cropper on it.
  useEffect(() => {
    if (!rawCoverSrc && b.cover && !isBlobUrl(b.cover) && b.cover.startsWith("http")) {
      setRawCoverSrc(b.cover);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [b.cover]);

  const onCropConfirm = (file: File, previewUrl: string) => {
    urlTrackerRef.current.track(previewUrl);
    if (isBlobUrl(b.cover)) urlTrackerRef.current.revoke(b.cover);
    b.setCover(previewUrl);
    b.setCoverFile(file);
    setCropperOpen(false);
    haptic.success();
  };

  const titleLen = b.title.trim().length;
  const titleTooShort = titleLen > 0 && titleLen < MIN_TITLE_LENGTH;
  const canLaunch = titleLen >= MIN_TITLE_LENGTH && b.products.length > 0;
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
          shopProductId: p.shopProductId ?? null,
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
    if (launching) return;
    // Explicit, user-visible validation so the disabled button doesn't feel
    // silently broken.
    const trimmed = b.title.trim();
    if (trimmed.length === 0) {
      haptic.warning();
      toast.error(
        t("broadcast.setup.errors.titleRequired", "Ajoute un titre à ton live avant de continuer"),
      );
      return;
    }
    if (trimmed.length < MIN_TITLE_LENGTH) {
      haptic.warning();
      toast.error(
        t(
          "broadcast.setup.errors.titleTooShort",
          `Le titre doit contenir au moins ${MIN_TITLE_LENGTH} caractères`,
        ),
      );
      return;
    }
    if (b.products.length === 0) {
      haptic.warning();
      toast.error(
        t("broadcast.setup.errors.noProducts", "Ajoute au moins un produit à vendre"),
      );
      return;
    }
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
        <div
          style={{
            filter: `drop-shadow(0 0 10px ${GOLD_SOFT}) drop-shadow(0 2px 6px rgba(0,0,0,0.6))`,
          }}
        >
          <Logo size={44} variant="wordmark" />
        </div>
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

        {/* Category pills — horizontally slidable + "Voir plus" dropdown */}
        <div className="relative">
          <div
            className="flex gap-2 overflow-x-auto pb-1"
            style={{ WebkitOverflowScrolling: "touch", scrollbarWidth: "none" }}
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
            <Press
              onClick={() => {
                haptic.selection();
                setShowMoreCats((v) => !v);
              }}
              className="!min-h-9 h-9 shrink-0 gap-1 rounded-full px-3 text-[13px] font-semibold"
              style={{
                color: GOLD,
                background: "transparent",
                border: `1px solid ${GOLD_SOFT}`,
              }}
            >
              <span>{t("broadcast.setup.seeMore", "Voir plus")}</span>
              <ChevronDown
                size={14}
                style={{
                  transform: showMoreCats ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 0.2s",
                }}
              />
            </Press>
          </div>

          {showMoreCats && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, ease: EASE_IOS }}
              className="absolute inset-x-0 top-full z-40 mt-2 grid grid-cols-2 gap-2 rounded-2xl p-3"
              style={{
                background: "oklch(0.13 0.035 260 / 0.98)",
                border: `1px solid ${GOLD_SOFT}`,
                boxShadow: "0 20px 40px rgba(0,0,0,0.55)",
                backdropFilter: "blur(14px)",
                WebkitBackdropFilter: "blur(14px)",
              }}
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
                      setShowMoreCats(false);
                    }}
                    className="!min-h-10 h-10 justify-between rounded-xl px-3 text-[13px] font-medium"
                    style={{
                      color: active ? GOLD : "white",
                      background: active
                        ? "oklch(0.82 0.14 85 / 0.12)"
                        : "oklch(0.16 0.04 260 / 0.6)",
                      border: `1px solid ${active ? GOLD : "oklch(0.82 0.14 85 / 0.15)"}`,
                    }}
                  >
                    <span className="truncate">{label}</span>
                    {active && <Check size={14} />}
                  </Press>
                );
              })}
            </motion.div>
          )}
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
            <Press
              onClick={() => setShowShopPicker(true)}
              className="!min-h-20 flex h-20 w-20 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl p-0 text-white"
              style={{
                border: `1.5px solid ${GOLD_SOFT}`,
                background: "oklch(0.16 0.04 260 / 0.7)",
              }}
              aria-label={t("shop.pickFromShop", "Ma boutique")}
            >
              <span style={{ fontSize: 22 }}>📦</span>
              <span className="text-[10px] font-semibold">{t("shop.short", "Boutique")}</span>
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
      <ShopPickerSheet
        open={showShopPicker}
        onClose={() => setShowShopPicker(false)}
        onConfirm={(items) => {
          for (const it of items) b.addProduct(it);
        }}
      />
    </motion.div>
  );
}
