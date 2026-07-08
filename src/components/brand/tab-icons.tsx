// Custom brand icons for the bottom tab bar.
//
// Reproduces the reference set: an arched doorway (Accueil), a compass rose
// (Explorer), a wrapped gift box (Activité) and a portrait badge (Profil).
// Each icon has an outline (inactive) and a filled (active) variant that swap
// with a subtle spring. A small gold "+" spark in the top-right corner is the
// shared KiDi+ signature — kept discreet so the silhouette reads first.

import { motion, AnimatePresence } from "framer-motion";

type IconProps = {
  active?: boolean;
  size?: number;
  className?: string;
};

const STROKE = 1.6;

function Svg({
  children,
  size = 24,
  className,
}: {
  children: React.ReactNode;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

// Signature gold "+" spark — subtle, top-right.
function GoldPlus({ cx = 19.5, cy = 4.5, r = 1.4 }: { cx?: number; cy?: number; r?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 1.2} fill="var(--accent)" opacity={0.14} stroke="none" />
      <path
        d={`M${cx - r} ${cy} L${cx + r} ${cy} M${cx} ${cy - r} L${cx} ${cy + r}`}
        stroke="var(--accent)"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    </g>
  );
}

function IconWrap({
  active,
  outline,
  filled,
}: {
  active: boolean;
  outline: React.ReactNode;
  filled: React.ReactNode;
}) {
  return (
    <div className="relative h-6 w-6">
      <AnimatePresence initial={false} mode="popLayout">
        {active ? (
          <motion.div
            key="f"
            initial={{ opacity: 0, scale: 0.85, y: 1 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85 }}
            transition={{ type: "spring", stiffness: 500, damping: 28 }}
            className="absolute inset-0"
          >
            {filled}
          </motion.div>
        ) : (
          <motion.div
            key="o"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.14, ease: [0.32, 0.72, 0, 1] }}
            className="absolute inset-0"
          >
            {outline}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- Accueil — arched doorway (rounded arch + inner frame) ---------- */
export function HomeIcon({ active = false }: IconProps) {
  // Outer arch: half-circle top on a rectangle base.
  // Inner arch: same silhouette, inset — reads as a door within a frame.
  const outerArch =
    "M5 20 V11 A7 7 0 0 1 19 11 V20 Z";
  const innerArch =
    "M8 20 V11.5 A4 4 0 0 1 16 11.5 V20";
  const outline = (
    <Svg>
      <path d={outerArch} />
      <path d={innerArch} />
      {/* Door knob */}
      <circle cx="14" cy="15.5" r="0.6" fill="currentColor" stroke="none" />
      <GoldPlus />
    </Svg>
  );
  const filled = (
    <Svg>
      <path d={outerArch} fill="var(--accent)" stroke="var(--accent)" />
      <path d={innerArch} fill="var(--background)" stroke="var(--accent)" />
      <circle cx="14" cy="15.5" r="0.7" fill="var(--accent)" stroke="none" />
      <GoldPlus />
    </Svg>
  );
  return <IconWrap active={active} outline={outline} filled={filled} />;
}

/* ---------- Explorer — compass rose (circle + 4-point star) ---------- */
export function ExploreIcon({ active = false }: IconProps) {
  // 4-point rhombus star centered in the dial.
  const star = "M12 5.5 L13.6 12 L12 18.5 L10.4 12 Z M5.5 12 L12 10.4 L18.5 12 L12 13.6 Z";
  const outline = (
    <Svg>
      <circle cx="12" cy="12" r="7.5" />
      {/* Cardinal ticks */}
      <path d="M12 3.5 V5 M12 19 V20.5 M3.5 12 H5 M19 12 H20.5" />
      <path d={star} />
      <circle cx="12" cy="12" r="0.9" fill="currentColor" stroke="none" />
      <GoldPlus />
    </Svg>
  );
  const filled = (
    <Svg>
      <circle cx="12" cy="12" r="7.5" fill="var(--accent)" stroke="var(--accent)" />
      <path d="M12 3.5 V5 M12 19 V20.5 M3.5 12 H5 M19 12 H20.5" stroke="var(--accent)" />
      <path d={star} fill="var(--primary-foreground)" stroke="var(--primary-foreground)" strokeWidth={0.8} />
      <circle cx="12" cy="12" r="0.9" fill="var(--accent)" stroke="none" />
      <GoldPlus />
    </Svg>
  );
  return <IconWrap active={active} outline={outline} filled={filled} />;
}

/* ---------- Activité — wrapped gift box with bow ---------- */
// Kept the BellIcon export name so existing imports (bottom-tab-bar) keep working.
export function BellIcon({ active = false }: IconProps) {
  // Box body + lid + vertical ribbon + bow loops on top.
  const body = "M4.5 11 H19.5 V19 Q19.5 20 18.5 20 H5.5 Q4.5 20 4.5 19 Z";
  const lid = "M3.8 8.5 H20.2 Q20.5 8.5 20.5 8.8 V10.7 Q20.5 11 20.2 11 H3.8 Q3.5 11 3.5 10.7 V8.8 Q3.5 8.5 3.8 8.5 Z";
  const ribbon = "M12 8.5 V20";
  // Two bow loops meeting at the ribbon top.
  const bow =
    "M12 8.5 C11 7 8.5 6.2 8 7.2 C7.5 8.2 9.5 8.5 12 8.5 Z M12 8.5 C13 7 15.5 6.2 16 7.2 C16.5 8.2 14.5 8.5 12 8.5 Z";
  const outline = (
    <Svg>
      <path d={body} />
      <path d={lid} />
      <path d={ribbon} />
      <path d={bow} />
      <GoldPlus />
    </Svg>
  );
  const filled = (
    <Svg>
      <path d={body} fill="var(--accent)" stroke="var(--accent)" />
      <path d={lid} fill="var(--accent)" stroke="var(--accent)" />
      <path d={ribbon} stroke="var(--primary-foreground)" strokeWidth={1.4} />
      <path d={bow} fill="var(--accent)" stroke="var(--accent)" />
      <GoldPlus />
    </Svg>
  );
  return <IconWrap active={active} outline={outline} filled={filled} />;
}

/* ---------- Profil — bust silhouette (head + shoulders, no medallion) ---------- */
export function PersonIcon({ active = false }: IconProps) {
  const head = "M12 8 m -3 0 a 3 3 0 1 0 6 0 a 3 3 0 1 0 -6 0";
  const shoulders = "M4.5 20 Q5.8 13.5 12 13.5 Q18.2 13.5 19.5 20";
  const outline = (
    <Svg>
      <path d={head} />
      <path d={shoulders} />
      <GoldPlus />
    </Svg>
  );
  const filled = (
    <Svg>
      <path d={head} fill="var(--accent)" stroke="var(--accent)" />
      <path d={shoulders} fill="var(--accent)" stroke="var(--accent)" />
      <GoldPlus />
    </Svg>
  );
  return <IconWrap active={active} outline={outline} filled={filled} />;
}


/* ---------- Go Live — broadcast waves (used INSIDE the raised gold button) ---------- */
export function BroadcastIcon({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="2.4" fill="currentColor" stroke="none" />
      <path d="M8.8 8.8 Q7 12 8.8 15.2" />
      <path d="M15.2 8.8 Q17 12 15.2 15.2" />
      <path d="M6 6.5 Q3.5 12 6 17.5" opacity={0.55} />
      <path d="M18 6.5 Q20.5 12 18 17.5" opacity={0.55} />
    </svg>
  );
}
