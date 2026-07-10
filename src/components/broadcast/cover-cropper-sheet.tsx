// Full-screen cropper for the live cover image. Uses react-easy-crop for
// pan/zoom, then rasterizes the visible crop to a resized JPEG File so the
// upload stays small.
import { useCallback, useEffect, useState, type ImgHTMLAttributes } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { EASE_IOS } from "@/lib/motion";

const GOLD = "oklch(0.82 0.14 85)";
const GOLD_SOFT = "oklch(0.82 0.14 85 / 0.35)";

// Output size for the exported crop. Live covers render small on cards, so
// 1024×1024 is a comfortable ceiling that keeps the upload under ~200KB.
const OUTPUT_SIZE = 1024;

type Props = {
  open: boolean;
  imageSrc: string | null;
  onClose: () => void;
  onConfirm: (file: File, previewUrl: string) => void;
};

async function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not load image"));
    img.src = src;
  });
}

async function cropToFile(src: string, area: Area): Promise<{ file: File; url: string }> {
  const img = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No canvas context");
  ctx.drawImage(
    img,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE,
  );
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode image"))),
      "image/jpeg",
      0.88,
    );
  });
  const file = new File([blob], `cover-${Date.now()}.jpg`, { type: "image/jpeg" });
  const url = URL.createObjectURL(blob);
  return { file, url };
}

export function CoverCropperSheet({ open, imageSrc, onClose, onConfirm }: Props) {
  const { t } = useTranslation();
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPx, setAreaPx] = useState<Area | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setAreaPx(null);
    }
  }, [open, imageSrc]);

  const onCropComplete = useCallback((_: Area, pixels: Area) => {
    setAreaPx(pixels);
  }, []);

  const confirm = async () => {
    if (!imageSrc || !areaPx || busy) return;
    setBusy(true);
    try {
      const { file, url } = await cropToFile(imageSrc, areaPx);
      onConfirm(file, url);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(
        t("broadcast.cover.cropFailed", "Impossible de recadrer l'image") + ` — ${msg}`,
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence>
      {open && imageSrc && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: EASE_IOS }}
          className="fixed inset-0 z-[100] flex flex-col"
          style={{ background: "#05060a" }}
        >
          {/* Top bar */}
          <div
            className="flex items-center justify-between px-4"
            style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)", paddingBottom: 12 }}
          >
            <Press
              onClick={onClose}
              aria-label={t("common.close")}
              className="!min-h-11 !min-w-11 h-11 w-11 rounded-full p-0 text-white"
              style={{
                backgroundColor: "rgba(10,12,20,0.55)",
                border: `1px solid ${GOLD_SOFT}`,
              }}
            >
              <X size={20} />
            </Press>
            <span className="text-[15px] font-bold text-white">
              {t("broadcast.cover.adjust", "Ajuster la photo")}
            </span>
            <Press
              onClick={confirm}
              disabled={!areaPx || busy}
              aria-label={t("common.confirm", "Confirmer")}
              className="!min-h-11 !min-w-11 h-11 w-11 rounded-full p-0 disabled:opacity-40"
              style={{
                background: `linear-gradient(135deg, ${GOLD}, oklch(0.72 0.16 70))`,
                color: "#0a0a12",
              }}
            >
              <Check size={20} strokeWidth={2.5} />
            </Press>
          </div>

          {/* Crop surface */}
          <div className="relative flex-1">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="rect"
              showGrid
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
              objectFit="contain"
              // Global CSS defaults `img { opacity: 0 }` until an `.is-loaded`
              // class or `data-loaded="true"` attribute is set (see
              // src/styles.css). The cropper never adds those, so the image
              // stays invisible without this attribute — user only sees the
              // grid overlay on a black background.
              mediaProps={{ "data-loaded": "true" } as React.ImgHTMLAttributes<HTMLElement>}
            />
          </div>

          {/* Zoom control */}
          <div
            className="flex flex-col gap-3 px-6"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)", paddingTop: 20 }}
          >
            <div className="flex items-center gap-3">
              <Press
                onClick={() => {
                  setCrop({ x: 0, y: 0 });
                  setZoom(1);
                }}
                aria-label={t("common.reset", "Réinitialiser")}
                className="!min-h-10 !min-w-10 h-10 w-10 rounded-full p-0 text-white"
                style={{
                  backgroundColor: "oklch(0.16 0.04 260 / 0.9)",
                  border: `1px solid ${GOLD_SOFT}`,
                }}
              >
                <RotateCcw size={16} />
              </Press>
              <input
                type="range"
                min={1}
                max={4}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                aria-label={t("broadcast.cover.zoom", "Zoom")}
                className="h-2 flex-1 cursor-pointer appearance-none rounded-full"
                style={{
                  background: `linear-gradient(to right, ${GOLD} 0%, ${GOLD} ${
                    ((zoom - 1) / 3) * 100
                  }%, oklch(0.24 0.04 260) ${((zoom - 1) / 3) * 100}%, oklch(0.24 0.04 260) 100%)`,
                }}
              />
            </div>
            <p className="text-center text-[12px] text-white/60">
              {t(
                "broadcast.cover.hint",
                "Glissez pour recadrer, pincez ou utilisez le curseur pour zoomer",
              )}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
