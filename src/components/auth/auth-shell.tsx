import { motion, type PanInfo } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (!onBack) return;
    // iOS-style swipe-right anywhere on the screen to go back.
    if (info.offset.x > 80 && info.velocity.x > -50) {
      onBack();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.28, ease: EASE_IOS }}
      drag={onBack ? "x" : false}
      dragDirectionLock
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={{ left: 0, right: 0.35 }}
      onDragEnd={handleDragEnd}
      className="flex h-full flex-col bg-background pt-safe"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        {onBack ? (
          <Press
            onClick={onBack}
            aria-label={t("common.back")}
            className="!min-h-11 inline-flex h-11 items-center gap-1 rounded-full pl-1.5 pr-3 text-[15px] font-semibold text-foreground"
          >
            <ChevronLeft size={24} strokeWidth={2.2} />
            <span>{t("common.back")}</span>
          </Press>
        ) : (
          <span className="h-11 w-11" />
        )}
        <h1 className="ml-auto mr-2 text-[17px] font-semibold">{title}</h1>
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
        className={`w-full rounded-2xl border bg-card px-4 text-[15px] text-foreground caret-foreground placeholder:text-muted-foreground outline-none transition-colors ${
          error ? "border-[oklch(0.62_0.24_20)]" : "border-border focus:border-foreground/40"
        }`}
        style={{ height: 48, color: "var(--foreground)", WebkitTextFillColor: "var(--foreground)" }}
      />
      {error && (
        <span className="mt-1 block text-[12px] font-medium text-[oklch(0.6_0.24_27)]">
          {error}
        </span>
      )}
    </label>
  );
}
