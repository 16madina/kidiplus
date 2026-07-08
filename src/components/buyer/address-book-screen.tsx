// AddressBookScreen — list + manage the buyer's delivery addresses.

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { MapPin, Plus, Star, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { PushScreen } from "@/components/push-screen";
import { Press } from "@/components/press";
import { useAuth } from "@/lib/auth-context";
import { haptic } from "@/lib/haptics";
import {
  deleteAddress,
  fetchMyAddresses,
  setDefaultAddress,
  type AddressRow,
} from "@/lib/addresses-db";
import { formatAddressLine } from "@/lib/delivery";
import { AddressFormSheet } from "./address-form-sheet";

export function AddressBookScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { user, profile } = useAuth();
  const currency = profile?.currency ?? "EUR";
  const [addresses, setAddresses] = useState<AddressRow[]>([]);
  const [editing, setEditing] = useState<AddressRow | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setAddresses(await fetchMyAddresses(user.id));
  }, [user]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const onSetDefault = async (a: AddressRow) => {
    haptic.selection();
    await setDefaultAddress(a.id);
    await load();
  };

  const onDelete = async (a: AddressRow) => {
    if (!confirm(t("address.confirmDelete"))) return;
    const r = await deleteAddress(a.id);
    if (!r.ok) {
      toast.error(r.error === "address_in_use" ? t("address.inUse") : r.error);
      return;
    }
    toast.success(t("address.deleted"));
    await load();
  };

  return (
    <PushScreen open={open} onClose={onClose} title={t("address.title")} zIndex={65}>
      <div className="px-4 py-4 space-y-2">
        <Press
          onClick={() => { setEditing(null); setFormOpen(true); }}
          className="!min-h-12 flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[14px] font-bold text-white"
          style={{ backgroundColor: "#10162B" }}
        >
          <Plus size={16} /> {t("address.add")}
        </Press>

        {addresses.length === 0 ? (
          <p className="py-12 text-center text-[13px] text-muted-foreground">{t("address.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {addresses.map((a, i) => (
              <motion.li
                key={a.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: Math.min(i, 6) * 0.03 }}
                className="rounded-2xl border border-border p-3"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                    style={{ backgroundColor: "oklch(0.94 0.05 155)", color: "oklch(0.4 0.12 155)" }}
                  >
                    <MapPin size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[14px] font-semibold">
                        {a.label || a.full_name || t("address.title")}
                      </p>
                      {a.is_default && (
                        <span
                          className="rounded-full px-2 py-0.5 text-[9px] font-bold uppercase"
                          style={{ backgroundColor: "oklch(0.94 0.06 80)", color: "oklch(0.42 0.14 70)" }}
                        >
                          {t("address.default")}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[12px] text-muted-foreground truncate">
                      {a.full_name} · {a.phone}
                    </p>
                    <p className="mt-0.5 text-[12px] text-muted-foreground truncate">
                      {formatAddressLine(a) || a.city}
                    </p>
                    {a.details && <p className="text-[11px] text-muted-foreground truncate">↳ {a.details}</p>}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {!a.is_default && (
                    <Press onClick={() => onSetDefault(a)}
                      className="rounded-xl border px-3 py-1.5 text-[12px] font-semibold flex items-center gap-1">
                      <Star size={12} /> {t("address.setDefault")}
                    </Press>
                  )}
                  <Press onClick={() => { setEditing(a); setFormOpen(true); }}
                    className="rounded-xl border px-3 py-1.5 text-[12px] font-semibold flex items-center gap-1">
                    <Pencil size={12} /> {t("address.edit")}
                  </Press>
                  <Press onClick={() => onDelete(a)}
                    className="rounded-xl border px-3 py-1.5 text-[12px] font-semibold flex items-center gap-1"
                    style={{ borderColor: "oklch(0.85 0.14 27)", color: "oklch(0.5 0.18 27)" }}>
                    <Trash2 size={12} /> {t("address.delete")}
                  </Press>
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </div>

      <AddressFormSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        userId={user?.id ?? ""}
        currency={currency}
        initial={editing}
        onSaved={() => void load()}
      />
    </PushScreen>
  );
}
