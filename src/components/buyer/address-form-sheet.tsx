// AddressFormSheet — currency-aware form to create/edit a delivery address.
//
// Compact form for XOF markets (name + phone + city + commune + repère).
// Full postal form for EUR/CAD (adds street address, country).

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
import { Press } from "@/components/press";
import { haptic } from "@/lib/haptics";
import { addressFieldsFor } from "@/lib/delivery";
import {
  createAddress,
  updateAddress,
  type AddressRow,
} from "@/lib/addresses-db";

type Props = {
  open: boolean;
  onClose: () => void;
  userId: string;
  currency: string;
  initial?: AddressRow | null;
  onSaved?: (a: AddressRow) => void;
};

export function AddressFormSheet({ open, onClose, userId, currency, initial, onSaved }: Props) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    label: "",
    full_name: "",
    phone: "",
    country: "",
    city: "",
    zone_or_commune: "",
    street_address: "",
    details: "",
    is_default: false,
  });

  useEffect(() => {
    if (!open) return;
    if (initial) {
      setForm({
        label: initial.label ?? "",
        full_name: initial.full_name ?? "",
        phone: initial.phone ?? "",
        country: initial.country ?? "",
        city: initial.city ?? "",
        zone_or_commune: initial.zone_or_commune ?? "",
        street_address: initial.street_address ?? "",
        details: initial.details ?? "",
        is_default: !!initial.is_default,
      });
    } else {
      setForm({
        label: "", full_name: "", phone: "", country: "",
        city: "", zone_or_commune: "", street_address: "", details: "",
        is_default: false,
      });
    }
  }, [open, initial]);

  const spec = addressFieldsFor(currency);
  const isCompact = spec.required.includes("zone_or_commune");

  const submit = async () => {
    if (!form.full_name.trim()) { toast.error(t("address.nameRequired")); return; }
    if (!form.phone.trim())     { toast.error(t("address.phoneRequired")); return; }
    if (!form.city.trim())      { toast.error(t("address.cityRequired")); return; }
    setBusy(true);
    haptic.selection();
    const payload = {
      label: form.label.trim(),
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      country: form.country.trim(),
      city: form.city.trim(),
      zone_or_commune: form.zone_or_commune.trim() || null,
      street_address: form.street_address.trim() || null,
      details: form.details.trim() || null,
      is_default: form.is_default,
    };
    const res = initial
      ? await updateAddress(initial.id, payload)
      : await createAddress(userId, payload);
    setBusy(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(t("address.saved"));
    haptic.success();
    onSaved?.(res.address);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className="px-4 pb-6 pt-2 space-y-3">
        <h2 className="text-[17px] font-bold">
          {initial ? t("address.edit") : t("address.add")}
        </h2>

        <Field label={t("address.fields.label")} value={form.label} onChange={(v) => setForm((s) => ({ ...s, label: v }))} />
        <Field required label={t("address.fields.fullName")} value={form.full_name} onChange={(v) => setForm((s) => ({ ...s, full_name: v }))} />
        <Field required label={t("address.fields.phone")} value={form.phone} onChange={(v) => setForm((s) => ({ ...s, phone: v }))} inputMode="tel" />

        {!isCompact && (
          <Field label={t("address.fields.country")} value={form.country} onChange={(v) => setForm((s) => ({ ...s, country: v }))} />
        )}
        <Field required label={t("address.fields.city")} value={form.city} onChange={(v) => setForm((s) => ({ ...s, city: v }))} />

        {isCompact ? (
          <>
            <Field required label={t("address.fields.zoneOrCommune")} value={form.zone_or_commune} onChange={(v) => setForm((s) => ({ ...s, zone_or_commune: v }))} />
            <Field label={t("address.fields.details")} value={form.details} onChange={(v) => setForm((s) => ({ ...s, details: v }))} />
          </>
        ) : (
          <>
            <Field required label={t("address.fields.streetAddress")} value={form.street_address} onChange={(v) => setForm((s) => ({ ...s, street_address: v }))} />
            <Field label={t("address.fields.zoneOrCommune")} value={form.zone_or_commune} onChange={(v) => setForm((s) => ({ ...s, zone_or_commune: v }))} />
            <Field label={t("address.fields.details")} value={form.details} onChange={(v) => setForm((s) => ({ ...s, details: v }))} />
          </>
        )}

        <label className="flex items-center gap-2 py-1 text-[13px]">
          <input
            type="checkbox"
            checked={form.is_default}
            onChange={(e) => setForm((s) => ({ ...s, is_default: e.target.checked }))}
            className="h-4 w-4 rounded border-border"
          />
          {t("address.setDefault")}
        </label>

        <Press
          onClick={submit}
          disabled={busy}
          className="!min-h-12 mt-1 w-full rounded-2xl py-3 text-[15px] font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: "#10162B" }}
        >
          {t("delivery.saveCta")}
        </Press>
      </div>
    </BottomSheet>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
        {label}{required ? " *" : ""}
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[14px] outline-none focus:border-foreground/40"
      />
    </label>
  );
}
