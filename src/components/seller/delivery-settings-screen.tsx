// SellerDeliverySettingsScreen — configure the seller's delivery mode.
//
// Mode "flat"    → one flat fee.
// Mode "zones"   → add/remove zones with (country, name, fee).
// Mode "courier" → buyer pays courier cash on delivery; app charges 0.

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Truck, Plus, Trash2, ChevronDown, Search } from "lucide-react";
import { PushScreen } from "@/components/push-screen";
import { Press } from "@/components/press";
import { useAuth } from "@/lib/auth-context";
import { haptic } from "@/lib/haptics";
import { formatMoney } from "@/lib/money";
import {
  fetchDeliverySettingsOrDefault,
  upsertDeliverySettings,
} from "@/lib/delivery-db";
import type { DeliveryMode, DeliveryZone } from "@/lib/delivery";
import {
  countriesByContinent,
  CONTINENT_LABEL,
  countryLabel,
  countryFlag,
  defaultCountryFromCurrency,
  searchCountries,
  suggestionsFor,
} from "@/lib/delivery-zones-data";

export function SellerDeliverySettingsScreen({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation();
  const { user, profile } = useAuth();
  const currency = profile?.currency ?? "EUR";
  const sellerCountry = (profile?.country ?? "").toUpperCase() ||
    defaultCountryFromCurrency(currency);

  const [mode, setMode] = useState<DeliveryMode>("flat");
  const [flatFee, setFlatFee] = useState<string>("0");
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [busy, setBusy] = useState(false);
  const [openSuggestIdx, setOpenSuggestIdx] = useState<number | null>(null);
  const [countryPickerIdx, setCountryPickerIdx] = useState<number | null>(null);
  const [countrySearch, setCountrySearch] = useState("");

  useEffect(() => {
    if (!open || !user) return;
    void (async () => {
      const s = await fetchDeliverySettingsOrDefault(user.id);
      setMode(s.mode);
      setFlatFee(String(s.flat_fee ?? 0));
      // backfill missing country with seller's country
      setZones((s.zones ?? []).map((z) => ({
        ...z,
        country: z.country || sellerCountry,
      })));
    })();
  }, [open, user, sellerCountry]);

  const save = async () => {
    if (!user) return;
    setBusy(true);
    haptic.selection();
    const cleanFlat = Number(flatFee.replace(/,/g, ".")) || 0;
    const cleanZones = zones
      .map((z) => ({
        country: (z.country || sellerCountry).toUpperCase(),
        name: z.name.trim(),
        fee: Number(String(z.fee).replace(/,/g, ".")) || 0,
      }))
      .filter((z) => z.name.length > 0);
    const r = await upsertDeliverySettings(user.id, {
      mode,
      flat_fee: cleanFlat,
      zones: cleanZones,
    });
    setBusy(false);
    if (!r.ok) { toast.error(r.error); return; }
    haptic.success();
    toast.success(t("delivery.saved"));
    onClose();
  };

  const grouped = useMemo(() => {
    const map = new Map<string, { idx: number; zone: DeliveryZone }[]>();
    zones.forEach((z, idx) => {
      const key = (z.country || sellerCountry).toUpperCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ idx, zone: z });
    });
    return Array.from(map.entries());
  }, [zones, sellerCountry]);

  const addZone = () => {
    setZones((zs) => [...zs, { country: sellerCountry, name: "", fee: 0 }]);
    setOpenSuggestIdx(zones.length);
  };

  return (
    <PushScreen open={open} onClose={onClose} title={t("delivery.settings")} zIndex={65}>
      <div className="px-4 py-4 space-y-4">
        <div
          className="rounded-3xl p-5 text-white"
          style={{ background: "linear-gradient(135deg, oklch(0.4 0.06 265), oklch(0.28 0.05 265))" }}
        >
          <div className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide opacity-90">
            <Truck size={14} /> {t("delivery.title")}
          </div>
          <p className="mt-2 text-[13px] leading-relaxed opacity-90">
            {t("delivery.modeHelp." + mode)}
          </p>
        </div>

        <div className="space-y-2">
          <p className="text-[12px] font-semibold text-muted-foreground">{t("delivery.mode")}</p>
          <div className="grid grid-cols-3 gap-2">
            {(["flat", "zones", "courier"] as const).map((m) => {
              const active = mode === m;
              return (
                <Press
                  key={m}
                  onClick={() => { haptic.selection(); setMode(m); }}
                  className="!min-h-12 rounded-2xl border px-2 py-2 text-[12px] font-bold"
                  style={{
                    borderColor: active ? "#10162B" : "var(--border)",
                    backgroundColor: active ? "#10162B" : "transparent",
                    color: active ? "white" : "var(--foreground)",
                  }}
                >
                  {t(`delivery.modes.${m}`)}
                </Press>
              );
            })}
          </div>
        </div>

        {mode === "flat" && (
          <label className="block">
            <span className="mb-1 block text-[12px] font-semibold text-muted-foreground">
              {t("delivery.flatFee")} ({currency})
            </span>
            <input
              value={flatFee}
              onChange={(e) => setFlatFee(e.target.value)}
              inputMode="decimal"
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-[14px] tabular-nums outline-none focus:border-foreground/40"
            />
          </label>
        )}

        {mode === "zones" && (
          <div className="space-y-3">
            <p className="text-[12px] font-semibold text-muted-foreground">{t("delivery.zones")}</p>
            {zones.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-3 text-center text-[12px] text-muted-foreground">
                {t("delivery.addZone")}
              </p>
            )}

            {grouped.map(([countryCode, items]) => (
              <div key={countryCode} className="space-y-2">
                <p className="flex items-center gap-1.5 px-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                  <span>{countryLabel(countryCode, i18n.language)}</span>
                </p>
                <ul className="space-y-2">
                  {items.map(({ idx, zone: z }) => {
                    const suggestions = suggestionsFor(z.country || sellerCountry)
                      .filter((s) =>
                        !z.name.trim()
                          ? true
                          : s.toLowerCase().includes(z.name.trim().toLowerCase()),
                      )
                      .slice(0, 8);
                    const showSuggest = openSuggestIdx === idx && suggestions.length > 0;
                    return (
                      <li key={idx} className="rounded-xl border border-border p-2 space-y-2">
                        {/* Row 1: country + name */}
                        <div className="flex items-center gap-2 relative">
                          <Press
                            onClick={() =>
                              setCountryPickerIdx(countryPickerIdx === idx ? null : idx)
                            }
                            className="!min-h-9 shrink-0 rounded-lg border border-border bg-background px-2 text-[13px] flex items-center gap-1"
                            aria-label={t("delivery.zoneCountry", "Pays")}
                          >
                            <span>{countryFlag(z.country || sellerCountry) || "🌍"}</span>
                            <ChevronDown size={12} />
                          </Press>
                          <input
                            value={z.name}
                            onFocus={() => setOpenSuggestIdx(idx)}
                            onChange={(e) => {
                              const val = e.target.value;
                              setZones((zs) => zs.map((x, i) => (i === idx ? { ...x, name: val } : x)));
                              setOpenSuggestIdx(idx);
                            }}
                            onBlur={() => window.setTimeout(() => setOpenSuggestIdx((v) => (v === idx ? null : v)), 150)}
                            placeholder={t("delivery.zoneName")}
                            className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2 py-1.5 text-[13px] outline-none"
                          />
                          <input
                            value={String(z.fee)}
                            onChange={(e) => {
                              const val = e.target.value;
                              setZones((zs) => zs.map((x, i) => (i === idx ? { ...x, fee: Number(val.replace(/,/g, ".")) || 0 } : x)));
                            }}
                            inputMode="decimal"
                            placeholder={t("delivery.zoneFee")}
                            className="w-20 shrink-0 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-[13px] tabular-nums outline-none"
                          />
                          <Press
                            onClick={() => setZones((zs) => zs.filter((_, i) => i !== idx))}
                            aria-label={t("delivery.removeZone")}
                            className="!min-h-9 !min-w-9 rounded-lg"
                          >
                            <Trash2 size={14} />
                          </Press>

                          {showSuggest && (
                            <ul className="absolute left-11 right-28 top-full z-10 mt-1 max-h-52 overflow-auto rounded-lg border border-border bg-background shadow-lg">
                              {suggestions.map((s) => (
                                <li key={s}>
                                  <button
                                    type="button"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      setZones((zs) => zs.map((x, i) => (i === idx ? { ...x, name: s } : x)));
                                      setOpenSuggestIdx(null);
                                    }}
                                    className="w-full px-3 py-2 text-left text-[13px] hover:bg-muted"
                                  >
                                    {s}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}

                          {countryPickerIdx === idx && (
                            <>
                              <div
                                className="fixed inset-0 z-10"
                                onClick={() => setCountryPickerIdx(null)}
                              />
                              <ul className="absolute left-0 top-full z-20 mt-1 max-h-72 w-64 overflow-auto rounded-lg border border-border bg-background shadow-lg">
                                {countriesByContinent(sellerCountry).map(({ continent, countries }) => (
                                  <li key={continent}>
                                    <div className="sticky top-0 bg-muted/95 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground backdrop-blur">
                                      {i18n.language.startsWith("en") ? CONTINENT_LABEL[continent].en : CONTINENT_LABEL[continent].fr}
                                    </div>
                                    <ul>
                                      {countries.map((c) => (
                                        <li key={c.code}>
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setZones((zs) => zs.map((x, i) => (i === idx ? { ...x, country: c.code } : x)));
                                              setCountryPickerIdx(null);
                                            }}
                                            className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-muted"
                                          >
                                            <span>{c.flag}</span>
                                            <span>{i18n.language.startsWith("en") ? c.nameEn : c.name}</span>
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
                        {z.fee > 0 && (
                          <p className="pl-11 text-[11px] text-muted-foreground tabular-nums">
                            {formatMoney(z.fee, currency, i18n.language)}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}

            <Press
              onClick={addZone}
              className="!min-h-10 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-[13px] font-semibold"
            >
              <Plus size={14} /> {t("delivery.addZone")}
            </Press>
          </div>
        )}

        {mode === "courier" && (
          <p className="rounded-xl bg-muted p-3 text-[13px]">{t("delivery.courierNote")}</p>
        )}

        <Press
          onClick={save}
          disabled={busy}
          className="!min-h-12 w-full rounded-2xl py-3 text-[15px] font-bold text-white disabled:opacity-50"
          style={{ backgroundColor: "#10162B" }}
        >
          {t("delivery.saveCta")}
        </Press>
      </div>
    </PushScreen>
  );
}
