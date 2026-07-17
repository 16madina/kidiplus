// Custom brand icons for the bottom tab bar.
//
// Distinct luxury set (clearly different silhouettes from the old arch /
// compass / gift / medallion): maison house, diamond loupe, sparkle alert,
// crest portrait. The raised Live badge is a separate PNG — never drawn here.
import { motion, AnimatePresence } from "framer-motion";

type IconProps = {
  active?: boolean;
  size?: number;
  className?: string;
};

const STROKE = 1.5;

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

/* ---------- Accueil — maison avec toit et porte (pas une arche) ---------- */
export function HomeIcon({ active = false }: IconProps) {
  const roof = "M3.5 11.2 L12 3.8 L20.5 11.2";
  const body = "M5.8 10.5 V19.8 H18.2 V10.5";
  const door = "M10.2 19.8 V14.4 H13.8 V19.8";
  const outline = (
    <Svg>
      <path d={roof} />
      <path d={body} />
      <path d={door} />
      {/* Petite cheminée — détail maison */}
      <path d="M16.2 7.2 V5.4 H17.8 V8.2" />
      <circle cx="12" cy="16.6" r="0.55" fill="currentColor" stroke="none" />
    </Svg>
  );
  const filled = (
    <Svg>
      <path
        d="M3.5 11.2 L12 3.8 L20.5 11.2 L18.2 11.2 V19.8 H5.8 V11.2 Z"
        fill="var(--accent)"
        stroke="var(--accent)"
      />
      <path
        d={door}
        fill="var(--background)"
        stroke="var(--background)"
        strokeWidth={1.2}
      />
      <path d="M16.2 7.2 V5.4 H17.8 V8.2" stroke="var(--accent)" />
      <circle cx="12.8" cy="16.6" r="0.55" fill="var(--accent)" stroke="none" />
    </Svg>
  );
  return <IconWrap active={active} outline={outline} filled={filled} />;
}

/* ---------- Explorer — loupe + diamant (pas une boussole) ---------- */
export function ExploreIcon({ active = false }: IconProps) {
  const glass = "M10.2 10.2 m -5.4 0 a 5.4 5.4 0 1 0 10.8 0 a 5.4 5.4 0 1 0 -10.8 0";
  const handle = "M14.2 14.2 L19.6 19.6";
  // Small cut diamond inside the lens
  const gem = "M10.2 7.4 L12.4 10.2 L10.2 13 L7.95 10.2 Z";
  const outline = (
    <Svg>
      <circle cx="10.2" cy="10.2" r="5.4" />
      <path d={handle} strokeWidth={1.9} />
      <path d={gem} />
    </Svg>
  );
  const filled = (
    <Svg>
      <circle
        cx="10.2"
        cy="10.2"
        r="5.4"
        fill="var(--accent)"
        stroke="var(--accent)"
      />
      <path d={handle} stroke="var(--accent)" strokeWidth={2} />
      <path
        d={gem}
        fill="var(--primary-foreground)"
        stroke="var(--primary-foreground)"
        strokeWidth={0.8}
      />
    </Svg>
  );
  return <IconWrap active={active} outline={outline} filled={filled} />;
}

/* ---------- Activité — éclat / sparkles (pas cadeau ni cloche classique) ---------- */
export function BellIcon({ active = false }: IconProps) {
  // Big 4-point spark + two satellite sparks — "something is happening".
  const main =
    "M12 3.2 L13.35 9.4 L19.5 10.75 L13.35 12.1 L12 18.3 L10.65 12.1 L4.5 10.75 L10.65 9.4 Z";
  const sparkA = "M18.2 4.2 L18.7 5.8 L20.3 6.3 L18.7 6.8 L18.2 8.4 L17.7 6.8 L16.1 6.3 L17.7 5.8 Z";
  const sparkB = "M6.4 15.6 L6.75 16.7 L7.85 17.05 L6.75 17.4 L6.4 18.5 L6.05 17.4 L4.95 17.05 L6.05 16.7 Z";
  const outline = (
    <Svg>
      <path d={main} />
      <path d={sparkA} />
      <path d={sparkB} />
    </Svg>
  );
  const filled = (
    <Svg>
      <path
        d={main}
        fill="var(--accent)"
        stroke="var(--accent)"
        strokeWidth={1}
      />
      <path
        d={sparkA}
        fill="var(--accent)"
        stroke="var(--accent)"
        strokeWidth={0.8}
      />
      <path
        d={sparkB}
        fill="var(--accent)"
        stroke="var(--accent)"
        strokeWidth={0.8}
      />
    </Svg>
  );
  return <IconWrap active={active} outline={outline} filled={filled} />;
}

/* ---------- Profil — blason / crest (pas un rond médaillon) ---------- */
export function PersonIcon({ active = false }: IconProps) {
  // Shield crest with bust — coat-of-arms feel.
  const shield =
    "M12 3.4 L19.2 6.2 V11.4 C19.2 16.2 16.1 19.6 12 20.6 C7.9 19.6 4.8 16.2 4.8 11.4 V6.2 Z";
  const head =
    "M12 9.6 m -2.2 0 a 2.2 2.2 0 1 0 4.4 0 a 2.2 2.2 0 1 0 -4.4 0";
  const bust = "M7.6 16.6 Q8.4 13.2 12 13.2 Q15.6 13.2 16.4 16.6";
  const outline = (
    <Svg>
      <path d={shield} />
      <path d={head} fill="currentColor" stroke="none" />
      <path d={bust} fill="currentColor" stroke="none" />
    </Svg>
  );
  const filled = (
    <Svg>
      <path d={shield} fill="var(--accent)" stroke="var(--accent)" />
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
