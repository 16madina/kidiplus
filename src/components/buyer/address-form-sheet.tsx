// AddressFormSheet — dynamic form driven by the SELECTED COUNTRY.
//
// - Always: label, full_name, phone, COUNTRY selector.
// - African / XOF-zone countries → compact form: city + commune/quartier
//   (with autocomplete) + landmark (details) + optional street.
// - Western / postal countries → full form: street + city + postal code
//   + region (optional).
// The form switches instantly when the country changes.

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Search } from "lucide-react";
import { BottomSheet } from "@/components/live-viewer/bottom-sheet";
import { Press } from "@/components/press";
import { CountryFlag } from "@/components/country-flag";
import { haptic } from "@/lib/haptics";
import { isCompactAddressCountry } from "@/lib/delivery";
import {
  createAddress,
  updateAddress,
  type AddressRow,
} from "@/lib/addresses-db";
import {
  CONTINENT_LABEL,
  countryName,
  defaultCountryFromCurrency,
  searchCountries,
  suggestionsFor,
} from "@/lib/delivery-zones-data";

type Props = {
  open: boolean;
  onClose: () => void;
  userId: string;
  /** Fallback country when no address country is set — usually the buyer's
   *  profile country or (as a legacy fallback) the wallet currency. */
  currency?: string;
  defaultCountry?: string | null;
  initial?: AddressRow | null;
  onSaved?: (a: AddressRow) => void;
};

export function AddressFormSheet({
  open,
  onClose,
  userId,
  currency,
  defaultCountry,
  initial,
  onSaved,
}: Props) {
  const { t, i18n } = useTranslation();
  const isEn = i18n.language.startsWith("en");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    label: "",
    full_name: "",
    phone: "",
    country: "",
    city: "",
    zone_or_commune: "",
    street_address: "",
    postal_code: "",
    region: "",
    details: "",
    is_default: false,
  });
  const [countryOpen, setCountryOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState("");
  const [zoneOpen, setZoneOpen] = useState(false);

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
        postal_code: initial.postal_code ?? "",
        region: initial.region ?? "",
        details: initial.details ?? "",
        is_default: !!initial.is_default,
      });
    } else {
      const c = (defaultCountry ?? "").trim().toUpperCase()
        || defaultCountryFromCurrency(currency);
      setForm({
        label: "", full_name: "", phone: "", country: c,
        city: "", zone_or_commune: "", street_address: "",
        postal_code: "", region: "", details: "",
        is_default: false,
      });
    }
    setCountryOpen(false);
    setCountryQuery("");
    setZoneOpen(false);
  }, [open, initial, currency, defaultCountry]);

  const compact = isCompactAddressCountry(form.country);
  const zoneSuggestions = useMemo(() => {
    const all = suggestionsFor(form.country);
    const q = form.zone_or_commune.trim().toLowerCase();
    if (!q) return all.slice(0, 12);
    return all.filter((s) => s.toLowerCase().includes(q)).slice(0, 12);
  }, [form.country, form.zone_or_commune]);

  const submit = async () => {
    if (!form.full_name.trim()) { toast.error(t("address.nameRequired")); return; }
    if (!form.phone.trim())     { toast.error(t("address.phoneRequired")); return; }
    if (!form.country.trim())   { toast.error(t("address.countryRequired", { defaultValue: "Choisis un pays." })); return; }
    if (!form.city.trim())      { toast.error(t("address.cityRequired")); return; }
    if (compact) {
      if (!form.zone_or_commune.trim()) {
        toast.error(t("address.communeRequired", { defaultValue: "La commune / quartier est requise." }));
        return;
      }
    } else {
      if (!form.street_address.trim()) {
        toast.error(t("address.streetRequired", { defaultValue: "L'adresse (rue) est requise." }));
        return;
      }
      if (!form.postal_code.trim()) {
        toast.error(t("address.postalRequired", { defaultValue: "Le code postal est requis." }));
        return;
      }
    }
    setBusy(true);
    haptic.selection();
    const payload = {
      label: form.label.trim(),
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      country: form.country.trim().toUpperCase(),
      city: form.city.trim(),
      zone_or_commune: form.zone_or_commune.trim() || null,
      street_address: form.street_address.trim() || null,
      postal_code: form.postal_code.trim() || null,
      region: form.region.trim() || null,
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

        {/* Country selector — drives the rest of the form */}
        <div className="relative">
          <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
            {t("address.fields.country")} *
          </span>
          <button
            type="button"
            onClick={() => setCountryOpen((o) => !o)}
            className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-background px-3 py-2.5 text-left text-[14px] outline-none"
          >
            <span className="flex min-w-0 items-center gap-2">
              {form.country ? <CountryFlag code={form.country} className="h-4 w-6 rounded-sm" /> : null}
              <span className="truncate">
                {form.country ? countryName(form.country, i18n.language) : t("address.pickCountry", { defaultValue: "Choisir un pays" })}
              </span>
            </span>
            <span className="text-muted-foreground text-[12px]">▾</span>
          </button>
          {countryOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setCountryOpen(false)} />
              <ul className="absolute left-0 right-0 top-full z-50 mt-1 max-h-80 overflow-auto rounded-xl border border-border bg-background shadow-lg">
                <li className="sticky top-0 z-10 border-b border-border bg-background p-2">
                  <div className="relative">
                    <Search size={14} className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      value={countryQuery}
                      onChange={(e) => setCountryQuery(e.target.value)}
                      autoFocus
                      placeholder={t("delivery.searchCountry")}
                      className="w-full rounded-lg border border-border bg-background py-1.5 pl-7 pr-2 text-[13px] outline-none focus:border-foreground/40"
                    />
                  </div>
                </li>
                {searchCountries(countryQuery, form.country || defaultCountry || null).length === 0 && (
                  <li className="px-3 py-2 text-[13px] text-muted-foreground">{t("delivery.noCountryFound")}</li>
                )}
                {searchCountries(countryQuery, form.country || defaultCountry || null).map(({ continent, countries }) => (
                  <li key={continent}>
                    <div className="sticky top-11 z-10 bg-muted/95 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground backdrop-blur">
                      {isEn ? CONTINENT_LABEL[continent].en : CONTINENT_LABEL[continent].fr}
                    </div>
                    <ul>
                      {countries.map((c) => (
                        <li key={c.code}>
                          <button
                            type="button"
                            onClick={() => {
                              setForm((s) => ({ ...s, country: c.code }));
                              setCountryOpen(false);
                              setCountryQuery("");
                            }}
                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-muted"
                          >
                            <CountryFlag code={c.code} className="h-4 w-6 shrink-0 rounded-sm" />
                            <span className="truncate">{isEn ? c.nameEn : c.name}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {compact ? (
          <>
            <Field required label={t("address.fields.city")} value={form.city} onChange={(v) => setForm((s) => ({ ...s, city: v }))} />
            {/* Commune / quartier with country-aware autocomplete */}
            <div className="relative">
              <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
                {t("address.fields.zoneOrCommune")} *
              </span>
              <input
                value={form.zone_or_commune}
                onChange={(e) => { setForm((s) => ({ ...s, zone_or_commune: e.target.value })); setZoneOpen(true); }}
                onFocus={() => setZoneOpen(true)}
                onBlur={() => setTimeout(() => setZoneOpen(false), 120)}
                className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[14px] outline-none focus:border-foreground/40"
              />
              {zoneOpen && zoneSuggestions.length > 0 && (
                <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-auto rounded-xl border border-border bg-background shadow-lg">
                  {zoneSuggestions.map((s) => (
                    <li key={s}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setForm((f) => ({ ...f, zone_or_commune: s }));
                          setZoneOpen(false);
                        }}
                        className="w-full px-3 py-2 text-left text-[13px] hover:bg-muted"
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <Field
              label={t("address.fields.details")}
              placeholder={t("address.landmarkPlaceholder", { defaultValue: "Ex : derrière la pharmacie, immeuble bleu" })}
              value={form.details}
              onChange={(v) => setForm((s) => ({ ...s, details: v }))}
            />
            <Field
              label={t("address.fields.streetOptional", { defaultValue: "Rue (optionnel)" })}
              value={form.street_address}
              onChange={(v) => setForm((s) => ({ ...s, street_address: v }))}
            />
          </>
        ) : (
          <>
            <Field required label={t("address.fields.streetAddress")} value={form.street_address} onChange={(v) => setForm((s) => ({ ...s, street_address: v }))} />
            <div className="grid grid-cols-[1fr_120px] gap-2">
              <Field required label={t("address.fields.city")} value={form.city} onChange={(v) => setForm((s) => ({ ...s, city: v }))} />
              <Field required label={t("address.fields.postalCode", { defaultValue: "Code postal" })} value={form.postal_code} onChange={(v) => setForm((s) => ({ ...s, postal_code: v }))} inputMode="numeric" />
            </div>
            <Field
              label={t("address.fields.region", { defaultValue: "Région / Province (optionnel)" })}
              value={form.region}
              onChange={(v) => setForm((s) => ({ ...s, region: v }))}
            />
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
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  placeholder?: string;
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
        placeholder={placeholder}
        className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[14px] outline-none focus:border-foreground/40"
      />
    </label>
  );
}
