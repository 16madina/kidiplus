import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useMotionValue, animate } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { Press } from "./press";
import { EASE_IOS } from "@/lib/motion";

// ---------------------------------------------------------------------------
// Global stack of open PushScreens.
//
// 1) Android hardware back can close the TOP screen instead of switching tabs
//    under a stack of overlays (which looked like "back → wrong page").
// 2) Back taps are debounced across screens: the back chevrons of stacked
//    screens sit at the exact same spot, so a double-tap during the 300ms exit
//    animation used to close BOTH screens (order detail → straight to profile).
// ---------------------------------------------------------------------------
type StackEntry = { id: number; zIndex: number; close: () => void };
const pushStack: StackEntry[] = [];
let nextStackId = 1;
let lastBackAt = 0;

function guardBack(): boolean {
  const now = Date.now();
  if (now - lastBackAt < 400) return false;
  lastBackAt = now;
  return true;
}

/** Close the top-most open PushScreen. Returns false when none is open. */
export function closeTopPushScreen(): boolean {
  if (pushStack.length === 0) return false;
  const top = pushStack.reduce((a, b) =>
    b.zIndex > a.zIndex || (b.zIndex === a.zIndex && b.id > a.id) ? b : a,
  );
  if (!guardBack()) return true; // swallowed: a screen is already closing
  top.close();
  return true;
}

// Reusable push-from-right screen with left-edge swipe-back.
export function PushScreen({
  open,
  onClose,
  title,
  right,
  children,
  zIndex = 70,
  /** Disable edge swipe-back while a modal/sheet is open on top. */
  swipeBackEnabled = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  right?: ReactNode;
  children: ReactNode;
  zIndex?: number;
  swipeBackEnabled?: boolean;
}) {
  const [mountedKey] = useState(0);
  const x = useMotionValue(0);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const entry: StackEntry = {
      id: nextStackId++,
      zIndex,
      close: () => onCloseRef.current(),
    };
    pushStack.push(entry);
    return () => {
      const i = pushStack.indexOf(entry);
      if (i >= 0) pushStack.splice(i, 1);
    };
  }, [open, zIndex]);

  const requestClose = () => {
    if (!guardBack()) return;
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key={`push-${mountedKey}`}
          className="fixed inset-0 flex flex-col overflow-hidden bg-background"
          style={{ x, zIndex }}
          initial={{ x: "100%" }}
          animate={{ x: 0 }}
          exit={{ x: "100%" }}
          transition={{ duration: 0.3, ease: EASE_IOS }}
        >
          {/* left-edge back swipe */}
          {swipeBackEnabled ? (
            <motion.div
              className="absolute inset-y-0 left-0 z-40 w-5"
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={{ left: 0, right: 0.6 }}
              onDrag={(_, i) => x.set(Math.max(0, i.offset.x))}
              onDragEnd={(_, i) => {
                if (i.offset.x > 100 || i.velocity.x > 500) requestClose();
                else animate(x, 0, { duration: 0.22, ease: EASE_IOS });
              }}
            />
          ) : null}

          <header
            className="relative z-30 shrink-0 pt-safe"
            style={{
              backgroundColor: "color-mix(in oklch, var(--background) 90%, transparent)",
              backdropFilter: "saturate(180%) blur(18px)",
              WebkitBackdropFilter: "saturate(180%) blur(18px)",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div className="flex items-center gap-2 px-2 py-1.5">
              <Press
                aria-label="Retour"
                onClick={requestClose}
                className="h-10 w-10 rounded-full text-foreground"
              >
                <ChevronLeft size={24} strokeWidth={2.2} />
              </Press>
              <h1 className="min-w-0 flex-1 truncate text-center text-[15px] font-bold">{title}</h1>
              <div className="flex h-10 min-w-10 items-center justify-end">{right}</div>
            </div>
          </header>

          <div
            className="min-h-0 flex-1 overflow-y-auto"
            style={{
              WebkitOverflowScrolling: "touch",
              overscrollBehavior: "contain",
            }}
          >
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
