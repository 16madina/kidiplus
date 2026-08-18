import { useState } from "react";
import { DefiPlusIntroOverlay } from "./defi-plus-intro-overlay";

export function DefiPlusPreviewStage() {
  const [playId, setPlayId] = useState(1);
  const [done, setDone] = useState(false);

  const replay = () => {
    setDone(false);
    setPlayId((n) => n + 1);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#07090f] px-4 py-6">
      <p className="mb-3 text-center text-[11px] uppercase tracking-[0.22em] text-white/45">
        Aperçu — overlay Défi Plus
      </p>

      <div
        className="relative w-full max-w-[390px] overflow-hidden rounded-[28px] border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        style={{ aspectRatio: "9 / 16" }}
      >
        <SplitLiveMock />
        <DefiPlusIntroOverlay
          key={playId}
          active
          leftName="DINASTAR"
          rightName="DEENA"
          onComplete={() => setDone(true)}
        />
        {done && (
          <div className="absolute inset-x-0 bottom-16 z-40 flex justify-center">
            <button
              type="button"
              onClick={replay}
              className="rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black shadow-lg"
            >
              Rejouer
            </button>
          </div>
        )}
      </div>

      <p className="mt-4 max-w-[390px] text-center text-xs leading-relaxed text-white/40">
        Overlay transparent — les deux lives restent visibles derrière. Rejouer pour revoir.
      </p>
    </div>
  );
}

function SplitLiveMock() {
  return (
    <div className="absolute inset-0 flex bg-black">
      <SellerPane
        name="DINASTAR"
        accent="#1d4ed8"
        glow="rgba(37, 99, 235, 0.5)"
        from="#1e3a8a"
        to="#0f172a"
      />
      <SellerPane
        name="DEENA"
        accent="#ca8a04"
        glow="rgba(234, 179, 8, 0.45)"
        from="#854d0e"
        to="#1c1917"
        alignRight
      />

      <div className="absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-center backdrop-blur-sm">
        <p className="text-[10px] font-semibold text-white/90">11:42</p>
        <p className="text-[9px] text-white/60">Qui vend plus?</p>
      </div>

      <div className="absolute inset-x-3 bottom-3 z-10 flex items-center gap-2 rounded-2xl bg-black/55 px-3 py-2 backdrop-blur-sm">
        <div className="h-10 w-10 shrink-0 rounded-lg bg-gradient-to-br from-amber-200 to-rose-300" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-white">Perruque</p>
          <p className="text-[11px] text-white/70">$1,000.00</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-black">
          Démarrer
        </span>
      </div>
    </div>
  );
}

function SellerPane({
  name,
  accent,
  glow,
  from,
  to,
  alignRight,
}: {
  name: string;
  accent: string;
  glow: string;
  from: string;
  to: string;
  alignRight?: boolean;
}) {
  return (
    <div className="relative h-full w-1/2 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 50% 38%, ${glow}, transparent 42%), linear-gradient(160deg, ${from}, ${to})`,
        }}
      />
      <div className="absolute left-1/2 top-[38%] flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-3xl font-black text-white/80 ring-2 ring-white/25">
        {name.slice(0, 1)}
      </div>
      <div
        className={`absolute top-3 flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold text-white ${
          alignRight ? "right-2" : "left-2"
        }`}
        style={{ background: accent }}
      >
        {name}
        <span className="font-medium opacity-80">$0.00</span>
      </div>
    </div>
  );
}
