import { useContext, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  X,
  Image as ImageIcon,
  Calendar as CalendarIcon,
  Clock,
  Timer,
  Plus,
  Trash2,
  Gavel,
  ShoppingBag,
  Bell,
  Gift,
  ChevronDown,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { Logo } from "@/components/brand/logo";
import { AddProductSheet } from "./add-product-sheet";
import { ShopPickerSheet } from "@/components/shop/shop-picker-sheet";
import { LiveProductImage } from "@/components/live-viewer/live-product-image";
import { useBroadcast } from "@/lib/broadcast-context";

import {
  BROADCAST_CATEGORY_KEYS,
  BROADCAST_CATEGORY_LABEL_KEY,
  BROADCAST_CATEGORY_FR_FALLBACK,
} from "@/lib/broadcast-categories";
import { EASE_IOS } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { createObjectUrlTracker, isBlobUrl } from "@/lib/object-url";
import { makeRoomName } from "@/lib/livekit";
import {
  blobUrlToFile,
  createScheduledLiveInDb,
  fetchScheduledLiveWithProducts,
  updateScheduledLiveInDb,
  uploadLiveImage,
} from "@/lib/lives-db";
import { useImmersiveScope } from "@/lib/immersive-context";
import { TabVisibilityContext } from "@/components/app-shell";
import { useAuth } from "@/lib/auth-context";
import { resolveAvatarUrl } from "@/lib/avatar-url";
import { DeliverySetupPromptDialog } from "./delivery-setup-prompt-dialog";
import { SellerDeliverySettingsScreen } from "@/components/seller/delivery-settings-screen";
import { fetchDeliverySettings } from "@/lib/delivery-db";
import { isSellerDeliveryConfigured } from "@/lib/delivery";

const GOLD = "oklch(0.82 0.14 85)";
const GOLD_DIM = "oklch(0.82 0.14 85 / 0.35)";
const CARD_BG = "oklch(0.16 0.04 260 / 0.75)";
const CARD_BORDER = "oklch(0.82 0.14 85 / 0.25)";

function toLocalInput(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function StepBadge({ n }: { n: number }) {
  return (
    <span
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
      style={{
        background: `linear-gradient(135deg, ${GOLD}, oklch(0.72 0.16 70))`,
        color: "black",
        boxShadow: "0 4px 14px oklch(0.82 0.14 85 / 0.35)",
      }}
    >
      {n}
    </span>
  );
}

function Card({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative rounded-2xl p-4"
      style={{
        background: CARD_BG,
        border: `1px solid ${CARD_BORDER}`,
        boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
      }}
    >
      {/* subtle gold shine on top edge */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${GOLD} 50%, transparent)`,
          opacity: 0.7,
        }}
      />
      <div className="mb-3 flex items-center gap-2">
        <StepBadge n={step} />
        <h3 className="text-[15px] font-semibold text-white">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => {
        haptic.selection();
        onChange(!checked);
      }}
      className="relative h-7 w-12 shrink-0 rounded-full transition-colors"
      style={{
        background: checked
          ? `linear-gradient(135deg, ${GOLD}, oklch(0.72 0.16 70))`
          : "oklch(0.28 0.02 260)",
        boxShadow: checked
          ? "0 4px 14px oklch(0.82 0.14 85 / 0.35)"
          : "inset 0 0 0 1px rgba(255,255,255,0.08)",
      }}
    >
      <motion.span
        layout
        transition={{ type: "spring", stiffness: 500, damping: 34 }}
        className="absolute top-0.5 h-6 w-6 rounded-full bg-white"
        style={{ left: checked ? "22px" : "2px" }}
      />
    </button>
  );
}

export function ScheduleLiveSetup({ onExit }: { onExit: () => void }) {
  const { t, i18n } = useTranslation();
  const b = useBroadcast();
  const { profile } = useAuth();

  const tabVisible = useContext(TabVisibilityContext);
  useImmersiveScope(tabVisible);

  const coverInputRef = useRef<HTMLInputElement>(null);
  const urlTrackerRef = useRef(createObjectUrlTracker());
  useEffect(() => {
    const tracker = urlTrackerRef.current;
    return () => tracker.disposeAll();
  }, []);

  // Prefill cover from profile avatar when available (same as instant go-live).
  useEffect(() => {
    if (!profile?.avatar_url) return;
    if (b.cover || b.coverFile) return;
    let cancelled = false;
    void resolveAvatarUrl(profile.avatar_url).then((url) => {
      if (!cancelled && url && !b.cover && !b.coverFile) b.setCover(url);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.avatar_url]);

  const [description, setDescription] = useState("");
  const [durationMin, setDurationMin] = useState(45);
  const [allowBids, setAllowBids] = useState(true);
  const [allowBuyNow, setAllowBuyNow] = useState(true);
  const [notifyFollowers, setNotifyFollowers] = useState(true);

  // Edit mode: reload persisted options (the form context only carries
  // title/category/cover/products — these live on the DB row).
  useEffect(() => {
    if (b.mode !== "edit" || !b.editingLiveId) return;
    let cancelled = false;
    void fetchScheduledLiveWithProducts(b.editingLiveId).then((full) => {
      if (cancelled || !full) return;
      setDescription(full.description ?? "");
      if (full.estimated_duration_min != null) setDurationMin(full.estimated_duration_min);
      setAllowBids(full.allow_bids !== false);
      setAllowBuyNow(full.allow_buy_now !== false);
      setNotifyFollowers(full.notify_followers !== false);
    });
    return () => {
      cancelled = true;
    };
  }, [b.mode, b.editingLiveId]);
  const allowGifts = b.allowGifts;
  const setAllowGifts = b.setAllowGifts;
  const [showAdd, setShowAdd] = useState(false);
  const [showShopPicker, setShowShopPicker] = useState(false);
  const [showCatMenu, setShowCatMenu] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [deliveryPromptOpen, setDeliveryPromptOpen] = useState(false);
  const [deliverySettingsOpen, setDeliverySettingsOpen] = useState(false);
  const deliverySkippedRef = useRef(false);


  // Kept for the datetime min/max clamps used by the split date/time inputs.

  const currentDate = b.scheduledAt ? new Date(b.scheduledAt) : null;
  const dateStr = currentDate
    ? currentDate.toLocaleDateString(i18n.language, {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : t("schedule.form.pickDate", "Choisir");
  const timeStr = currentDate
    ? currentDate.toLocaleTimeString(i18n.language, {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "--:--";

  
  const scheduleValid =
    !!b.scheduledAt && new Date(b.scheduledAt).getTime() > Date.now() + 60_000;
  const hasProfileAvatar = !!profile?.avatar_url?.trim();
  const hasCover = !!(b.coverFile || (b.cover && String(b.cover).trim()));
  const coverRequired = !hasProfileAvatar;
  const coverOk = !coverRequired || hasCover;
  const canLaunch =
    b.title.trim().length > 0 && b.products.length > 0 && scheduleValid && coverOk;

  
  const onCoverFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (isBlobUrl(b.cover)) urlTrackerRef.current.revoke(b.cover);
    // Use a data URL for the preview — it works everywhere (mobile Safari,
    // WebViews, HEIC-converted images) whereas blob URLs can silently fail
    // to render inside <img> in some sandboxed previews.
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : null;
      if (dataUrl) b.setCover(dataUrl);
    };
    reader.readAsDataURL(file);
    b.setCoverFile(file);
    e.target.value = "";
    haptic.selection();
  };

  // Split date/time controls: separate <input type="date"> and <input type="time">
  // so tapping "Heure" opens a time-only picker, not a full datetime calendar.
  const dateInputValue = currentDate
    ? `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, "0")}-${String(currentDate.getDate()).padStart(2, "0")}`
    : "";
  const timeInputValue = currentDate
    ? `${String(currentDate.getHours()).padStart(2, "0")}:${String(currentDate.getMinutes()).padStart(2, "0")}`
    : "";
  const minDateOnly = toLocalInput(new Date(Date.now() + 15 * 60 * 1000)).slice(0, 10);
  const maxDateOnly = toLocalInput(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)).slice(0, 10);

  const onDateChange = (value: string) => {
    if (!value) {
      b.setScheduledAt(null);
      return;
    }
    const [y, m, d] = value.split("-").map(Number);
    const base = currentDate ?? new Date(Date.now() + 60 * 60 * 1000);
    const next = new Date(base);
    next.setFullYear(y, (m ?? 1) - 1, d ?? 1);
    b.setScheduledAt(next.toISOString());
  };

  const onTimeChange = (value: string) => {
    if (!value) return;
    const [h, min] = value.split(":").map(Number);
    const base = currentDate ?? new Date(Date.now() + 60 * 60 * 1000);
    const next = new Date(base);
    next.setHours(h ?? 0, min ?? 0, 0, 0);
    b.setScheduledAt(next.toISOString());
  };

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
        const { uploadExtraLiveProductImages } = await import("@/lib/lives-db");
        const extraImages = await uploadExtraLiveProductImages({
          userId: b.hostIdentity!,
          productName: p.name,
          extraImages: p.extraImages,
          extraImageFiles: p.extraImageFiles,
        });
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
          description: p.description ?? null,
          brand: p.brand ?? null,
          condition: p.condition ?? null,
          colors: p.colors ?? [],
          sizes: p.sizes ?? [],
          extraImages,
          bidIncrement: p.bidIncrement ?? null,
        };
      }),
    );

  const uploadCover = async (): Promise<string | null> => {
    if (b.coverFile) return uploadLiveImage("live-covers", b.coverFile, b.hostIdentity!);
    if (b.cover && !isBlobUrl(b.cover)) return b.cover;
    return null;
  };

  const launch = async () => {
    if (launching) return;
    if (!coverOk) {
      haptic.warning();
      toast.error(
        t(
          "broadcast.setup.errors.coverRequired",
          "Ajoute une photo de couverture (tu n'as pas de photo de profil)",
        ),
      );
      coverInputRef.current?.click();
      return;
    }
    if (!canLaunch) return;
    if (!b.hostIdentity) {
      toast.error(t("auth.errors.notSignedIn", "Sign in to go live"));
      return;
    }

    if (!deliverySkippedRef.current) {
      const settings = await fetchDeliverySettings(b.hostIdentity);
      if (!isSellerDeliveryConfigured(settings)) {
        setDeliveryPromptOpen(true);
        return;
      }
    }

    await runLaunch();
  };

  const runLaunch = async () => {
    if (launching || !b.hostIdentity) return;
    haptic.medium();
    setLaunching(true);
    try {
      const coverPath = await uploadCover();
      const productsForDb = await uploadProducts();
      if (b.mode === "edit" && b.editingLiveId) {
        await updateScheduledLiveInDb(b.editingLiveId, {
          title: b.title.trim(),
          category: b.category,
          coverPath,
          scheduledAt: new Date(b.scheduledAt!).toISOString(),
          allowGifts,
          broadcastMode: b.streamSource === "rtmp" ? "rtmp" : "camera",
          description: description.trim() || null,
          estimatedDurationMin: durationMin,
          allowBids,
          allowBuyNow,
          notifyFollowers,
          products: productsForDb,
        });
        toast.success(t("schedule.updatedToast", "Live modifié"));
      } else {
        const seed = b.hostIdentity.slice(0, 8) || "seller";
        const room = makeRoomName(seed);
        await createScheduledLiveInDb({
          sellerId: b.hostIdentity,
          title: b.title.trim(),
          category: b.category,
          coverPath,
          roomName: room,
          currency: b.currency,
          broadcastMode: b.streamSource === "rtmp" ? "rtmp" : "camera",
          allowGifts,
          description: description.trim() || null,
          estimatedDurationMin: durationMin,
          allowBids,
          allowBuyNow,
          notifyFollowers,
          products: productsForDb,
          scheduledAt: new Date(b.scheduledAt!).toISOString(),
        });
        toast.success(t("schedule.savedToast", "Live programmé 📅"));
      }

      window.dispatchEvent(new CustomEvent("kidi:scheduled-lives-changed"));
      onExit();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(t("broadcast.setup.launchFailed", "Could not start live") + ` — ${msg}`);
      setLaunching(false);
    }
  };

  const currentCategoryLabel = t(
    BROADCAST_CATEGORY_LABEL_KEY[b.category as keyof typeof BROADCAST_CATEGORY_LABEL_KEY] ?? "categories.fashion",
    BROADCAST_CATEGORY_FR_FALLBACK[b.category as keyof typeof BROADCAST_CATEGORY_FR_FALLBACK] ?? "Mode",
  );

  return (
    <motion.div
      key="schedule-setup"
      initial={{ x: "100%", opacity: 0.6 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0.6 }}
      transition={{ duration: 0.32, ease: EASE_IOS }}
      className="relative flex h-full w-full flex-col overflow-hidden"
      style={{
        background:
          "radial-gradient(120% 80% at 50% 0%, oklch(0.19 0.05 260) 0%, oklch(0.10 0.03 260) 55%, #05060b 100%)",
      }}
    >
      {/* Header — fixed, non-scrolling */}
      <div
        className="relative z-30 flex shrink-0 items-center gap-3 px-4"
        style={{
          paddingTop: "calc(env(safe-area-inset-top) + 2px)",
          paddingBottom: 6,
          background:
            "linear-gradient(to bottom, oklch(0.11 0.03 260) 55%, oklch(0.11 0.03 260 / 0.6) 100%)",
        }}
      >
        <Press
          onClick={onExit}
          aria-label={t("common.close")}
          className="!min-h-11 !min-w-11 h-11 w-11 rounded-full text-white"
          style={{
            backgroundColor: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.15)",
          }}
        >
          <X size={20} />
        </Press>
        <div className="flex flex-1 items-center justify-center">
          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                filter: "blur(18px)",
                background:
                  "radial-gradient(70% 80% at 50% 55%, rgba(255,205,110,0.55), transparent 70%)",
              }}
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                filter: "blur(10px)",
                background:
                  "radial-gradient(50% 50% at 50% 55%, rgba(255,255,255,0.20), transparent 70%)",
              }}
            />
            <div
              className="relative"
              style={{ filter: "drop-shadow(0 3px 14px rgba(255,205,110,0.30))" }}
            >
              <Logo size={68} />
            </div>
            <div
              aria-hidden
              className="mx-auto mt-1 h-px w-24"
              style={{
                background: `linear-gradient(to right, transparent, ${GOLD}, transparent)`,
              }}
            />
          </div>
        </div>
        <div className="h-11 w-11" />
      </div>

      {/* Scrollable content */}
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
      <div className="mx-auto flex w-full max-w-[520px] flex-col gap-4 px-4 pb-40 pt-2">
        {/* Title block */}
        <div className="mt-1 text-center">
          <h1 className="text-[28px] font-extrabold leading-tight text-white">
            {b.mode === "edit"
              ? t("schedule.form.editTitle", "Modifier le live")
              : t("schedule.form.title", "Programmer un live")}
          </h1>
          <p className="mx-auto mt-1 max-w-[360px] text-[13px] text-white/60">
            {t(
              "schedule.form.subtitle",
              "Prépare ton live, ajoute tes articles et annonce-le à ta communauté.",
            )}
          </p>
        </div>

        {/* 1 — Cover */}
        <Card
          step={1}
          title={
            coverRequired
              ? t("schedule.form.coverTitleRequired", "Image de couverture *")
              : t("schedule.form.coverTitle", "Image de couverture")
          }
        >
          <label
            htmlFor="schedule-cover-input"
            className="relative flex h-40 w-full cursor-pointer items-center justify-center overflow-hidden rounded-xl"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: `1.5px dashed ${coverRequired && !hasCover ? "oklch(0.68 0.19 25)" : GOLD_DIM}`,
            }}
            aria-label={t("schedule.form.addCover", "Ajouter une image")}
          >
            {b.cover ? (
              <img
                key={b.cover}
                src={b.cover}
                alt=""
                className="h-full w-full object-cover"
                ref={(el) => {
                  if (el?.complete) el.setAttribute("data-loaded", "true");
                }}
                onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
              />
            ) : (
              <div className="pointer-events-none flex flex-col items-center gap-3">
                <ImageIcon size={36} color="rgba(255,255,255,0.35)" />
                <span
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold"
                  style={{
                    color: GOLD,
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${GOLD_DIM}`,
                  }}
                >
                  <Plus size={14} />
                  {t("schedule.form.addCover", "Ajouter une image")}
                </span>
              </div>
            )}
            <input
              id="schedule-cover-input"
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={onCoverFile}
            />
          </label>
          {coverRequired && !hasCover && (
            <p className="mt-2 text-[12px] font-medium" style={{ color: "oklch(0.78 0.18 25)" }}>
              {t(
                "broadcast.setup.errors.coverRequiredHint",
                "Photo de couverture obligatoire (pas de photo de profil)",
              )}
            </p>
          )}
        </Card>


        {/* 2 — Info */}
        <Card step={2} title={t("schedule.form.infoTitle", "Informations du live")}>
          <div className="grid grid-cols-[110px_1fr] items-center gap-y-3 gap-x-3">
            <label className="text-[13px] text-white/70">
              {t("schedule.form.titleLabel", "Titre du live")}
            </label>
            <input
              value={b.title}
              onChange={(e) => b.setTitle(e.target.value)}
              placeholder={t("broadcast.setup.titlePlaceholder", "Sacs & accessoires premium")}
              maxLength={80}
              className="h-10 rounded-lg px-3 text-[14px] text-white outline-none placeholder:text-white/35"
              style={{
                background: "oklch(0.13 0.03 260)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            />

            <label className="text-[13px] text-white/70">
              {t("schedule.form.categoryLabel", "Catégorie")}
            </label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowCatMenu((v) => !v)}
                className="flex h-10 w-full items-center justify-between rounded-lg px-3 text-left text-[14px] text-white outline-none"
                style={{
                  background: "oklch(0.13 0.03 260)",
                  border: "1px solid rgba(255,255,255,0.08)",
                }}
              >
                <span>{currentCategoryLabel}</span>
                <ChevronDown size={16} className="opacity-60" />
              </button>
              {showCatMenu && (
                <div
                  className="absolute left-0 right-0 top-11 z-40 max-h-64 overflow-y-auto rounded-lg py-1"
                  style={{
                    background: "oklch(0.15 0.03 260)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
                  }}
                >
                  {BROADCAST_CATEGORY_KEYS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        haptic.selection();
                        b.setCategory(c);
                        setShowCatMenu(false);
                      }}
                      className="block w-full px-3 py-2 text-left text-[14px] text-white/90 hover:bg-white/5"
                    >
                      {t(BROADCAST_CATEGORY_LABEL_KEY[c], BROADCAST_CATEGORY_FR_FALLBACK[c])}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <label className="pt-2 text-[13px] text-white/70">
              {t("schedule.form.descLabel", "Description")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t(
                "schedule.form.descPlaceholder",
                "Découvrez une sélection exclusive de sacs et accessoires haut de gamme.",
              )}
              rows={2}
              maxLength={240}
              className="rounded-lg px-3 py-2 text-[14px] text-white outline-none placeholder:text-white/35"
              style={{
                background: "oklch(0.13 0.03 260)",
                border: "1px solid rgba(255,255,255,0.08)",
                resize: "none",
              }}
            />
          </div>
        </Card>

        {/* 3 — Date & time */}
        <Card step={3} title={t("schedule.form.dateTitle", "Date et heure")}>
          <div className="grid grid-cols-2 items-center gap-x-3 gap-y-3">
            <label className="text-[13px] text-white/70">
              {t("schedule.form.date", "Date")}
            </label>
            <label className="text-[13px] text-white/70">
              {t("schedule.form.time", "Heure")}
            </label>

            <div
              className="relative flex h-10 items-center gap-2 rounded-lg px-3"
              style={{
                background: "oklch(0.13 0.03 260)",
                border: `1px solid ${GOLD_DIM}`,
              }}
            >
              <CalendarIcon size={16} color={GOLD} />
              <span className="truncate text-[14px] text-white">{dateStr}</span>
              <input
                type="date"
                min={minDateOnly}
                max={maxDateOnly}
                value={dateInputValue}
                onChange={(e) => onDateChange(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
                style={{ colorScheme: "dark" }}
                lang={i18n.language}
                aria-label={t("schedule.form.date", "Date")}
              />
            </div>

            <div
              className="relative flex h-10 items-center gap-2 rounded-lg px-3"
              style={{
                background: "oklch(0.13 0.03 260)",
                border: `1px solid ${GOLD_DIM}`,
              }}
            >
              <Clock size={16} color={GOLD} />
              <span className="text-[14px] text-white">{timeStr}</span>
              <input
                type="time"
                value={timeInputValue}
                onChange={(e) => onTimeChange(e.target.value)}
                className="absolute inset-0 cursor-pointer opacity-0"
                style={{ colorScheme: "dark" }}
                lang={i18n.language}
                aria-label={t("schedule.form.time", "Heure")}
              />
            </div>

            <label className="col-span-2 mt-1 text-[13px] text-white/70">
              {t("schedule.form.duration", "Durée estimée")}
            </label>
            <div
              className="col-span-2 flex h-10 items-center gap-2 rounded-lg px-3"
              style={{
                background: "oklch(0.13 0.03 260)",
                border: `1px solid ${GOLD_DIM}`,
              }}
            >
              <Timer size={16} color={GOLD} />
              <select
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
                className="flex-1 bg-transparent text-[14px] text-white outline-none"
                style={{ colorScheme: "dark" }}
              >
                {[15, 30, 45, 60, 75, 90, 120].map((m) => (
                  <option key={m} value={m} style={{ background: "#0f1220" }}>
                    {m} min
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Card>

        {/* 4 — Products */}
        <Card step={4} title={t("schedule.form.productsTitle", "Articles à présenter")}>
          <div className="flex flex-col gap-2">
            {b.products.map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-3 rounded-xl p-2"
                style={{
                  background: "oklch(0.13 0.03 260)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
              >
                <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg">
                  {p.image ? (
                    <LiveProductImage
                      key={p.image || p.id}
                      src={p.image}
                      className="h-full w-full object-cover"
                      size="thumb"
                    />
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-white/5">
                      <ImageIcon size={14} color="white" opacity={0.4} />
                    </div>
                  )}
                </div>
                <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-white">
                  {p.name}
                </span>
                <span
                  className="rounded-full px-2 py-1 text-[10.5px] font-semibold"
                  style={{
                    color: GOLD,
                    background: "rgba(255,255,255,0.04)",
                    border: `1px solid ${GOLD_DIM}`,
                  }}
                >
                  {p.mode === "auction"
                    ? t("broadcast.setup.productSheet.auction", "Enchère")
                    : t("broadcast.setup.productSheet.fixedPrice", "Achat immédiat")}
                </span>
                <button
                  type="button"
                  onClick={() => b.removeProduct(p.id)}
                  className="grid h-8 w-8 place-items-center rounded-md text-white/50 hover:text-white"
                  aria-label={t("common.remove")}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}

            <Press
              onClick={() => setShowAdd(true)}
              className="!min-h-11 flex h-11 w-full items-center justify-center gap-2 rounded-xl text-[13.5px] font-semibold"
              style={{
                color: GOLD,
                background: "rgba(255,255,255,0.03)",
                border: `1.5px dashed ${GOLD_DIM}`,
              }}
            >
              <Plus size={16} />
              {t("schedule.form.addProduct", "Ajouter un article")}
            </Press>
          </div>
        </Card>

        {/* 5 — Options */}
        <Card step={5} title={t("schedule.form.optionsTitle", "Options")}>
          <div className="flex flex-col gap-3">
            {[
              {
                icon: Gavel,
                label: t("schedule.form.optAuctions", "Activer les enchères"),
                value: allowBids,
                set: setAllowBids,
              },
              {
                icon: ShoppingBag,
                label: t("schedule.form.optBuyNow", "Achat immédiat"),
                value: allowBuyNow,
                set: setAllowBuyNow,
              },
              {
                icon: Bell,
                label: t("schedule.form.optNotify", "Notifier mes abonnés"),
                value: notifyFollowers,
                set: setNotifyFollowers,
              },
              {
                icon: Gift,
                label: t("schedule.form.optGifts", "Autoriser les cadeaux"),
                value: allowGifts,
                set: setAllowGifts,
              },
            ].map((row) => {
              const Icon = row.icon;
              return (
                <div key={row.label} className="flex items-center gap-3">
                  <Icon size={18} color={GOLD} />
                  <span className="flex-1 text-[14px] text-white">{row.label}</span>
                  <Toggle checked={row.value} onChange={row.set} />
                </div>
              );
            })}
          </div>
        </Card>

        {/* CTA */}
        <div className="flex flex-col items-center gap-2 pt-1">
          <Press
            onClick={launch}
            disabled={launching}
            hapticOnTap={false}
            aria-disabled={!canLaunch || undefined}
            className="!min-h-14 flex h-14 w-full items-center justify-center gap-2 rounded-2xl text-[16px] font-bold"
            style={{
              background: `linear-gradient(135deg, ${GOLD}, oklch(0.72 0.16 70))`,
              color: "black",
              boxShadow: "0 10px 30px oklch(0.82 0.14 85 / 0.35)",
              opacity: launching ? 0.6 : canLaunch ? 1 : 0.45,
            }}
          >
            <CalendarIcon size={18} />
            {launching
              ? t("common.loading")
              : b.mode === "edit"
                ? t("schedule.saveEdit", "Enregistrer les modifications")
                : t("schedule.form.cta", "Programmer mon live")}
          </Press>
          <span className="text-center text-[12px] text-white/50">
            {t("schedule.form.hint", "Tu pourras modifier ton live avant sa diffusion.")}
          </span>
        </div>
      </div>
      </div>



      <AddProductSheet
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdd={(p) => b.addProduct(p)}
        onPickFromShop={() => {
          setShowAdd(false);
          setShowShopPicker(true);
        }}
      />
      <ShopPickerSheet
        open={showShopPicker}
        onClose={() => setShowShopPicker(false)}
        currency={b.currency}
        onConfirm={(items) => {
          for (const it of items) {
            b.addProduct({
              name: it.name,
              image: it.image,
              mode: it.mode,
              startPrice: it.startPrice,
              price: it.price,
              stock: it.stock,
              timerSec: it.timerSec,
            });
          }
          setShowShopPicker(false);
        }}
      />
      <DeliverySetupPromptDialog
        open={deliveryPromptOpen}
        onCancel={() => setDeliveryPromptOpen(false)}
        onConfigure={() => {
          setDeliveryPromptOpen(false);
          setDeliverySettingsOpen(true);
        }}
        onContinue={() => {
          deliverySkippedRef.current = true;
          setDeliveryPromptOpen(false);
          void runLaunch();
        }}
      />
      <SellerDeliverySettingsScreen
        open={deliverySettingsOpen}
        onClose={() => setDeliverySettingsOpen(false)}
      />
    </motion.div>
  );
}

