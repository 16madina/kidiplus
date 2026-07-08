// Custom brand icons for the bottom tab bar.
//
// Redesign: cleaner geometry, consistent 24×24 grid, 1.6 stroke, rounded
// caps/joins. Each icon has an outline (inactive) and a filled (active)
// variant that swap with a subtle spring. A small gold "+" spark in the
// top-right corner is the shared KiDi+ signature — kept discreet so the
// silhouette reads first.

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

/* ---------- Accueil — squircle house with soft roof ---------- */
export function HomeIcon({ active = false }: IconProps) {
  const outline = (
    <Svg>
      <path d="M4 11 L12 4.5 L20 11 V18.5 Q20 20 18.5 20 H5.5 Q4 20 4 18.5 Z" />
      <path d="M9.5 20 V14.5 Q9.5 13.5 10.5 13.5 H13.5 Q14.5 13.5 14.5 14.5 V20" />
      <GoldPlus />
    </Svg>
  );
  const filled = (
    <Svg>
      <path
        d="M4 11 L12 4.5 L20 11 V18.5 Q20 20 18.5 20 H14.5 V14.5 Q14.5 13.5 13.5 13.5 H10.5 Q9.5 13.5 9.5 14.5 V20 H5.5 Q4 20 4 18.5 Z"
        fill="var(--accent)"
        stroke="var(--accent)"
      />
      <GoldPlus />
    </Svg>
  );
  return <IconWrap active={active} outline={outline} filled={filled} />;
}

/* ---------- Explorer — magnifier + spark ---------- */
export function ExploreIcon({ active = false }: IconProps) {
  const outline = (
    <Svg>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M15.8 15.8 L20 20" />
      <path d="M11 8 L11.8 10.2 L14 11 L11.8 11.8 L11 14 L10.2 11.8 L8 11 L10.2 10.2 Z" opacity={0.7} />
      <GoldPlus />
    </Svg>
  );
  const filled = (
    <Svg>
      <circle cx="11" cy="11" r="6.5" fill="var(--accent)" stroke="var(--accent)" />
      <path d="M15.8 15.8 L20 20" stroke="var(--accent)" strokeWidth={2.2} />
      <path
        d="M11 7.5 L11.9 10.1 L14.5 11 L11.9 11.9 L11 14.5 L10.1 11.9 L7.5 11 L10.1 10.1 Z"
        fill="var(--primary-foreground)"
        stroke="none"
      />
      <GoldPlus />
    </Svg>
  );
  return <IconWrap active={active} outline={outline} filled={filled} />;
}

/* ---------- Activité — bell ---------- */
export function BellIcon({ active = false }: IconProps) {
  const outline = (
    <Svg>
      <path d="M6 16.5 Q5.5 16.5 5.5 16 Q7 14.5 7 12.5 V10.5 Q7 6.5 11 6.5 Q15 6.5 15 10.5 V12.5 Q15 14.5 16.5 16 Q16.5 16.5 16 16.5 Z" />
      <path d="M11 4.5 V6.5" />
      <path d="M9.5 19 Q10 20.5 11 20.5 Q12 20.5 12.5 19" />
      <GoldPlus />
    </Svg>
  );
  const filled = (
    <Svg>
      <path
        d="M6 16.5 Q5.5 16.5 5.5 16 Q7 14.5 7 12.5 V10.5 Q7 6.5 11 6.5 Q15 6.5 15 10.5 V12.5 Q15 14.5 16.5 16 Q16.5 16.5 16 16.5 Z"
        fill="var(--accent)"
        stroke="var(--accent)"
      />
      <path d="M11 4.5 V6.5" stroke="var(--accent)" />
      <path d="M9.5 19 Q10 20.5 11 20.5 Q12 20.5 12.5 19" stroke="var(--accent)" />
      <GoldPlus />
    </Svg>
  );
  return <IconWrap active={active} outline={outline} filled={filled} />;
}

/* ---------- Profil — clean person silhouette ---------- */
export function PersonIcon({ active = false }: IconProps) {
  const outline = (
    <Svg>
      <circle cx="11" cy="8.5" r="3.2" />
      <path d="M4.5 19 Q4.5 13.8 11 13.8 Q17.5 13.8 17.5 19" />
      <GoldPlus />
    </Svg>
  );
  const filled = (
    <Svg>
      <circle cx="11" cy="8.5" r="3.2" fill="var(--accent)" stroke="var(--accent)" />
      <path
        d="M4.5 19.2 Q4.5 13.6 11 13.6 Q17.5 13.6 17.5 19.2 Z"
        fill="var(--accent)"
        stroke="var(--accent)"
      />
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
