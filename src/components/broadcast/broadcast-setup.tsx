import { useContext, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X, RefreshCw, Plus, Trash2, Image as ImageIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
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
import { Calendar as CalendarIcon } from "lucide-react";
import { ScheduleLiveSetup } from "./schedule-live-setup";



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

  const isSchedule = b.mode === "schedule" || b.mode === "edit";
  const scheduleValid = !isSchedule || (b.scheduledAt && new Date(b.scheduledAt).getTime() > Date.now() + 60_000);
  const canLaunch = b.title.trim().length > 0 && b.products.length > 0 && scheduleValid;
  const [launching, setLaunching] = useState(false);

  // Datetime picker bounds — now+15min to now+30d, formatted for datetime-local.
  const toLocalInput = (d: Date) => {
    const pad = (n: number) => n.toString().padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const minDt = toLocalInput(new Date(Date.now() + 15 * 60 * 1000));
  const maxDt = toLocalInput(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000));
  const currentDtValue = b.scheduledAt ? toLocalInput(new Date(b.scheduledAt)) : "";

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
      className="relative h-full w-full overflow-hidden bg-black"
    >
      {b.mode === "now" ? (
        <BroadcastVideo
          key={previewRetryKey}
          facing={facing}
          enabled={true}
          fallbackImage={b.cover}
          onRequestRetry={() => setPreviewRetryKey((k) => k + 1)}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(120% 80% at 50% 0%, oklch(0.19 0.05 260) 0%, oklch(0.11 0.03 260) 60%, #000 100%)",
          }}
        />
      )}


      {/* Top bar */}
      <div
        className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-3 pt-safe"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 2px)" }}
      >
        <Press
          onClick={onExit}
          aria-label={t("common.close")}
          className="!min-h-11 !min-w-11 rounded-full text-white"
          style={{
            backgroundColor: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          <X size={22} />
        </Press>
        {b.mode === "now" ? (
          <Press
            onClick={() => {
              haptic.selection();
              setFacing((f) => (f === "user" ? "environment" : "user"));
            }}
            aria-label={t("broadcast.live.flipCam")}
            className="!min-h-11 !min-w-11 rounded-full text-white"
            style={{
              backgroundColor: "rgba(0,0,0,0.4)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          >
            <RefreshCw size={20} />
          </Press>
        ) : (
          <div className="text-[13px] font-bold text-white/80">
            {b.mode === "edit"
              ? t("schedule.editingTitle", "Modifier le live")
              : t("schedule.planningTitle", "Programmer un live")}
          </div>
        )}
      </div>


      {/* Form overlay */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 px-4 pt-8 pb-safe"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)",
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 30%, rgba(0,0,0,0.85) 100%)",
        }}
      >
        {/* Cover + title row */}
        <div className="flex items-start gap-3">
          <Press
            onClick={pickCover}
            className="!min-h-16 h-16 w-16 shrink-0 overflow-hidden rounded-xl p-0"
            style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
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
              <div className="grid h-full w-full place-items-center text-white/80">
                <ImageIcon size={22} />
              </div>
            )}
          </Press>
          <input
            value={b.title}
            onChange={(e) => b.setTitle(e.target.value)}
            placeholder={t("broadcast.setup.titlePlaceholder")}
            maxLength={80}
            className="h-16 flex-1 rounded-xl px-3 text-[15px] font-medium text-white placeholder:text-white/60 outline-none"
            style={{
              backgroundColor: "rgba(255,255,255,0.14)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          />
          {/* Hidden native file input — click() is dispatched from pickCover
              inside a genuine user gesture so the OS dialog opens. */}
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
                className="!min-h-9 shrink-0 rounded-full px-3.5 text-[12px] font-semibold"
                style={{
                  color: active ? "black" : "white",
                  backgroundColor: active ? "white" : "rgba(255,255,255,0.16)",
                }}
              >
                {label}
              </Press>
            );
          })}
        </div>

        {/* Products row */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-white/80">
              {t("broadcast.setup.products")} ({b.products.length})
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
                className="relative flex w-24 shrink-0 flex-col gap-1"
              >
                <div className="relative h-24 w-24 overflow-hidden rounded-xl">
                  <img src={p.image} alt="" className="h-full w-full object-cover" />
                  <span
                    className="absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white"
                    style={{
                      backgroundColor:
                        p.mode === "auction"
                          ? "oklch(0.62 0.24 20)"
                          : "oklch(0.55 0.18 260)",
                    }}
                  >
                    {p.mode === "auction"
                      ? t("broadcast.setup.productSheet.auction").toUpperCase()
                      : t("broadcast.setup.productSheet.fixedPrice").toUpperCase()}
                  </span>
                  <Press
                    onClick={() => b.removeProduct(p.id)}
                    aria-label={t("common.remove")}
                    className="!min-h-7 !min-w-7 absolute right-1 top-1 h-7 w-7 rounded-full p-0 text-white"
                    style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
                  >
                    <Trash2 size={12} />
                  </Press>
                </div>
                <span className="truncate text-[11px] font-medium text-white">
                  {p.name}
                </span>
                <span className="text-[10px] text-white/70">
                  {p.mode === "auction"
                    ? `dès ${formatMoney(p.startPrice, b.currency, "fr")}`
                    : `${formatMoney(p.price, b.currency, "fr")} · stock ${p.stock}`}
                </span>
              </motion.div>
            ))}
            <Press
              onClick={() => setShowAdd(true)}
              className="!min-h-24 flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-white"
              style={{ borderColor: "rgba(255,255,255,0.5)" }}
            >
              <Plus size={20} />
              <span className="text-[10px] font-semibold">{t("common.add")}</span>
            </Press>
          </motion.div>
        </div>

        {/* Schedule datetime (schedule + edit modes) */}
        {isSchedule && (
          <label
            className="flex items-center gap-3 rounded-2xl px-3 py-2.5"
            style={{
              backgroundColor: "rgba(255,255,255,0.10)",
              border: "1px solid oklch(0.82 0.14 85 / 0.4)",
            }}
          >
            <CalendarIcon size={18} color="oklch(0.82 0.14 85)" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-[11px] font-semibold text-white/70">
                {t("schedule.datetimeLabel", "Date et heure du live")}
              </span>
              <input
                type="datetime-local"
                min={minDt}
                max={maxDt}
                value={currentDtValue}
                onChange={(e) => b.setScheduledAt(e.target.value ? new Date(e.target.value).toISOString() : null)}
                className="bg-transparent text-[14px] font-medium text-white outline-none"
                style={{ colorScheme: "dark" }}
                lang={"fr-FR"}
              />
            </div>
          </label>
        )}

        {/* Launch */}
        <Press
          onClick={launch}
          disabled={!canLaunch || launching}
          hapticOnTap={false}
          className="!min-h-14 mt-1 h-14 w-full rounded-2xl text-[16px] font-bold text-white disabled:opacity-40"
          style={{
            background:
              b.mode === "now"
                ? "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))"
                : "linear-gradient(135deg, oklch(0.82 0.14 85), oklch(0.72 0.16 70))",
            boxShadow:
              b.mode === "now"
                ? "0 8px 24px rgba(255, 40, 60, 0.35)"
                : "0 8px 24px oklch(0.82 0.14 85 / 0.35)",
            color: b.mode === "now" ? "white" : "black",
          }}
        >
          {launching ? t("common.loading") : t("broadcast.setup.start")}

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
