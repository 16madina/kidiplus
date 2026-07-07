// Custom brand icons for the bottom tab bar.
// Hand-crafted 24×24 SVGs with a consistent 1.8 stroke, rounded caps/joins,
// and a subtle gold "+" spark echoing the KiDi+ logo.
// Each icon exposes an `active` prop that swaps between outline and filled
// variants. Colors are driven by CSS custom properties so the icons stay
// theme-aware (var(--accent) for active, currentColor for inactive).

import { motion, AnimatePresence } from "framer-motion";

type IconProps = {
  active?: boolean;
  size?: number;
  className?: string;
};

const STROKE = 1.8;

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

// Tiny gold spark "+" that sits in the top-right corner of every icon.
// It's the shared signature detail.
function GoldPlus({ cx = 19, cy = 5, r = 1.6 }: { cx?: number; cy?: number; r?: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r + 1} fill="var(--accent)" opacity={0.18} stroke="none" />
      <path
        d={`M${cx - r} ${cy} L${cx + r} ${cy} M${cx} ${cy - r} L${cx} ${cy + r}`}
        stroke="var(--accent)"
        strokeWidth={1.4}
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
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.15, ease: [0.32, 0.72, 0, 1] }}
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
            transition={{ duration: 0.15, ease: [0.32, 0.72, 0, 1] }}
            className="absolute inset-0"
          >
            {outline}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- Accueil — rounded storefront/stage ---------- */
export function HomeIcon({ active = false }: IconProps) {
  const outline = (
    <Svg>
      {/* Awning arc */}
      <path d="M4 8 Q12 3 20 8" />
      {/* Awning scallops */}
      <path d="M4 8 Q6 10.5 8 8 Q10 10.5 12 8 Q14 10.5 16 8 Q18 10.5 20 8" />
      {/* Storefront body */}
      <path d="M5 8.5 V19 Q5 20 6 20 H18 Q19 20 19 19 V8.5" />
      {/* Door */}
      <path d="M10 20 V14 Q10 13 11 13 H13 Q14 13 14 14 V20" />
      <GoldPlus />
    </Svg>
  );
  const filled = (
    <Svg>
      <path
        d="M4 8 Q12 3 20 8 L20 8.5 Q18 10.8 16 8.3 Q14 10.8 12 8.3 Q10 10.8 8 8.3 Q6 10.8 4 8.5 Z"
        fill="var(--accent)"
        stroke="var(--accent)"
      />
      <path
        d="M5 9 V19 Q5 20 6 20 H10 V14 Q10 13 11 13 H13 Q14 13 14 14 V20 H18 Q19 20 19 19 V9 Q17 11 15 9 Q13 11 11 9 Q9 11 7 9 Q6 10 5 9 Z"
        fill="var(--accent)"
        stroke="var(--accent)"
      />
      <GoldPlus />
    </Svg>
  );
  return <IconWrap active={active} outline={outline} filled={filled} />;
}

/* ---------- Explorer — compass/sparkle-search hybrid ---------- */
export function ExploreIcon({ active = false }: IconProps) {
  const outline = (
    <Svg>
      <circle cx="11" cy="11" r="7" />
      {/* Compass needle as 4-point star */}
      <path d="M11 7 L12.3 10.3 L11 11 L9.7 10.3 Z" fill="currentColor" stroke="none" />
      <path d="M11 15 L9.7 11.7 L11 11 L12.3 11.7 Z" fill="currentColor" opacity={0.5} stroke="none" />
      {/* Tiny sparkle */}
      <path d="M15.5 8.5 L16 7 L16.5 8.5 L18 9 L16.5 9.5 L16 11 L15.5 9.5 L14 9 Z" opacity={0.5} />
      <GoldPlus />
    </Svg>
  );
  const filled = (
    <Svg>
      <circle cx="11" cy="11" r="7" fill="var(--accent)" stroke="var(--accent)" />
      <path
        d="M11 6.5 L12.6 10.4 L11 11 L9.4 10.4 Z M11 15.5 L9.4 11.6 L11 11 L12.6 11.6 Z"
        fill="var(--primary-foreground)"
        stroke="none"
      />
      <GoldPlus />
    </Svg>
  );
  return <IconWrap active={active} outline={outline} filled={filled} />;
}

/* ---------- Activité — bell with motion wave ---------- */
export function BellIcon({ active = false }: IconProps) {
  const outline = (
    <Svg>
      <path d="M6.5 16 Q6 16 6 15.5 Q7.5 14 7.5 12 V10 Q7.5 6.5 11 6.5 Q14.5 6.5 14.5 10 V12 Q14.5 14 16 15.5 Q16 16 15.5 16 Z" />
      <path d="M9.5 18.5 Q10 20 11 20 Q12 20 12.5 18.5" />
      {/* Motion wave */}
      <path d="M17.5 10 Q18.5 11.5 17.5 13" opacity={0.6} />
      <GoldPlus />
    </Svg>
  );
  const filled = (
    <Svg>
      <path
        d="M6.5 16 Q6 16 6 15.5 Q7.5 14 7.5 12 V10 Q7.5 6.5 11 6.5 Q14.5 6.5 14.5 10 V12 Q14.5 14 16 15.5 Q16 16 15.5 16 Z"
        fill="var(--accent)"
        stroke="var(--accent)"
      />
      <path d="M9.5 18.5 Q10 20 11 20 Q12 20 12.5 18.5" stroke="var(--accent)" />
      <path d="M17.5 10 Q18.5 11.5 17.5 13" stroke="var(--accent)" opacity={0.7} />
      <GoldPlus />
    </Svg>
  );
  return <IconWrap active={active} outline={outline} filled={filled} />;
}

/* ---------- Profil — person in squircle (echoes logo silhouette) ---------- */
export function PersonIcon({ active = false }: IconProps) {
  const outline = (
    <Svg>
      <path d="M4.5 8 Q4.5 4.5 8 4.5 H14 Q17.5 4.5 17.5 8 V14 Q17.5 17.5 14 17.5 H8 Q4.5 17.5 4.5 14 Z" />
      <circle cx="11" cy="10" r="2.4" />
      <path d="M6.5 16 Q7.5 13 11 13 Q14.5 13 15.5 16" />
      <GoldPlus />
    </Svg>
  );
  const filled = (
    <Svg>
      <path
        d="M4.5 8 Q4.5 4.5 8 4.5 H14 Q17.5 4.5 17.5 8 V14 Q17.5 17.5 14 17.5 H8 Q4.5 17.5 4.5 14 Z"
        fill="var(--accent)"
        stroke="var(--accent)"
      />
      <circle cx="11" cy="10" r="2.4" fill="var(--primary-foreground)" stroke="none" />
      <path
        d="M6.8 16.5 Q7.8 13.2 11 13.2 Q14.2 13.2 15.2 16.5 Z"
        fill="var(--primary-foreground)"
        stroke="none"
      />
      <GoldPlus />
    </Svg>
  );
  return <IconWrap active={active} outline={outline} filled={filled} />;
}

/* ---------- Go Live — broadcast/signal (used INSIDE the raised gold button) ---------- */
export function BroadcastIcon({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
      <path d="M8.5 8.5 Q7 12 8.5 15.5" />
      <path d="M15.5 8.5 Q17 12 15.5 15.5" />
      <path d="M6 6 Q3.5 12 6 18" opacity={0.7} />
      <path d="M18 6 Q20.5 12 18 18" opacity={0.7} />
    </svg>
  );
}
