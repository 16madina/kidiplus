import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useTransform,
  animate,
} from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { Press } from "./press";
import { EASE_IOS } from "@/lib/motion";


// ---------------------------------------------------------------------------
// Global stack of open overlays (PushScreens + BottomSheets).
//
// 1) Android hardware back closes the TOP overlay instead of switching tabs.
// 2) Back taps are debounced: stacked headers share the same chevron spot, so
//    a double-tap (or click-through after closing a sheet) used to skip pages.
// 3) PushScreens portal to document.body so a nested screen (e.g. invoice
//    inside order detail) is not trapped by parent transform/overflow — that
//    used to leave a dead back chevron on the buried parent header.
// ---------------------------------------------------------------------------
type StackEntry = { id: number; zIndex: number; close: () => void };
const overlayStack: StackEntry[] = [];
let nextStackId = 1;
let lastBackAt = 0;

/** Debounce back actions across all overlays (~exit animation + ghost clicks). */
export function guardBack(ms = 450): boolean {
  const now = Date.now();
  if (now - lastBackAt < ms) return false;
  lastBackAt = now;
  return true;
}

/** Register an overlay; returns unregister. Call while the overlay is open. */
export function registerOverlay(close: () => void, zIndex: number): () => void {
  const entry: StackEntry = { id: nextStackId++, zIndex, close };
  overlayStack.push(entry);
  return () => {
    const i = overlayStack.indexOf(entry);
    if (i >= 0) overlayStack.splice(i, 1);
  };
}

function topOverlay(): StackEntry | null {
  if (overlayStack.length === 0) return null;
  return overlayStack.reduce((a, b) =>
    b.zIndex > a.zIndex || (b.zIndex === a.zIndex && b.id > a.id) ? b : a,
  );
}

/** Close the top-most open overlay. Returns false when none is open. */
export function closeTopPushScreen(): boolean {
  const top = topOverlay();
  if (!top) return false;
  if (!guardBack()) return true; // swallowed: something is already closing
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
  // Dim + parallax of the screen underneath follow the swipe progress.
  const dimOpacity = useTransform(x, [0, 400], [0.32, 0]);
  const shadowOpacity = useTransform(x, [0, 400], [0.25, 0]);
  const entryIdRef = useRef<number | null>(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) {
      entryIdRef.current = null;
      return;
    }
    const entry: StackEntry = {
      id: nextStackId++,
      zIndex,
      close: () => onCloseRef.current(),
    };
    entryIdRef.current = entry.id;
    overlayStack.push(entry);
    const detachWebBack = attachWebBack();
    return () => {
      const i = overlayStack.indexOf(entry);
      if (i >= 0) overlayStack.splice(i, 1);
      if (entryIdRef.current === entry.id) entryIdRef.current = null;
      detachWebBack();
    };
  }, [open, zIndex]);

  const requestClose = () => {
    if (!guardBack()) return;
    // Always dismiss the top-most overlay. If a buried header was somehow
    // tapped while a child (invoice) is open, close the child — never no-op.
    const top = topOverlay();
    if (top) {
      top.close();
      return;
    }
    onClose();
  };

  const node =
    typeof document !== "undefined" ? (
      <AnimatePresence>
        {open && (
          <motion.div key={`push-dim-${mountedKey}`} className="fixed inset-0 bg-black"
            style={{ opacity: dimOpacity, zIndex: zIndex - 1 }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.32 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE_IOS }}
          />
        )}
        {open && (
          <motion.div
            key={`push-${mountedKey}`}
            className="fixed inset-0 flex flex-col overflow-hidden bg-background"
            style={{
              x,
              zIndex,
              boxShadow: "-12px 0 32px rgba(0,0,0,0.18)",
              opacity: 1,
              ["--kp-push-shadow" as string]: shadowOpacity,
            }}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.3, ease: EASE_IOS }}
          >
            {swipeBackEnabled ? (
              <motion.div
                className="absolute inset-y-0 left-0 z-40 w-7"
                style={{ touchAction: "pan-y" }}
                drag="x"
                dragConstraints={{ left: 0, right: 0 }}
                dragElastic={{ left: 0, right: 0.85 }}
                dragMomentum={false}
                onDrag={(_, i) => x.set(Math.max(0, i.offset.x))}
                onDragEnd={(_, i) => {
                  if (i.offset.x > 90 || i.velocity.x > 450) {
                    animate(x, window.innerWidth, {
                      duration: 0.18,
                      ease: EASE_IOS,
                    });
                    requestClose();
                  } else {
                    animate(x, 0, { duration: 0.22, ease: EASE_IOS });
                  }
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
                <h1 className="min-w-0 flex-1 truncate text-center text-[15px] font-bold">
                  {title}
                </h1>
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
    ) : null;

  if (typeof document === "undefined" || !node) return null;
  return createPortal(node, document.body);
}
