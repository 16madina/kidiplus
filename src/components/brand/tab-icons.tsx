// Custom brand icons for the bottom tab bar.
//
// Luxury maison set: boutique arch (Accueil), facet compass (Explorer),
// refined bell (Activité), signet medallion (Profil). Outline when idle,
// gold-filled when active. The raised Live badge is a separate PNG asset
// and is never drawn here.
import { motion, AnimatePresence } from "framer-motion";

type IconProps = {
  active?: boolean;
  size?: number;
  className?: string;
};

const STROKE = 1.45;

function Svg({
  children,
  size = 24,
  className,
  filled = false,
}: {
  children: React.ReactNode;
  size?: number;
  className?: string;
  filled?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={filled ? 1.2 : STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
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

/* ---------- Accueil — boutique maison (arched storefront + step) ---------- */
export function HomeIcon({ active = false }: IconProps) {
  // Soft Roman arch with a thin inner reveal and a quiet threshold —
  // reads as a boutique doorway, not a generic home glyph.
  const outer =
    "M4.5 20.5 V10.2 C4.5 6.2 7.6 3.4 12 3.4 C16.4 3.4 19.5 6.2 19.5 10.2 V20.5";
  const inner =
    "M7.6 20.5 V10.6 C7.6 7.85 9.5 5.9 12 5.9 C14.5 5.9 16.4 7.85 16.4 10.6 V20.5";
  const step = "M3.2 20.5 H20.8";
  const outline = (
    <Svg>
      <path d={outer} />
      <path d={inner} opacity={0.85} />
      <path d={step} />
      <circle cx="14.2" cy="14.2" r="0.55" fill="currentColor" stroke="none" />
    </Svg>
  );
  const filled = (
    <Svg filled>
      <path
        d="M4.5 20.5 V10.2 C4.5 6.2 7.6 3.4 12 3.4 C16.4 3.4 19.5 6.2 19.5 10.2 V20.5 H4.5 Z"
        fill="var(--accent)"
        stroke="var(--accent)"
      />
      <path
        d="M7.6 20.5 V10.6 C7.6 7.85 9.5 5.9 12 5.9 C14.5 5.9 16.4 7.85 16.4 10.6 V20.5"
        fill="var(--background)"
        stroke="var(--accent)"
      />
      <path d={step} stroke="var(--accent)" />
      <circle cx="14.2" cy="14.2" r="0.65" fill="var(--accent)" stroke="none" />
    </Svg>
  );
  return <IconWrap active={active} outline={outline} filled={filled} />;
}

/* ---------- Explorer — jewel compass (dial + north facet) ---------- */
export function ExploreIcon({ active = false }: IconProps) {
  // Circular dial with a diamond needle — discovery of pieces, not a map pin.
  const needle = "M12 5.2 L13.55 12 L12 18.8 L10.45 12 Z";
  const cross = "M5.2 12 L12 10.45 L18.8 12 L12 13.55 Z";
  const outline = (
    <Svg>
      <circle cx="12" cy="12" r="8.1" />
      <circle cx="12" cy="12" r="5.6" opacity={0.55} />
      <path d={needle} />
      <path d={cross} opacity={0.9} />
      <circle cx="12" cy="12" r="1.05" fill="currentColor" stroke="none" />
      {/* Tiny north tick */}
      <path d="M12 2.6 V3.8" />
    </Svg>
  );
  const filled = (
    <Svg filled>
      <circle
        cx="12"
        cy="12"
        r="8.1"
        fill="var(--accent)"
        stroke="var(--accent)"
      />
      <circle
        cx="12"
        cy="12"
        r="5.5"
        fill="none"
        stroke="var(--primary-foreground)"
        strokeWidth={1}
        opacity={0.35}
      />
      <path
        d={needle}
        fill="var(--primary-foreground)"
        stroke="var(--primary-foreground)"
        strokeWidth={0.7}
      />
      <path
        d={cross}
        fill="var(--primary-foreground)"
        stroke="var(--primary-foreground)"
        strokeWidth={0.7}
        opacity={0.92}
      />
      <circle cx="12" cy="12" r="1.05" fill="var(--accent)" stroke="none" />
      <path d="M12 2.6 V3.8" stroke="var(--accent)" />
    </Svg>
  );
  return <IconWrap active={active} outline={outline} filled={filled} />;
}

/* ---------- Activité — refined alert bell (kept export name BellIcon) ---------- */
export function BellIcon({ active = false }: IconProps) {
  // Soft couture bell + gentle clapper — notifications without the loud
  // emoji-style glyph. A quiet pearl marks the active state.
  const dome =
    "M7.2 10.2 C7.2 7.1 9.2 4.6 12 4.6 C14.8 4.6 16.8 7.1 16.8 10.2 V13.6 L18.4 16.2 H5.6 L7.2 13.6 Z";
  const lip = "M8.4 16.2 H15.6";
  const outline = (
    <Svg>
      <path d={dome} />
      <path d={lip} />
      <path d="M10.6 18.2 Q12 19.4 13.4 18.2" />
      <path d="M12 3.2 V4.4" />
    </Svg>
  );
  const filled = (
    <Svg filled>
      <path d={dome} fill="var(--accent)" stroke="var(--accent)" />
      <path d={lip} stroke="var(--accent)" />
      <path
        d="M10.6 18.2 Q12 19.4 13.4 18.2"
        fill="var(--accent)"
        stroke="var(--accent)"
      />
      <path d="M12 3.2 V4.4" stroke="var(--accent)" />
      <circle
        cx="16.6"
        cy="7.2"
        r="2"
        fill="var(--accent)"
        stroke="var(--background)"
        strokeWidth={1.2}
      />
    </Svg>
  );
  return <IconWrap active={active} outline={outline} filled={filled} />;
}

/* ---------- Profil — signet medallion (double rim + bust) ---------- */
export function PersonIcon({ active = false }: IconProps) {
  // Jewelry-like signet: outer gold ring, inner rim, dark silhouette.
  const head =
    "M12 10.1 m -2.35 0 a 2.35 2.35 0 1 0 4.7 0 a 2.35 2.35 0 1 0 -4.7 0";
  const bust = "M7 18.2 Q7.9 14.1 12 14.1 Q16.1 14.1 17 18.2 Z";
  const outline = (
    <Svg>
      <circle cx="12" cy="12" r="8.35" />
      <circle cx="12" cy="12" r="6.7" opacity={0.55} />
      <path d={head} fill="currentColor" stroke="none" />
      <path d={bust} fill="currentColor" stroke="none" />
    </Svg>
  );
  const filled = (
    <Svg filled>
      <circle
        cx="12"
        cy="12"
        r="8.35"
        fill="var(--accent)"
        stroke="var(--accent)"
      />
      <circle
        cx="12"
        cy="12"
        r="6.55"
        fill="none"
        stroke="var(--primary-foreground)"
        strokeWidth={0.9}
        opacity={0.28}
      />
      <path
        d={head}
        fill="var(--primary-foreground)"
        stroke="var(--primary-foreground)"
        strokeWidth={0.4}
      />
      <path
        d={bust}
        fill="var(--primary-foreground)"
        stroke="var(--primary-foreground)"
        strokeWidth={0.4}
      />
    </Svg>
  );
  return <IconWrap active={active} outline={outline} filled={filled} />;
}

/* ---------- Go Live — broadcast waves (unused by the raised logo badge) ---------- */
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
