import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X, Image as ImageIcon } from "lucide-react";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
import { Press } from "@/components/press";
import { EASE_IOS } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { PRODUCT_IMG_POOL } from "@/lib/broadcast-mock";
import { createObjectUrlTracker, isBlobUrl } from "@/lib/object-url";
import type { BProduct, SellMode } from "@/lib/broadcast-context";

export function AddProductSheet({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (p: Omit<BProduct, "id">) => void;
}) {
  const [mode, setMode] = useState<SellMode>("auction");
  const [name, setName] = useState("");
  const [image, setImage] = useState<string>(PRODUCT_IMG_POOL[0]);
  const [startPrice, setStartPrice] = useState(10);
  const [timerSec, setTimerSec] = useState(45);
  const [price, setPrice] = useState(29);
  const [stock, setStock] = useState(5);

  const reset = () => {
    setMode("auction");
    setName("");
    setImage(PRODUCT_IMG_POOL[0]);
    setStartPrice(10);
    setTimerSec(45);
    setPrice(29);
    setStock(5);
  };

  const canSave = name.trim().length > 0;

  const save = () => {
    if (!canSave) return;
    haptic.medium();
    onAdd({
      name: name.trim(),
      image,
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
    <BottomSheet open={open} onClose={onClose} heightPercent={78}>
      <div className="flex h-full flex-col px-5 pb-4">
        <div className="flex items-center justify-between pb-2">
          <h2 className="text-[18px] font-bold">Ajouter un produit</h2>
          <Press
            onClick={onClose}
            className="!min-h-11 !min-w-11 rounded-full"
            aria-label="Fermer"
          >
            <X size={22} />
          </Press>
        </div>

        {/* Image picker */}
        <div className="flex gap-2 overflow-x-auto pb-3">
          {PRODUCT_IMG_POOL.map((src) => {
            const active = src === image;
            return (
              <Press
                key={src}
                onClick={() => setImage(src)}
                className="!min-h-16 relative h-16 w-16 shrink-0 overflow-hidden rounded-xl p-0"
                style={{
                  outline: active ? "2px solid var(--accent)" : "none",
                  outlineOffset: 2,
                }}
              >
                <img src={src} alt="" className="h-full w-full object-cover" />
              </Press>
            );
          })}
          <Press
            className="!min-h-16 grid h-16 w-16 shrink-0 place-items-center rounded-xl border border-dashed"
            style={{ borderColor: "var(--border)" }}
            aria-label="Importer une image"
          >
            <ImageIcon size={20} className="text-muted-foreground" />
          </Press>
        </div>

        {/* Name */}
        <label className="text-[12px] font-semibold text-muted-foreground">
          Nom du produit
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="ex : Nike Dunk Low"
          className="mt-1 h-11 rounded-xl bg-muted px-3 text-[15px] outline-none"
        />

        {/* Mode toggle */}
        <div className="mt-4 flex rounded-full bg-muted p-1">
          {(["auction", "fixed"] as SellMode[]).map((m) => {
            const active = m === mode;
            return (
              <Press
                key={m}
                onClick={() => {
                  haptic.selection();
                  setMode(m);
                }}
                className="relative h-9 flex-1 rounded-full text-[13px] font-semibold"
                style={{ color: active ? "white" : "var(--foreground)" }}
              >
                {active && (
                  <motion.span
                    layoutId="mode-pill"
                    className="absolute inset-0 -z-10 rounded-full bg-foreground"
                    transition={{ duration: 0.2, ease: EASE_IOS }}
                  />
                )}
                {m === "auction" ? "Enchère" : "Prix fixe"}
              </Press>
            );
          })}
        </div>

        {/* Mode-specific fields */}
        {mode === "auction" ? (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <NumberField
              label="Prix de départ (€)"
              value={startPrice}
              min={1}
              onChange={setStartPrice}
            />
            <NumberField
              label="Durée (s)"
              value={timerSec}
              min={10}
              step={5}
              onChange={setTimerSec}
            />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <NumberField
              label="Prix (€)"
              value={price}
              min={1}
              onChange={setPrice}
            />
            <NumberField
              label="Stock"
              value={stock}
              min={1}
              onChange={setStock}
            />
          </div>
        )}

        <div className="flex-1" />

        <Press
          onClick={save}
          disabled={!canSave}
          hapticOnTap={false}
          className="!min-h-12 mt-4 h-12 w-full rounded-2xl text-[15px] font-semibold text-white disabled:opacity-40"
          style={{ backgroundColor: "var(--accent)" }}
        >
          Ajouter au live
        </Press>
      </div>
    </BottomSheet>
  );
}

function NumberField({
  label, value, onChange, min = 0, step = 1,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <label className="flex flex-col">
      <span className="text-[12px] font-semibold text-muted-foreground">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        step={step}
        onChange={(e) => onChange(Math.max(min, Number(e.target.value) || 0))}
        className="mt-1 h-11 rounded-xl bg-muted px-3 text-[15px] outline-none"
        inputMode="numeric"
      />
    </label>
  );
}
