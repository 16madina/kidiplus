import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  X,
  Image as ImageIcon,
  Gavel,
  Tag,
  Clock,
  ChevronUp,
  ChevronDown,
  Footprints,
} from "lucide-react";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
import { Press } from "@/components/press";
import { EASE_IOS } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { PRODUCT_IMG_POOL } from "@/lib/broadcast-mock";
import { createObjectUrlTracker, isBlobUrl } from "@/lib/object-url";
import { useBroadcast } from "@/lib/broadcast-context";
import type { BProduct, SellMode } from "@/lib/broadcast-context";
import { currencySymbol, bidRulesFor } from "@/lib/money";

const GOLD = "oklch(0.82 0.14 85)";

export function AddProductSheet({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (p: Omit<BProduct, "id">) => void;
}) {
  const { currency } = useBroadcast();
  const symbol = currencySymbol(currency);
  // Sensible defaults per currency (XOF has much larger nominal amounts).
  const defaults = currency === "XOF"
    ? { start: 500, price: 1000, step: 500 }
    : { start: 10, price: 29, step: 1 };
  const priceStep = bidRulesFor(currency).step;

  const [mode, setMode] = useState<SellMode>("auction");
  const [name, setName] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [startPrice, setStartPrice] = useState(defaults.start);
  const [timerSec, setTimerSec] = useState(45);
  const [price, setPrice] = useState(defaults.price);
  const [stock, setStock] = useState(5);
  const [bidIncrement, setBidIncrement] = useState<string>("");
  const [description, setDescription] = useState("");


  const fileInputRef = useRef<HTMLInputElement>(null);
  const pickingSlotRef = useRef<number>(0);
  const urlTrackerRef = useRef(createObjectUrlTracker());

  useEffect(() => {
    const tracker = urlTrackerRef.current;
    return () => tracker.disposeAll();
  }, []);

  const pickImage = (slot: number) => {
    pickingSlotRef.current = slot;
    fileInputRef.current?.click();
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = urlTrackerRef.current.track(URL.createObjectURL(file));
    const slot = pickingSlotRef.current;
    setImages((prev) => {
      const next = [...prev];
      if (isBlobUrl(next[slot])) urlTrackerRef.current.revoke(next[slot]);
      next[slot] = url;
      return next;
    });
    if (slot === 0) setImageFile(file);
    e.target.value = "";
    haptic.selection();
  };

  const removeSlot = (slot: number) => {
    setImages((prev) => {
      const next = [...prev];
      if (isBlobUrl(next[slot])) urlTrackerRef.current.revoke(next[slot]);
      next.splice(slot, 1);
      return next;
    });
    if (slot === 0) setImageFile(null);
    haptic.selection();
  };

  const reset = () => {
    setMode("auction");
    setName("");
    setImages([]);
    setImageFile(null);
    setStartPrice(defaults.start);
    setTimerSec(45);
    setPrice(defaults.price);
    setStock(5);
    setBidIncrement("");
    setDescription("");
  };

  const canSave = name.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    haptic.medium();
    onAdd({
      name: name.trim(),
      image: images[0] || PRODUCT_IMG_POOL[0],
      imageFile: imageFile ?? undefined,
      mode,
      startPrice,
      timerSec,
      price,
      stock,
    });
    reset();
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} heightPercent={90}>
      <div className="flex h-full flex-col overflow-y-auto px-5 pb-6">
        {/* Header */}
        <div className="flex items-center justify-between pt-1 pb-4">
          <h2 className="text-[22px] font-bold text-foreground">Ajouter un produit</h2>
          <Press
            onClick={onClose}
            className="!min-h-10 !min-w-10 h-10 w-10 rounded-full p-0 text-foreground"
            aria-label="Fermer"
          >
            <X size={22} />
          </Press>
        </div>

        {/* 3 photo slots */}
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((slot) => {
            const src = images[slot];
            return (
              <Press
                key={slot}
                onClick={() => (src ? removeSlot(slot) : pickImage(slot))}
                hapticOnTap={false}
                className="!min-h-28 relative flex h-28 flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl p-0"
                style={{
                  border: src ? "1px solid var(--border)" : "1.5px dashed var(--border)",
                  background: "var(--muted)",
                }}
                aria-label={src ? "Retirer la photo" : "Ajouter une photo"}
              >
                {src ? (
                  <motion.img
                    key={src}
                    src={src}
                    alt=""
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.2, ease: EASE_IOS }}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <>
                    <ImageIcon size={26} className="text-muted-foreground" strokeWidth={1.6} />
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Ajouter une photo
                    </span>
                  </>
                )}
              </Press>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">Ajoute jusqu'à 3 photos</p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFile}
        />

        {/* Name */}
        <label className="mt-5 text-[14px] font-semibold text-foreground">Nom du produit</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex : Nike Dunk Low"
          className="mt-2 h-12 rounded-xl border bg-muted px-4 text-[15px] outline-none placeholder:text-muted-foreground/70"
          style={{ borderColor: "var(--border)" }}
        />

        {/* Mode toggle */}
        <div className="mt-5 text-[14px] font-semibold text-foreground">Mode de vente</div>
        <div className="relative mt-2 flex rounded-full bg-muted p-1">
          {(["auction", "fixed"] as SellMode[]).map((m) => {
            const active = m === mode;
            return (
              <Press
                key={m}
                onClick={() => {
                  haptic.selection();
                  setMode(m);
                }}
                type="button"
                className="relative flex h-11 flex-1 items-center justify-center gap-2 rounded-full text-[14px] font-semibold"
                style={{
                  color: active ? "white" : "var(--foreground)",
                  transition: "color 0.2s",
                }}
              >
                {active && (
                  <motion.span
                    layoutId="mode-pill"
                    className="absolute inset-0 rounded-full"
                    style={{ background: "oklch(0.18 0.04 260)" }}
                    transition={{ duration: 0.2, ease: EASE_IOS }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  {m === "auction" ? (
                    <Gavel size={16} style={{ color: GOLD }} />
                  ) : (
                    <Tag size={16} style={{ color: active ? GOLD : "var(--muted-foreground)" }} />
                  )}
                  <span>{m === "auction" ? "Enchère" : "Prix fixe"}</span>
                </span>
              </Press>
            );
          })}
        </div>

        {/* Mode-specific fields */}
        {mode === "auction" ? (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <NumberField
                label={`Prix de départ (${symbol})`}
                value={startPrice}
                min={1}
                step={priceStep}
                onChange={setStartPrice}
                icon={<Tag size={18} style={{ color: GOLD }} />}
              />
              <NumberField
                label="Durée (s)"
                value={timerSec}
                min={10}
                step={5}
                onChange={setTimerSec}
                icon={<Clock size={18} style={{ color: GOLD }} />}
              />
            </div>

            {/* Bid increment */}
            <label className="mt-5 text-[14px] font-semibold text-foreground">
              Incrément par enchère (optionnel)
            </label>
            <div
              className="mt-2 flex h-12 items-center gap-3 rounded-xl border bg-muted px-4"
              style={{ borderColor: "var(--border)" }}
            >
              <Footprints size={18} style={{ color: GOLD }} />
              <input
                type="number"
                inputMode="numeric"
                value={bidIncrement}
                onChange={(e) => setBidIncrement(e.target.value)}
                placeholder={currency === "XOF" ? "ex : 500" : "ex : 1"}
                className="flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground/70"
              />
              <span className="text-[15px] text-muted-foreground">{symbol}</span>
            </div>
          </>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <NumberField
              label={`Prix (${symbol})`}
              value={price}
              min={1}
              step={priceStep}
              onChange={setPrice}
              icon={<Tag size={18} style={{ color: GOLD }} />}
            />
            <NumberField
              label="Stock"
              value={stock}
              min={1}
              onChange={setStock}
            />
          </div>
        )}

        {/* Description */}
        <label className="mt-5 text-[14px] font-semibold text-foreground">
          Description (optionnel)
        </label>
        <div
          className="relative mt-2 rounded-xl border bg-muted"
          style={{ borderColor: "var(--border)" }}
        >
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 250))}
            placeholder="Décris brièvement ton produit..."
            rows={3}
            className="h-24 w-full resize-none rounded-xl bg-transparent px-4 py-3 text-[15px] outline-none placeholder:text-muted-foreground/70"
          />
          <span className="pointer-events-none absolute bottom-2 right-3 text-[11px] text-muted-foreground">
            {description.length}/250
          </span>
        </div>

        <Press
          onClick={save}
          disabled={!canSave}
          hapticOnTap={false}
          className="!min-h-14 mt-6 h-14 w-full rounded-2xl text-[16px] font-bold disabled:opacity-40"
          style={{
            background: `linear-gradient(135deg, ${GOLD}, oklch(0.72 0.16 70))`,
            color: "#0a0a12",
            boxShadow: "0 10px 30px oklch(0.82 0.14 85 / 0.35)",
          }}
        >
          Ajouter au live
        </Press>
      </div>
    </BottomSheet>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  step = 1,
  icon,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  step?: number;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col rounded-xl border bg-muted px-3 py-2"
      style={{ borderColor: "var(--border)" }}
    >
      <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        {icon}
        <input
          type="number"
          value={value}
          min={min}
          step={step}
          onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))}
          className="flex-1 bg-transparent text-[20px] font-semibold text-foreground outline-none"
          inputMode="numeric"
        />
        <div className="flex flex-col text-muted-foreground">
          <button
            type="button"
            onClick={() => onChange(value + step)}
            className="p-0.5"
            aria-label="Augmenter"
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            onClick={() => onChange(Math.max(min, value - step))}
            className="p-0.5"
            aria-label="Diminuer"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
