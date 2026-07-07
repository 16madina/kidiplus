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

const tabs: TabDef[] = [
  { key: "home", labelKey: "tabs.home", Icon: HomeIcon },
  { key: "search", labelKey: "tabs.search", Icon: ExploreIcon },
  { key: "live", labelKey: "tabs.live", Icon: () => <BroadcastIcon /> },
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
  return (
    <nav
      aria-label="Primary"
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-50 pb-safe"
      style={{
        backdropFilter: "saturate(180%) blur(24px)",
        WebkitBackdropFilter: "saturate(180%) blur(24px)",
        backgroundColor:
          "color-mix(in oklch, var(--background) 82%, transparent)",
        borderTop: "1px solid var(--border)",
      }}
    >
      <ul className="mx-auto flex h-14 max-w-xl items-stretch justify-around px-2">
        {tabs.map(({ key, labelKey, Icon }) => {
          const isLive = key === "live";
          const isActive = active === key;
          const label = t(labelKey);

          if (isLive) {
            return (
              <li key={key} className="flex items-center justify-center">
                <Press
                  aria-label={label}
                  onClick={() => onChange(key)}
                  className="relative -mt-6 h-14 w-14 rounded-full"
                  style={{
                    background:
                      "linear-gradient(135deg, #E8B93B 0%, #D4A62A 60%, #B8891C 100%)",
                    color: "var(--navy-900, #0C1122)",
                    boxShadow:
                      "0 8px 22px -6px color-mix(in oklch, var(--accent) 55%, transparent), 0 2px 6px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.35)",
                  }}
                >
                  <BroadcastIcon size={26} />
                  {isBroadcasting && (
                    <span
                      className="absolute -right-0.5 -top-0.5 flex h-3 w-3 items-center justify-center"
                      aria-hidden
                    >
                      <span
                        className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
                        style={{ backgroundColor: "var(--live)" }}
                      />
                      <span
                        className="relative inline-flex h-2.5 w-2.5 rounded-full ring-2"
                        style={{
                          backgroundColor: "var(--live)",
                          // ring color to blend with bar surface
                          boxShadow: "0 0 0 2px var(--background)",
                        }}
                      />
                    </span>
                  )}
                </Press>
              </li>
            );
          }

          return (
            <li key={key} className="flex flex-1 items-center justify-center">
              <Press
                aria-label={label}
                onClick={() => onChange(key)}
                className="relative h-full w-full flex-col gap-0.5"
                style={{
                  color: isActive
                    ? "var(--accent)"
                    : "var(--muted-foreground)",
                }}
              >
                <Icon active={isActive} />
                <span
                  className="text-[10px] leading-none"
                  style={{
                    fontWeight: isActive ? 600 : 500,
                    color: isActive
                      ? "var(--accent)"
                      : "var(--muted-foreground)",
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
        })}
      </ul>
    </nav>
  );
}
