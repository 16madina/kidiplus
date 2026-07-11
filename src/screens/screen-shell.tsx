import type { ReactNode } from "react";

// Base screen container: safe-area top padding + consistent horizontal padding.
// Every screen composes this so we never render a blank white canvas.
export function ScreenShell({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div
      className="h-full overflow-y-auto pt-safe"
      style={{
        paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))",
        WebkitOverflowScrolling: "touch",
        overscrollBehavior: "contain",
      }}
    >
      <header className="px-5 pb-3 pt-3">
        <h1 className="text-[28px] font-bold tracking-tight">{title}</h1>
      </header>
      <div className="px-5">{children ?? <ScreenSkeleton />}</div>
    </div>
  );
}

// Default skeleton so no screen ever flashes blank white.
function ScreenSkeleton() {
  return (
    <div className="space-y-3">
      <div className="skeleton h-40 w-full" />
      <div className="skeleton h-5 w-2/3" />
      <div className="skeleton h-5 w-1/2" />
      <div className="grid grid-cols-2 gap-3 pt-2">
        <div className="skeleton aspect-square w-full" />
        <div className="skeleton aspect-square w-full" />
        <div className="skeleton aspect-square w-full" />
        <div className="skeleton aspect-square w-full" />
      </div>
    </div>
  );
}
