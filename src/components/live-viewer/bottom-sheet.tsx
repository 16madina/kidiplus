import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion, useDragControls } from "framer-motion";
import { EASE_IOS } from "@/lib/motion";
import { guardBack, registerOverlay } from "@/components/push-screen";

// Reusable bottom sheet with drag-to-dismiss (handle only) and dimmed backdrop.
// Registered on the global overlay stack so hardware/system back closes the
// sheet first, and backdrop dismiss arms guardBack to block click-through onto
// PushScreen chevrons underneath (classic "sheet → skipped to profile").
export function BottomSheet({
  open,
  onClose,
  children,
  heightPercent = 75,
  /** Above PushScreen (70) by default so forms aren't trapped under the shop page. */
  zIndex = 90,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  heightPercent?: number;
  zIndex?: number;
}) {
  const dragControls = useDragControls();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    return registerOverlay(() => onCloseRef.current(), zIndex);
  }, [open, zIndex]);

  const requestClose = () => {
    if (!guardBack()) return;
    onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0" style={{ zIndex }}>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={requestClose}
            className="absolute inset-0"
            style={{ backgroundColor: "rgba(0,0,0,0.5)" }}
          />
          <motion.div
            key="sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.3, ease: EASE_IOS }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.55 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 500) requestClose();
            }}
            className="absolute inset-x-0 bottom-0 flex flex-col rounded-t-3xl bg-background pb-safe"
            style={{
              height: `${heightPercent}dvh`,
              boxShadow: "0 -10px 40px rgba(0,0,0,0.35)",
            }}
          >
            {/* Drag only from the grabber — scrolling the form must not close the sheet. */}
            <div
              className="grid shrink-0 touch-none place-items-center pt-2.5 pb-1"
              onPointerDown={(e) => dragControls.start(e)}
              aria-hidden
            >
              <span className="h-1 w-10 rounded-full bg-muted-foreground/40" />
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
              style={{ WebkitOverflowScrolling: "touch" }}
            >
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
