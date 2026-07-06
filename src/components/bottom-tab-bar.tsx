import { Home, Search, Radio, Heart, User } from "lucide-react";
import { motion } from "framer-motion";
import { Press } from "./press";
import type { TabKey } from "./app-shell";

const tabs: {
  key: TabKey;
  label: string;
  Icon: typeof Home;
}[] = [
  { key: "home", label: "Home", Icon: Home },
  { key: "search", label: "Search", Icon: Search },
  { key: "live", label: "Go Live", Icon: Radio },
  { key: "activity", label: "Activity", Icon: Heart },
  { key: "profile", label: "Profile", Icon: User },
];

export function BottomTabBar({
  active,
  onChange,
}: {
  active: TabKey;
  onChange: (k: TabKey) => void;
}) {
  return (
    <nav
      aria-label="Primary"
      className="pointer-events-auto fixed inset-x-0 bottom-0 z-50 pb-safe"
      style={{
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        backgroundColor: "color-mix(in oklch, var(--background) 78%, transparent)",
        borderTop: "1px solid var(--border)",
      }}
    >
      <ul className="mx-auto flex h-14 max-w-xl items-stretch justify-around px-2">
        {tabs.map(({ key, label, Icon }) => {
          const isLive = key === "live";
          const isActive = active === key;

          if (isLive) {
            return (
              <li key={key} className="flex items-center justify-center">
                <Press
                  aria-label={label}
                  onClick={() => onChange(key)}
                  className="relative -mt-6 h-14 w-14 rounded-full shadow-lg"
                  style={{
                    background:
                      "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))",
                    color: "white",
                  }}
                >
                  <Icon size={26} strokeWidth={2.4} />
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
                <Icon
                  size={22}
                  strokeWidth={isActive ? 2.4 : 1.8}
                  fill={isActive ? "currentColor" : "none"}
                  fillOpacity={isActive ? 0.15 : 0}
                />
                <span className="text-[10px] font-medium leading-none">
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
