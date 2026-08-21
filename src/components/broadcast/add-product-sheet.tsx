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
  ChevronRight,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
import { Press } from "@/components/press";
import { EASE_IOS } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { PRODUCT_IMG_POOL } from "@/lib/broadcast-mock";
import { createObjectUrlTracker, isBlobUrl } from "@/lib/object-url";
import { useOptionalBroadcast } from "@/lib/broadcast-context";
import type { BProduct, SellMode } from "@/lib/broadcast-context";
import { currencySymbol, bidRulesFor, normalizeCurrency, type Currency } from "@/lib/money";
import {
  PRESET_COLORS,
  PRESET_SIZES,
  PRODUCT_CONDITIONS,
  conditionLabel,
  type ProductCondition,
} from "@/lib/live-product-options";

const GOLD = "oklch(0.82 0.14 85)";

export function AddProductSheet({
  open,
  onClose,
  onAdd,
  onPickFromShop,
  currency: currencyProp,
  pickFromShopLabel,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (p: Omit<BProduct, "id">) => void;
  onPickFromShop?: () => void;
  /** Required when used outside BroadcastProvider (moderator dock). */
  currency?: string;
  pickFromShopLabel?: string;
}) {
  const { t } = useTranslation();
  const broadcast = useOptionalBroadcast();
  const currency: Currency = normalizeCurrency(
    currencyProp ?? broadcast?.currency ?? "EUR",
  );
  const symbol = currencySymbol(currency);
  // Sensible defaults per currency (XOF has much larger nominal amounts).
  const defaults = currency === "XOF"
    ? { start: 500, price: 1000, step: 500 }
    : { start: 1, price: 29, step: 1 };
  const priceStep = bidRulesFor(currency).step;

  const [mode, setMode] = useState<SellMode>("auction");
  const [name, setName] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [imageFiles, setImageFiles] = useState<(File | null)[]>([null, null, null]);
  const [startPrice, setStartPrice] = useState(defaults.start);
  const [timerSec, setTimerSec] = useState(45);
  const [price, setPrice] = useState(defaults.price);
  const [stock, setStock] = useState(1);
  const [bidIncrement, setBidIncrement] = useState<string>("");
  const [description, setDescription] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [brand, setBrand] = useState("");
  const [condition, setCondition] = useState<ProductCondition | null>(null);
  const [colors, setColors] = useState<string[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [customColor, setCustomColor] = useState("");
  const [customSize, setCustomSize] = useState("");

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
    setImageFiles((prev) => {
      const next = [...prev];
      next[slot] = file;
      return next;
    });
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
    setImageFiles((prev) => {
      const next = [...prev];
      next.splice(slot, 1);
      while (next.length < 3) next.push(null);
      return next.slice(0, 3);
    });
    haptic.selection();
  };

  const toggleTag = (list: string[], value: string, setList: (v: string[]) => void) => {
    haptic.selection();
    setList(
      list.includes(value) ? list.filter((x) => x !== value) : [...list, value],
    );
  };

  const addCustom = (
    raw: string,
    list: string[],
    setList: (v: string[]) => void,
    clear: () => void,
  ) => {
    const v = raw.trim();
    if (!v) return;
    if (!list.includes(v)) setList([...list, v]);
    clear();
    haptic.selection();
  };

  const reset = () => {
    setMode("auction");
    setName("");
    setImages([]);
    setImageFiles([null, null, null]);
    setStartPrice(defaults.start);
    setTimerSec(45);
    setPrice(defaults.price);
    setStock(1);
    setBidIncrement("");
    setDescription("");
    setOptionsOpen(false);
    setBrand("");
    setCondition(null);
    setColors([]);
    setSizes([]);
    setCustomColor("");
    setCustomSize("");
  };

  const canSave = name.trim().length > 0;

  const save = () => {
    if (!canSave) {
      // Android WebViews sometimes swallow the last IME keystroke, so instead of
      // a dead disabled button we point the user at the missing field.
      haptic.error();
      setNameError(true);
      nameInputRef.current?.focus();
      nameInputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    haptic.medium();
    const inc = Number(bidIncrement);
    const extraImages: string[] = [];
    const extraImageFiles: (File | null)[] = [];
    for (let i = 1; i < 3; i++) {
      if (!images[i] && !imageFiles[i]) continue;
      // Keep slots aligned so upload can prefer File over blob/remote URL.
      extraImages.push(images[i] || "");
      extraImageFiles.push(imageFiles[i] ?? null);
    }
    onAdd({
      name: name.trim(),
      image: images[0] || PRODUCT_IMG_POOL[0],
      imageFile: imageFiles[0] ?? undefined,
      mode,
      startPrice: Math.max(1, startPrice || defaults.start),
      timerSec: Math.max(10, timerSec || 45),
      price: Math.max(1, price || defaults.price),
      stock: Math.max(1, stock || 1),
      description: description.trim() || undefined,
      bidIncrement:
        Number.isFinite(inc) && inc > 0 ? inc : null,
      brand: brand.trim() || undefined,
      condition,
      colors,
      sizes,
      extraImages: extraImages.length ? extraImages : undefined,
      extraImageFiles: extraImageFiles.length ? extraImageFiles : undefined,
    });
    reset();
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} heightPercent={90}>
      <div className="flex h-full flex-col overflow-y-auto px-5 pb-6">
        {/* Header */}
        <div className="flex items-center justify-between pt-1 pb-4">
          <h2 className="text-[22px] font-bold text-foreground">
            {t("broadcast.setup.productSheet.title", "Ajouter un produit")}
          </h2>
          <Press
            onClick={onClose}
            className="!min-h-10 !min-w-10 h-10 w-10 rounded-full p-0 text-foreground"
            aria-label="Fermer"
          >
            <X size={22} />
          </Press>
        </div>

        {onPickFromShop && (
          <Press
            onClick={onPickFromShop}
            className="!min-h-14 mb-4 h-14 w-full rounded-2xl text-[14px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, oklch(0.5 0.18 260), oklch(0.42 0.14 265))" }}
          >
            {pickFromShopLabel ?? "📦 Choisir depuis ma boutique"}
          </Press>
        )}

        {/* 3 photo slots — first = cover */}
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
                      {slot === 0
                        ? t("productOptions.coverPhoto", "Couverture")
                        : t("productOptions.addPhoto", "Ajouter")}
                    </span>
                  </>
                )}
              </Press>
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          {t("productOptions.photosHint", "Jusqu’à 3 photos — la 1ʳᵉ est la couverture")}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFile}
        />

        {/* Name */}
        <label className="mt-5 text-[14px] font-semibold text-foreground">
          {t("broadcast.setup.productSheet.name", "Nom du produit")}
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("broadcast.setup.productSheet.namePlaceholder", "ex : Nike Dunk Low")}
          className="mt-2 h-12 rounded-xl border bg-muted px-4 text-[15px] outline-none placeholder:text-muted-foreground/70"
          style={{ borderColor: "var(--border)" }}
        />

        {/* Mode toggle */}
        <div className="mt-5 text-[14px] font-semibold text-foreground">
          {t("broadcast.setup.productSheet.type", "Mode de vente")}
        </div>
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
                  <span>
                    {m === "auction"
                      ? t("broadcast.setup.productSheet.auction", "Enchère")
                      : t("broadcast.setup.productSheet.fixedPrice", "Prix fixe")}
                  </span>
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
                label={`${t("broadcast.setup.productSheet.startingPrice", "Prix de départ")} (${symbol})`}
                value={startPrice}
                min={1}
                step={priceStep}
                onChange={setStartPrice}
                icon={<Tag size={18} style={{ color: GOLD }} />}
              />
              <NumberField
                label={t("productOptions.duration", "Durée (s)")}
                value={timerSec}
                min={10}
                step={5}
                onChange={setTimerSec}
                icon={<Clock size={18} style={{ color: GOLD }} />}
              />
            </div>
            <div className="mt-3">
              <NumberField
                label={t("productOptions.quantity", "Quantité")}
                value={stock}
                min={1}
                onChange={setStock}
              />
            </div>

            <label className="mt-5 text-[14px] font-semibold text-foreground">
              {t("productOptions.bidIncrement", "Incrément par enchère (optionnel)")}
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
              label={`${t("broadcast.setup.productSheet.price", "Prix")} (${symbol})`}
              value={price}
              min={1}
              step={priceStep}
              onChange={setPrice}
              icon={<Tag size={18} style={{ color: GOLD }} />}
            />
            <NumberField
              label={t("broadcast.setup.productSheet.stock", "Stock")}
              value={stock}
              min={1}
              onChange={setStock}
            />
          </div>
        )}

        {/* Description */}
        <label className="mt-5 text-[14px] font-semibold text-foreground">
          {t("productOptions.description", "Description (optionnel)")}
        </label>
        <div
          className="relative mt-2 rounded-xl border bg-muted"
          style={{ borderColor: "var(--border)" }}
        >
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 250))}
            placeholder={t("productOptions.descriptionPlaceholder", "Décris brièvement ton produit...")}
            rows={3}
            className="h-24 w-full resize-none rounded-xl bg-transparent px-4 py-3 text-[15px] outline-none placeholder:text-muted-foreground/70"
          />
          <span className="pointer-events-none absolute bottom-2 right-3 text-[11px] text-muted-foreground">
            {description.length}/250
          </span>
        </div>

        {/* Collapsible Options */}
        <button
          type="button"
          onClick={() => {
            haptic.selection();
            setOptionsOpen((v) => !v);
          }}
          className="mt-5 flex w-full items-center justify-between rounded-2xl border bg-muted/60 px-4 py-3 text-left"
          style={{ borderColor: "var(--border)" }}
        >
          <div>
            <p className="text-[14px] font-semibold text-foreground">
              {t("productOptions.title", "Options")}
            </p>
            <p className="mt-0.5 text-[12px] text-muted-foreground">
              {t("productOptions.subtitle", "Marque, état, couleurs, tailles")}
            </p>
          </div>
          <ChevronRight
            size={18}
            className="text-muted-foreground transition-transform"
            style={{ transform: optionsOpen ? "rotate(90deg)" : undefined }}
          />
        </button>

        {optionsOpen && (
          <div className="mt-3 space-y-4 rounded-2xl border px-4 py-4" style={{ borderColor: "var(--border)" }}>
            <div>
              <label className="text-[13px] font-semibold text-foreground">
                {t("productOptions.brand", "Marque")}
              </label>
              <input
                value={brand}
                onChange={(e) => setBrand(e.target.value.slice(0, 60))}
                placeholder={t("productOptions.brandPlaceholder", "ex : Nike, Zara…")}
                className="mt-1.5 h-11 w-full rounded-xl border bg-muted px-3 text-[14px] outline-none"
                style={{ borderColor: "var(--border)" }}
              />
            </div>

            <div>
              <p className="text-[13px] font-semibold text-foreground">
                {t("productOptions.conditionLabel", "État")}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {PRODUCT_CONDITIONS.map((c) => {
                  const active = condition === c;
                  return (
                    <Press
                      key={c}
                      onClick={() => {
                        haptic.selection();
                        setCondition(active ? null : c);
                      }}
                      className="!min-h-9 rounded-full px-3 text-[12px] font-semibold"
                      style={{
                        background: active ? "oklch(0.18 0.04 260)" : "var(--muted)",
                        color: active ? "white" : "var(--foreground)",
                        border: active ? "none" : "1px solid var(--border)",
                      }}
                    >
                      {conditionLabel(c, t)}
                    </Press>
                  );
                })}
              </div>
            </div>

            <TagPicker
              label={t("productOptions.colors", "Couleurs")}
              presets={[...PRESET_COLORS]}
              selected={colors}
              onToggle={(v) => toggleTag(colors, v, setColors)}
              custom={customColor}
              onCustomChange={setCustomColor}
              onAddCustom={() =>
                addCustom(customColor, colors, setColors, () => setCustomColor(""))
              }
              customPlaceholder={t("productOptions.customColor", "Autre couleur")}
            />

            <TagPicker
              label={t("productOptions.sizes", "Tailles")}
              presets={[...PRESET_SIZES]}
              selected={sizes}
              onToggle={(v) => toggleTag(sizes, v, setSizes)}
              custom={customSize}
              onCustomChange={setCustomSize}
              onAddCustom={() =>
                addCustom(customSize, sizes, setSizes, () => setCustomSize(""))
              }
              customPlaceholder={t("productOptions.customSize", "Autre taille")}
            />
          </div>
        )}

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
          {t("broadcast.setup.productSheet.confirm", "Ajouter au live")}
        </Press>
      </div>
    </BottomSheet>
  );
}

function TagPicker({
  label,
  presets,
  selected,
  onToggle,
  custom,
  onCustomChange,
  onAddCustom,
  customPlaceholder,
}: {
  label: string;
  presets: string[];
  selected: string[];
  onToggle: (v: string) => void;
  custom: string;
  onCustomChange: (v: string) => void;
  onAddCustom: () => void;
  customPlaceholder: string;
}) {
  return (
    <div>
      <p className="text-[13px] font-semibold text-foreground">{label}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {presets.map((p) => {
          const active = selected.includes(p);
          return (
            <Press
              key={p}
              onClick={() => onToggle(p)}
              className="!min-h-9 rounded-full px-3 text-[12px] font-semibold"
              style={{
                background: active ? "oklch(0.18 0.04 260)" : "var(--muted)",
                color: active ? "white" : "var(--foreground)",
                border: active ? "none" : "1px solid var(--border)",
              }}
            >
              {p}
            </Press>
          );
        })}
        {selected
          .filter((s) => !presets.includes(s))
          .map((s) => (
            <Press
              key={s}
              onClick={() => onToggle(s)}
              className="!min-h-9 rounded-full px-3 text-[12px] font-semibold text-white"
              style={{ background: "oklch(0.18 0.04 260)" }}
            >
              {s}
            </Press>
          ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={custom}
          onChange={(e) => onCustomChange(e.target.value.slice(0, 24))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAddCustom();
            }
          }}
          placeholder={customPlaceholder}
          className="h-10 flex-1 rounded-xl border bg-muted px-3 text-[13px] outline-none"
          style={{ borderColor: "var(--border)" }}
        />
        <Press
          onClick={onAddCustom}
          className="!min-h-10 rounded-xl px-3 text-[13px] font-semibold"
          style={{ background: "var(--muted)", border: "1px solid var(--border)" }}
        >
          +
        </Press>
      </div>
    </div>
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
  // Local draft so the user can clear the field while typing. Clamping to
  // `min` on every keystroke made it impossible to erase the last digit
  // (empty → 0 → Math.max(min, 0) snapped back to min).
  const [text, setText] = useState(String(value));
  const focusedRef = useRef(false);

  useEffect(() => {
    if (focusedRef.current) return;
    setText(String(value));
  }, [value]);

  const commit = (raw: string) => {
    const n = Number(raw);
    const next = Number.isFinite(n) ? Math.max(min, n) : min;
    onChange(next);
    setText(String(next));
  };

  return (
    <div
      className="flex flex-col rounded-xl border bg-muted px-3 py-2"
      style={{ borderColor: "var(--border)" }}
    >
      <span className="text-[12px] font-medium text-muted-foreground">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        {icon}
        <input
          type="text"
          inputMode="decimal"
          value={text}
          min={min}
          step={step}
          onFocus={() => {
            focusedRef.current = true;
          }}
          onChange={(e) => {
            const raw = e.target.value.replace(/[^\d.,]/g, "").replace(",", ".");
            setText(raw);
            if (raw === "" || raw === ".") return;
            const n = Number(raw);
            if (Number.isFinite(n)) onChange(n);
          }}
          onBlur={() => {
            focusedRef.current = false;
            commit(text);
          }}
          className="flex-1 bg-transparent text-[20px] font-semibold text-foreground outline-none"
        />
        <div className="flex flex-col text-muted-foreground">
          <button
            type="button"
            onClick={() => {
              const next = Math.max(min, (Number.isFinite(value) ? value : min) + step);
              onChange(next);
              setText(String(next));
            }}
            className="p-0.5"
            aria-label="Augmenter"
          >
            <ChevronUp size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              const next = Math.max(min, (Number.isFinite(value) ? value : min) - step);
              onChange(next);
              setText(String(next));
            }}
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
