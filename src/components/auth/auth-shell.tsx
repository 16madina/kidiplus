import { motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Press } from "@/components/press";
import { EASE_IOS } from "@/lib/motion";

export function AuthScreenShell({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack?: () => void;
  children: ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.28, ease: EASE_IOS }}
      className="flex h-full flex-col bg-background pt-safe"
    >
      <div className="flex items-center gap-1 px-2 py-2">
        {onBack ? (
          <Press
            onClick={onBack}
            aria-label="Retour"
            className="!min-h-10 !min-w-10 h-10 w-10 rounded-full"
          >
            <ChevronLeft size={22} />
          </Press>
        ) : (
          <span className="h-10 w-10" />
        )}
        <h1 className="text-[17px] font-semibold">{title}</h1>
      </div>
      <div
        className="flex-1 overflow-y-auto px-6 pb-6"
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {children}
      </div>
    </motion.div>
  );
}

export function AuthInput({
  label,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string | null;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <input
        {...props}
        className={`w-full rounded-2xl border bg-card px-4 text-[15px] outline-none transition-colors ${
          error ? "border-[oklch(0.62_0.24_20)]" : "border-border focus:border-foreground/40"
        }`}
        style={{ height: 48 }}
      />
      {error && (
        <span className="mt-1 block text-[12px] font-medium text-[oklch(0.6_0.24_27)]">
          {error}
        </span>
      )}
    </label>
  );
}
