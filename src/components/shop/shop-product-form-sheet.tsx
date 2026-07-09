import { useEffect, useRef, useState } from "react";
import { Camera, Loader2, X } from "lucide-react";
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
  type ShopProduct,
} from "@/lib/shop-db";
import { currencySymbol } from "@/lib/money";

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
  const [price, setPrice] = useState<number>(0);
  const [stock, setStock] = useState<number>(1);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setDescription(editing.description ?? "");
      setPrice(Number(editing.price));
      setStock(editing.stock);
      void resolveShopImage(editing.image_url).then(setPreview);
      setFile(null);
    } else {
      setName("");
      setDescription("");
      setPrice(currency === "XOF" ? 1000 : 20);
      setStock(1);
      setPreview(null);
      setFile(null);
    }
  }, [open, editing, currency]);

  const pickFile = () => fileRef.current?.click();
  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (!f.type.startsWith("image/")) { toast.error(t("shop.imageOnly", { defaultValue: "Image uniquement" })); return; }
    if (f.size > 5 * 1024 * 1024) { toast.error(t("shop.imageTooBig", { defaultValue: "Image trop lourde" })); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    haptic.selection();
  };

  const canSave = name.trim().length > 0 && price >= 0 && stock >= 0;

  const save = async () => {
    if (!user || !canSave || saving) return;
    setSaving(true);
    try {
      let imagePath: string | null | undefined = undefined;
      if (file) imagePath = await uploadShopProductImage(file, user.id);
      if (editing) {
        await updateShopProduct(editing.id, {
          name: name.trim(),
          description: description.trim() || null,
          price,
          stock,
          ...(imagePath !== undefined ? { image_url: imagePath } : {}),
        });
        toast.success(t("shop.updated", { defaultValue: "Article modifié" }));
        onSaved?.({ ...editing, name, description, price, stock, image_url: imagePath ?? editing.image_url });
      } else {
        const p = await createShopProduct(user.id, {
          name: name.trim(),
          description: description.trim() || null,
          imagePath: imagePath ?? null,
          price,
          currency,
          stock,
        });
        toast.success(t("shop.added", { defaultValue: "Article ajouté" }));
        onSaved?.(p);
      }
      haptic.success();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} heightPercent={90}>
      <div className="flex h-full flex-col overflow-y-auto px-5 pb-6">
        <div className="flex items-center justify-between pt-1 pb-4">
          <h2 className="text-[20px] font-bold">
            {editing ? t("shop.editItem", { defaultValue: "Modifier l'article" }) : t("shop.add", { defaultValue: "Ajouter un article" })}
          </h2>
          <Press onClick={onClose} className="!min-h-10 h-10 w-10 rounded-full" aria-label={t("common.close")}>
            <X size={20} />
          </Press>
        </div>

        {/* Photo */}
        <Press
          onClick={pickFile}
          className="!min-h-40 relative mb-4 h-40 w-full overflow-hidden rounded-2xl p-0"
          style={{ border: "1.5px dashed var(--border)", background: "var(--muted)" }}
          aria-label={t("shop.pickPhoto", { defaultValue: "Ajouter une photo" })}
        >
          {preview ? (
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
              <Camera size={28} />
              <span className="text-[12px] font-medium">{t("shop.pickPhoto", { defaultValue: "Ajouter une photo" })}</span>
            </div>
          )}
        </Press>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />

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
              type="number"
              inputMode="decimal"
              value={price}
              min={0}
              onChange={(e) => setPrice(Math.max(0, Number(e.target.value) || 0))}
              className="h-12 w-full rounded-xl border bg-muted px-4 text-[15px] outline-none"
              style={{ borderColor: "var(--border)" }}
            />
          </Field>
          <Field label={t("shop.stock", { defaultValue: "Stock" })}>
            <input
              type="number"
              inputMode="numeric"
              value={stock}
              min={0}
              onChange={(e) => setStock(Math.max(0, Number(e.target.value) || 0))}
              className="h-12 w-full rounded-xl border bg-muted px-4 text-[15px] outline-none"
              style={{ borderColor: "var(--border)" }}
            />
          </Field>
        </div>

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
