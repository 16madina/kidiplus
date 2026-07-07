import { useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronRight,
  CreditCard,
  MapPin,
  ShoppingBag,
  Bell,
  Settings as SettingsIcon,
  HelpCircle,
  Moon,
  Volume2,
  BellRing,
  LogOut,
} from "lucide-react";
import { toast } from "sonner";
import { Press } from "@/components/press";
import { PushScreen } from "@/components/push-screen";
import { IOSSwitch } from "@/components/ios-switch";
import { EASE_IOS } from "@/lib/motion";
import { usePush } from "@/lib/push";
import { useSettings } from "@/lib/settings-context";

export function ProfileScreen() {
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="flex h-full flex-col">
      <div
        className="min-h-0 flex-1 overflow-y-auto pt-safe"
        style={{
          WebkitOverflowScrolling: "touch",
          overscrollBehavior: "contain",
          paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom))",
        }}
      >
        {/* Header */}
        <div className="px-5 pb-4 pt-4">
          <div className="flex items-center gap-4">
            <img
              src="https://i.pravatar.cc/160?u=madina"
              alt=""
              className="h-[72px] w-[72px] rounded-full object-cover ring-2 ring-border"
              onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
              draggable={false}
            />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[20px] font-bold tracking-tight">Madina</h1>
              <p className="text-[13px] text-muted-foreground">@madina.d</p>
            </div>
          </div>
          <Press
            onClick={() => toast("Modification du profil bientôt disponible")}
            className="mt-3 h-10 w-full rounded-full text-[13px] font-semibold"
            style={{
              backgroundColor: "transparent",
              color: "var(--foreground)",
              border: "1.5px solid var(--border)",
            }}
          >
            Modifier le profil
          </Press>
        </div>

        {/* Stats */}
        <div className="mx-4 mb-5 grid grid-cols-3 rounded-2xl border border-border py-3">
          <Stat label="Abonnés" value="1 248" />
          <StatDivider />
          <Stat label="Abonnements" value="86" />
          <StatDivider />
          <Stat label="Achats" value="24" />
        </div>

        {/* Menu groups */}
        <MenuGroup
          items={[
            { icon: <CreditCard size={16} />, label: "Paiements", tint: "oklch(0.6 0.2 250)", onClick: () => toast("Ouverture des paiements") },
            { icon: <MapPin size={16} />, label: "Adresses", tint: "oklch(0.6 0.17 155)", onClick: () => toast("Ouverture des adresses") },
            { icon: <ShoppingBag size={16} />, label: "Mes achats", tint: "oklch(0.7 0.17 55)", onClick: () => toast("Ouverture des achats") },
          ]}
          index={0}
        />
        <MenuGroup
          items={[
            { icon: <Bell size={16} />, label: "Notifications", tint: "oklch(0.62 0.24 20)", onClick: () => toast("Ouverture des notifications") },
            { icon: <SettingsIcon size={16} />, label: "Paramètres", tint: "oklch(0.55 0.02 285)", onClick: () => setSettingsOpen(true) },
            { icon: <HelpCircle size={16} />, label: "Aide", tint: "oklch(0.55 0.16 300)", onClick: () => toast("Centre d'aide") },
          ]}
          index={1}
        />
        <MenuGroup
          items={[
            { icon: <LogOut size={16} />, label: "Se déconnecter", tint: "oklch(0.6 0.24 27)", danger: true, onClick: () => toast.success("À bientôt !") },
          ]}
          index={2}
        />

        <p className="mt-4 text-center text-[11px] text-muted-foreground">Shoplive v1.0.0</p>
      </div>

      <SettingsPushScreen open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-[15px] font-bold tabular-nums">{value}</span>
      <span className="text-[11px] text-muted-foreground">{label}</span>
    </div>
  );
}
function StatDivider() {
  return <span className="mx-auto h-6 w-px bg-border" aria-hidden />;
}

type MenuItem = {
  icon: React.ReactNode;
  label: string;
  tint: string;
  onClick?: () => void;
  danger?: boolean;
};

function MenuGroup({ items, index }: { items: MenuItem[]; index: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: EASE_IOS, delay: 0.04 + index * 0.04 }}
      className="mx-4 mb-3 overflow-hidden rounded-2xl border border-border bg-card"
    >
      {items.map((it, i) => (
        <div key={it.label}>
          <Press
            onClick={it.onClick}
            className="!block w-full !min-h-11 p-0 text-left"
          >
            <div className="flex items-center gap-3 px-3 py-2.5">
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white"
                style={{ backgroundColor: it.tint }}
              >
                {it.icon}
              </span>
              <span
                className="flex-1 text-[15px] font-medium"
                style={{ color: it.danger ? "oklch(0.6 0.24 27)" : "var(--foreground)" }}
              >
                {it.label}
              </span>
              {!it.danger && <ChevronRight size={16} className="text-muted-foreground" />}
            </div>
          </Press>
          {i < items.length - 1 && (
            <div className="ml-14 h-px bg-border" aria-hidden />
          )}
        </div>
      ))}
    </motion.div>
  );
}

/* ================= Settings push screen ================= */

function SettingsPushScreen({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { dark, setDark, notif, setNotif, sounds, setSounds } = useSettings();
  const { status: pushStatus, requestWithPrePrompt, refresh } = usePush();

  // Refresh permission when opening (user may have changed OS setting).
  const wasOpen = useState(open)[0];
  if (open && !wasOpen) void refresh();

  const pushGranted = pushStatus === "granted";
  const pushOn = pushGranted && notif;

  return (
    <PushScreen open={open} onClose={onClose} title="Paramètres" zIndex={65}>
      <div className="px-4 py-4">
        <h2 className="mb-2 px-2 text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          Préférences
        </h2>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <ToggleRow
            icon={<BellRing size={16} />}
            tint="oklch(0.62 0.24 20)"
            label="Notifications push"
            checked={pushOn}
            onChange={async (v) => {
              setNotif(v);
              if (v && !pushGranted) {
                const ok = await requestWithPrePrompt(
                  "Active les notifications pour ne rater aucun live de tes vendeurs préférés 🔔",
                );
                if (!ok) setNotif(false);
              } else {
                toast(v ? "Notifications activées" : "Notifications désactivées");
              }
            }}
          />

          <Sep />
          <ToggleRow
            icon={<Volume2 size={16} />}
            tint="oklch(0.6 0.2 250)"
            label="Sons"
            checked={sounds}
            onChange={setSounds}
          />
          <Sep />
          <ToggleRow
            icon={<Moon size={16} />}
            tint="oklch(0.35 0.02 285)"
            label="Mode sombre"
            checked={dark}
            onChange={(v) => {
              setDark(v);
              toast(v ? "Mode sombre activé" : "Mode clair activé");
            }}
          />
        </div>
        <p className="mt-3 px-2 text-[12px] text-muted-foreground">
          Les préférences s'appliquent immédiatement à l'ensemble de l'application.
        </p>
      </div>
    </PushScreen>
  );
}

function ToggleRow({
  icon,
  tint,
  label,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  tint: string;
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white"
        style={{ backgroundColor: tint }}
      >
        {icon}
      </span>
      <span className="flex-1 text-[15px] font-medium">{label}</span>
      <IOSSwitch checked={checked} onChange={onChange} label={label} />
    </div>
  );
}
function Sep() {
  return <div className="ml-14 h-px bg-border" aria-hidden />;
}
