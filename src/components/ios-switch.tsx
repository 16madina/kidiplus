import { motion } from "framer-motion";
import { EASE_IOS } from "@/lib/motion";

export function IOSSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-[31px] w-[51px] shrink-0 items-center rounded-full outline-none"
      style={{
        backgroundColor: checked ? "oklch(0.72 0.18 145)" : "oklch(0.82 0.005 285)",
        transition: "background-color 200ms cubic-bezier(0.32, 0.72, 0, 1)",
      }}
    >
      <motion.span
        className="block h-[27px] w-[27px] rounded-full bg-white shadow-md"
        animate={{ x: checked ? 22 : 2 }}
        transition={{ type: "spring", stiffness: 500, damping: 32, mass: 0.7 }}
        style={{ boxShadow: "0 2px 4px rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.1)" }}
      />
      <span className="sr-only">{checked ? "activé" : "désactivé"}</span>
    </button>
  );
}

export const _ = EASE_IOS;
