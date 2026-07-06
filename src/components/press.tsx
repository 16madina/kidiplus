import { motion, type HTMLMotionProps } from "framer-motion";
import { forwardRef } from "react";
import { EASE_IOS } from "@/lib/motion";

// A tap target that presses to scale 0.97 with subtle opacity, springing back.
// Use in place of <button> for any tappable element in the app.
type PressProps = HTMLMotionProps<"button"> & {
  as?: "button" | "div";
};

export const Press = forwardRef<HTMLButtonElement, PressProps>(function Press(
  { className = "", children, ...rest },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileTap={{ scale: 0.97, opacity: 0.85 }}
      transition={{ duration: 0.1, ease: EASE_IOS }}
      className={`tap inline-flex select-none items-center justify-center outline-none ${className}`}
      {...rest}
    >
      {children}
    </motion.button>
  );
});
