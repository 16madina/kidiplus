import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Press } from "./press";
import type { TabKey } from "./app-shell";
import {
  HomeIcon,
  ExploreIcon,
  BellIcon,
  PersonIcon,
  BroadcastIcon,
} from "./brand/tab-icons";

type TabDef = {
  key: TabKey;
  labelKey: string;
  Icon: (props: { active?: boolean }) => React.ReactElement;
};

const leftTabs: TabDef[] = [
  { key: "home", labelKey: "tabs.home", Icon: HomeIcon },
  { key: "search", labelKey: "tabs.search", Icon: ExploreIcon },
];

const rightTabs: TabDef[] = [
  { key: "activity", labelKey: "tabs.activity", Icon: BellIcon },
  { key: "profile", labelKey: "tabs.profile", Icon: PersonIcon },
];

export function BottomTabBar({
  active,
  onChange,
  isBroadcasting = false,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
  isBroadcasting?: boolean;
}) {
  const { t } = useTranslation();

  const renderTab = ({ key, labelKey, Icon }: TabDef) => {
    const isActive = active === key;
    const label = t(labelKey);
    return (
      <li key={key} className="flex flex-1 items-center justify-center">
        <Press
          aria-label={label}
          onClick={() => onChange(key)}
          className="relative h-full w-full flex-col gap-0.5"
          style={{
            color: isActive ? "var(--accent)" : "var(--muted-foreground)",
          }}
        >
          <Icon active={isActive} />
          <span
            className="text-[10px] leading-none"
            style={{
              fontWeight: isActive ? 600 : 500,
              color: isActive ? "var(--accent)" : "var(--muted-foreground)",
            }}
          >
            {label}
          </span>
          {isActive && (
            <motion.span
              layoutId="tab-dot"
              className="absolute -bottom-0.5 h-1 w-1 rounded-full"
              style={{ backgroundColor: "var(--accent)" }}
            />
          )}
        </Press>
      </li>
    );
  };

  return (
    <nav
      aria-label="Primary"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 pb-safe"
    >
      <div className="pointer-events-none relative mx-auto mb-3 max-w-xl px-4">
        {/* Floating pill bar with a notch under the raised live button.
            The notch is a radial-gradient mask that cuts a circle out of
            the pill so the gold button appears to punch through it. */}
        <div
          className="pointer-events-auto relative h-16 rounded-full"
          style={{
            backdropFilter: "saturate(180%) blur(24px)",
            WebkitBackdropFilter: "saturate(180%) blur(24px)",
            backgroundColor:
              "color-mix(in oklch, var(--background) 90%, transparent)",
            border: "1px solid var(--border)",
            boxShadow:
              "0 10px 30px -12px rgba(0,0,0,0.25), 0 2px 8px rgba(0,0,0,0.08)",
            // Mask: everything visible EXCEPT a 36px-radius circle centered
            // horizontally at the top edge — that's the notch.
            WebkitMaskImage:
              "radial-gradient(circle 36px at 50% -2px, transparent 98%, #000 100%)",
            maskImage:
              "radial-gradient(circle 36px at 50% -2px, transparent 98%, #000 100%)",
          }}
        >
          <ul className="grid h-full grid-cols-[1fr_1fr_88px_1fr_1fr] items-stretch px-2">
            {leftTabs.map(renderTab)}
            {/* Spacer where the raised button sits */}
            <li aria-hidden className="pointer-events-none" />
            {rightTabs.map(renderTab)}
          </ul>
        </div>

        {/* Raised center action — sits above the pill, aligned to the notch */}
        <div className="pointer-events-none absolute inset-x-0 -top-4 flex justify-center">
          <Press
            aria-label={t("tabs.live")}
            onClick={() => onChange("live")}
            className="pointer-events-auto relative h-16 w-16 rounded-full"
            style={{
              background:
                "linear-gradient(135deg, #E8B93B 0%, #D4A62A 60%, #B8891C 100%)",
              color: "var(--navy-900, #0C1122)",
              boxShadow:
                "0 12px 28px -8px color-mix(in oklch, var(--accent) 60%, transparent), 0 4px 10px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.4)",
            }}
          >
            <BroadcastIcon size={28} />
            {isBroadcasting && (
              <span
                className="absolute right-1 top-1 flex h-3 w-3 items-center justify-center"
                aria-hidden
              >
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
                  style={{ backgroundColor: "var(--live)" }}
                />
                <span
                  className="relative inline-flex h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor: "var(--live)",
                    boxShadow: "0 0 0 2px var(--background)",
                  }}
                />
              </span>
            )}
          </Press>
        </div>
      </div>
    </nav>
  );
}
