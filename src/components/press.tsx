import { motion, type HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";
import { EASE_IOS } from "@/lib/motion";
import { haptic } from "@/lib/haptics";

// A tap target that presses to scale 0.97 with subtle opacity, springing back.
// Also triggers a light haptic on native platforms (no-op on web).
type PressProps = HTMLMotionProps<"button"> & {
  as?: "button" | "div";
  /** Set false to opt out of the default light haptic. */
  hapticOnTap?: boolean;
};

export const Press = forwardRef<HTMLButtonElement, PressProps>(function Press(
  { className = "", children, onClick, hapticOnTap = true, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.97, opacity: 0.85 }}
      transition={{ duration: 0.1, ease: EASE_IOS }}
      className={`tap inline-flex select-none items-center justify-center outline-none ${className}`}
      onClick={(e) => {
        if (hapticOnTap) haptic.light();
        onClick?.(e);
      }}
      {...rest}
    >
      {children}
    </motion.button>
  );
});
