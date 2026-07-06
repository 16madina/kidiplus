import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";
import { EASE_IOS } from "@/lib/motion";

// Reusable bottom sheet with drag-to-dismiss and dimmed backdrop.
export function BottomSheet({
  open,
  onClose,
  children,
  heightPercent = 75,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  heightPercent?: number;
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[70]">
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
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
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 500) onClose();
            }}
            className="absolute inset-x-0 bottom-0 flex flex-col rounded-t-3xl bg-background pb-safe"
            style={{
              height: `${heightPercent}dvh`,
              boxShadow: "0 -10px 40px rgba(0,0,0,0.35)",
            }}
          >
            <div className="grid place-items-center pt-2.5 pb-1">
              <span className="h-1 w-10 rounded-full bg-muted-foreground/40" />
            </div>
            <div className="flex-1 overflow-y-auto">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
