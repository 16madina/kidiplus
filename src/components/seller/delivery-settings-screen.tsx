// SellerDeliverySettingsScreen — configure the seller's delivery mode.
//
// Mode "flat"    → one flat fee.
// Mode "zones"   → add/remove zones with (name, fee).
// Mode "courier" → buyer pays courier cash on delivery; app charges 0.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Truck, Plus, Trash2 } from "lucide-react";
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
  const [mode, setMode] = useState<DeliveryMode>("flat");
  const [flatFee, setFlatFee] = useState<string>("0");
  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || !user) return;
    void (async () => {
      const s = await fetchDeliverySettingsOrDefault(user.id);
      setMode(s.mode);
      setFlatFee(String(s.flat_fee ?? 0));
      setZones(s.zones ?? []);
    })();
  }, [open, user]);

  const save = async () => {
    if (!user) return;
    setBusy(true);
    haptic.selection();
    const cleanFlat = Number(flatFee.replace(/,/g, ".")) || 0;
    const cleanZones = zones
      .map((z) => ({ name: z.name.trim(), fee: Number(String(z.fee).replace(/,/g, ".")) || 0 }))
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
          <div className="space-y-2">
            <p className="text-[12px] font-semibold text-muted-foreground">{t("delivery.zones")}</p>
            {zones.length === 0 && (
              <p className="rounded-xl border border-dashed border-border p-3 text-center text-[12px] text-muted-foreground">
                {t("delivery.addZone")}
              </p>
            )}
            <ul className="space-y-2">
              {zones.map((z, idx) => (
                <li key={idx} className="flex items-center gap-2 rounded-xl border border-border p-2">
                  <input
                    value={z.name}
                    onChange={(e) => {
                      const val = e.target.value;
                      setZones((zs) => zs.map((x, i) => (i === idx ? { ...x, name: val } : x)));
                    }}
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
                    className="w-24 shrink-0 rounded-lg border border-border bg-background px-2 py-1.5 text-right text-[13px] tabular-nums outline-none"
                  />
                  <Press
                    onClick={() => setZones((zs) => zs.filter((_, i) => i !== idx))}
                    aria-label={t("delivery.removeZone")}
                    className="!min-h-9 !min-w-9 rounded-lg"
                  >
                    <Trash2 size={14} />
                  </Press>
                </li>
              ))}
            </ul>
            <Press
              onClick={() => setZones((zs) => [...zs, { name: "", fee: 0 }])}
              className="!min-h-10 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border py-2 text-[13px] font-semibold"
            >
              <Plus size={14} /> {t("delivery.addZone")}
            </Press>
            {zones.length > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {t("delivery.sellerZones")}: {zones.map((z) => `${z.name} · ${formatMoney(z.fee, currency, i18n.language)}`).join(" · ")}
              </p>
            )}
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
