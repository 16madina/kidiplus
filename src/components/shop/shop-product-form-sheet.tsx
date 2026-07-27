import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Loader2, X, Star, Plus } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import { useAuth } from "@/lib/auth-context";
import {
  createShopProduct,
  updateShopProduct,
  uploadShopProductImage,
  resolveShopImage,
  formatShopError,
  MAX_SHOP_IMAGES,
  MIN_SHOP_IMAGES,
  type ShopProduct,
} from "@/lib/shop-db";
import { currencySymbol } from "@/lib/money";
import {
  ProductOptionsFields,
  type ProductOptionsValue,
} from "@/components/product-options-fields";

// Local slot representation while the sheet is open.
// `path` is the storage path once known; `preview` is what we show.
type ImgSlot = { path: string | null; preview: string };

const EMPTY_OPTIONS: ProductOptionsValue = {
  brand: "",
  condition: null,
  colors: [],
  sizes: [],
};

export function ShopProductFormSheet({
  open,
  onClose,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing?: ShopProduct | null;
  onSaved?: (p: ShopProduct) => void;
}) {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const currency = profile?.currency ?? "EUR";
  const symbol = currencySymbol(currency);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceStr, setPriceStr] = useState<string>("");
  const [stockStr, setStockStr] = useState<string>("1");
  const [options, setOptions] = useState<ProductOptionsValue>(EMPTY_OPTIONS);
  const [slots, setSlots] = useState<ImgSlot[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setDescription(editing.description ?? "");
      setPriceStr(String(Number(editing.price)));
      setStockStr(String(editing.stock));
      setOptions({
        brand: editing.brand ?? "",
        condition: editing.condition ?? null,
        colors: editing.colors ?? [],
        sizes: editing.sizes ?? [],
      });
      // Resolve stored paths to signed URLs for preview.
      const paths = editing.images.length > 0 ? editing.images : (editing.image_url ? [editing.image_url] : []);
      setSlots(paths.map((p) => ({ path: p, preview: "" })));
      void Promise.all(paths.map((p) => resolveShopImage(p))).then((urls) => {
        setSlots((prev) => prev.map((s, i) => ({ ...s, preview: urls[i] ?? s.preview })));
      });
    } else {
      setName("");
      setDescription("");
      setPriceStr(currency === "XOF" ? "1000" : "20");
      setStockStr("1");
      setOptions(EMPTY_OPTIONS);
      setSlots([]);
    }
  }, [open, editing, currency]);

  const pickFile = () => {
    if (slots.length >= MAX_SHOP_IMAGES || uploadingIdx !== null) return;
    fileRef.current?.click();
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !user) return;
    if (!f.type.startsWith("image/")) { toast.error(t("shop.imageOnly", { defaultValue: "Image uniquement" })); return; }
    if (f.size > 5 * 1024 * 1024) { toast.error(t("shop.imageTooBig", { defaultValue: "Image trop lourde" })); return; }
    // Optimistic slot with blob preview
    const localUrl = URL.createObjectURL(f);
    const idx = slots.length;
    setSlots((prev) => [...prev, { path: null, preview: localUrl }]);
    setUploadingIdx(idx);
    haptic.selection();
    try {
      const path = await uploadShopProductImage(f, user.id);
      setSlots((prev) => prev.map((s, i) => (i === idx ? { path, preview: localUrl } : s)));
    } catch (err) {
      toast.error(formatShopError(err));
      setSlots((prev) => prev.filter((_, i) => i !== idx));
      try { URL.revokeObjectURL(localUrl); } catch { /* ignore */ }
    } finally {
      setUploadingIdx(null);
    }
  };

  const removeSlot = (idx: number) => {
    haptic.light();
    setSlots((prev) => {
      const s = prev[idx];
      if (s && s.preview.startsWith("blob:")) {
        try { URL.revokeObjectURL(s.preview); } catch { /* ignore */ }
      }
      return prev.filter((_, i) => i !== idx);
    });
  };

  const makeCover = (idx: number) => {
    if (idx === 0) return;
    haptic.selection();
    setSlots((prev) => {
      const next = [...prev];
      const [picked] = next.splice(idx, 1);
      next.unshift(picked);
      return next;
    });
  };

  const priceNum = Math.max(0, Number(priceStr.replace(",", ".")) || 0);
  const stockNum = Math.max(0, Number(stockStr) || 0);
  const uploadedPaths = useMemo(() => slots.map((s) => s.path).filter((p): p is string => !!p), [slots]);
  const enoughImages = uploadedPaths.length >= MIN_SHOP_IMAGES;
  const canSave =
    name.trim().length > 0 &&
    priceNum > 0 &&
    enoughImages &&
    uploadingIdx === null;

  const save = async () => {
    if (!user || !canSave || saving) return;
    setSaving(true);
    try {
      const optionPatch = {
        brand: options.brand.trim() || null,
        condition: options.condition,
        colors: options.colors,
        sizes: options.sizes,
      };
      if (editing) {
        await updateShopProduct(editing.id, {
          name: name.trim(),
          description: description.trim() || null,
          price: priceNum,
          stock: stockNum,
          imagePaths: uploadedPaths,
          ...optionPatch,
        });
        toast.success(t("shop.updated", { defaultValue: "Article modifié" }));
        onSaved?.({
          ...editing,
          name,
          description,
          price: priceNum,
          stock: stockNum,
          image_url: uploadedPaths[0] ?? null,
          images: uploadedPaths,
          brand: optionPatch.brand,
          condition: optionPatch.condition,
          colors: optionPatch.colors,
          sizes: optionPatch.sizes,
        });
      } else {
        const p = await createShopProduct(user.id, {
          name: name.trim(),
          description: description.trim() || null,
          imagePaths: uploadedPaths,
          price: priceNum,
          currency,
          stock: stockNum,
          ...optionPatch,
        });
        toast.success(t("shop.added", { defaultValue: "Article ajouté" }));
        onSaved?.(p);
      }
      haptic.success();
      onClose();
    } catch (err) {
      toast.error(formatShopError(err));
    } finally {
      setSaving(false);
    }
  };

  const showAddSlot = slots.length < MAX_SHOP_IMAGES;

  return (
    <BottomSheet open={open} onClose={onClose} heightPercent={92}>
      <div className="flex flex-col px-5 pb-6">
        <div className="flex items-center justify-between pt-1 pb-4">
          <h2 className="text-[20px] font-bold">
            {editing ? t("shop.editItem", { defaultValue: "Modifier l'article" }) : t("shop.add", { defaultValue: "Ajouter un article" })}
          </h2>
          <Press onClick={onClose} className="!min-h-10 h-10 w-10 rounded-full" aria-label={t("common.close")}>
            <X size={20} />
          </Press>
        </div>

        {/* Photo strip */}
        <div className="mb-2">
          <div className="mb-1.5 flex items-baseline justify-between">
            <span className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              {t("shop.photos", { defaultValue: "Photos" })}
            </span>
            <span className={`text-[11px] font-semibold ${enoughImages ? "text-muted-foreground" : "text-red-500"}`}>
              {slots.length}/{MAX_SHOP_IMAGES} · {t("shop.photosMin", { defaultValue: "min {{n}}", n: MIN_SHOP_IMAGES })}
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {slots.map((s, idx) => (
              <div key={`${s.path ?? "u"}-${idx}`} className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-muted" style={{ border: "1.5px solid var(--border)" }}>
                {s.preview ? (
                  <img
                    src={s.preview}
                    alt=""
                    className="h-full w-full object-cover"
                    onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
                  />
                ) : (
                  <div className="grid h-full w-full place-items-center text-muted-foreground"><Camera size={20} /></div>
                )}
                {idx === 0 ? (
                  <span className="absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase text-white" style={{ background: "oklch(0.62 0.24 20 / 0.95)" }}>
                    {t("shop.cover", { defaultValue: "Couverture" })}
                  </span>
                ) : (
                  <Press
                    onClick={() => makeCover(idx)}
                    className="!min-h-6 absolute left-1 top-1 h-6 rounded-full bg-black/60 px-1.5 text-[10px] font-semibold text-white"
                    aria-label={t("shop.setCover", { defaultValue: "Définir comme couverture" })}
                  >
                    <Star size={10} className="mr-0.5" />
                    {t("shop.setCoverShort", { defaultValue: "Cover" })}
                  </Press>
                )}
                <Press
                  onClick={() => removeSlot(idx)}
                  className="!min-h-6 absolute right-1 top-1 h-6 w-6 rounded-full bg-black/70 p-0 text-white"
                  aria-label={t("common.remove", { defaultValue: "Retirer" })}
                >
                  <X size={12} />
                </Press>
                {uploadingIdx === idx && (
                  <div className="absolute inset-0 grid place-items-center bg-black/40 text-white"><Loader2 size={18} className="animate-spin" /></div>
                )}
              </div>
            ))}
            {showAddSlot && (
              <Press
                onClick={pickFile}
                disabled={uploadingIdx !== null}
                className="!min-h-24 grid h-24 w-24 shrink-0 place-items-center rounded-2xl text-muted-foreground"
                style={{ border: "1.5px dashed var(--border)", background: "var(--muted)" }}
                aria-label={t("shop.pickPhoto", { defaultValue: "Ajouter une photo" })}
              >
                <div className="flex flex-col items-center gap-1">
                  <Plus size={20} />
                  <span className="text-[10px] font-semibold">{t("shop.addPhoto", { defaultValue: "Ajouter" })}</span>
                </div>
              </Press>
            )}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        </div>

        <Field label={t("shop.name", { defaultValue: "Nom" })}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            className="h-12 w-full rounded-xl border bg-muted px-4 text-[15px] outline-none"
            style={{ borderColor: "var(--border)" }}
          />
        </Field>

        <Field label={t("shop.description", { defaultValue: "Description (optionnel)" })}>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 400))}
            rows={3}
            className="w-full resize-none rounded-xl border bg-muted px-4 py-3 text-[15px] outline-none"
            style={{ borderColor: "var(--border)" }}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label={`${t("shop.price", { defaultValue: "Prix" })} (${symbol})`}>
            <input
              type="text"
              inputMode="decimal"
              value={priceStr}
              onChange={(e) => setPriceStr(e.target.value.replace(/[^0-9.,]/g, ""))}
              onBlur={(e) => {
                const n = Math.max(0, Number(e.target.value.replace(",", ".")) || 0);
                setPriceStr(n > 0 ? String(n) : "");
              }}
              placeholder="0"
              className="h-12 w-full rounded-xl border bg-muted px-4 text-[15px] outline-none"
              style={{ borderColor: "var(--border)" }}
            />
          </Field>
          <Field label={t("shop.stock", { defaultValue: "Stock" })}>
            <input
              type="text"
              inputMode="numeric"
              value={stockStr}
              onChange={(e) => setStockStr(e.target.value.replace(/[^0-9]/g, ""))}
              onBlur={(e) => setStockStr(String(Math.max(0, Number(e.target.value) || 0)))}
              placeholder="0"
              className="h-12 w-full rounded-xl border bg-muted px-4 text-[15px] outline-none"
              style={{ borderColor: "var(--border)" }}
            />
          </Field>
        </div>

        <ProductOptionsFields
          value={options}
          onChange={setOptions}
          defaultOpen={Boolean(
            editing &&
              (editing.brand ||
                editing.condition ||
                (editing.colors?.length ?? 0) > 0 ||
                (editing.sizes?.length ?? 0) > 0),
          )}
        />

        <Press
          onClick={save}
          disabled={!canSave || saving}
          className="!min-h-14 mt-6 h-14 w-full rounded-2xl text-[16px] font-bold text-white disabled:opacity-40"
          style={{ background: "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))" }}
        >
          {saving ? <Loader2 size={18} className="animate-spin" /> : t("common.save", { defaultValue: "Enregistrer" })}
        </Press>
      </div>
    </BottomSheet>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mt-3 block">
      <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
