import { useState } from "react";
import { BaobabGiftOverlay } from "./baobab-gift-overlay";

export function BaobabPreviewStage() {
  const [playId, setPlayId] = useState(1);
  const [done, setDone] = useState(false);

  const replay = () => {
    setDone(false);
    setPlayId((n) => n + 1);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#07090f] px-4 py-6">
      <p className="mb-3 text-center text-[11px] uppercase tracking-[0.22em] text-white/45">
        Aperçu — cadeau Baobab d’or
      </p>

      <div
        className="relative w-full max-w-[390px] overflow-hidden rounded-[28px] border border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.55)]"
        style={{ aspectRatio: "9 / 16" }}
      >
        <LiveMock />
        <BaobabGiftOverlay key={playId} active onComplete={() => setDone(true)} />
        {done && (
          <div className="absolute inset-x-0 bottom-16 z-40 flex justify-center">
            <button
              type="button"
              onClick={replay}
              className="pointer-events-auto rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-black shadow-lg"
            >
              Rejouer
            </button>
          </div>
        )}
      </div>

      <p className="mt-4 max-w-[390px] text-center text-xs leading-relaxed text-white/40">
        Pousse en 3 secondes, puis les feuilles s’endorment en tombant. Overlay transparent sur le live.
      </p>
    </div>
  );
}

function LiveMock() {
  return (
    <div className="absolute inset-0 bg-black">
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(circle at 50% 36%, rgba(37, 99, 235, 0.45), transparent 42%), linear-gradient(160deg, #1e3a8a, #0f172a)",
        }}
      />
      <div className="absolute left-1/2 top-[38%] flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-3xl font-black text-white/80 ring-2 ring-white/25">
        D
      </div>
      <div className="absolute left-3 top-3 rounded-full bg-blue-700 px-2 py-1 text-[10px] font-bold text-white">
        DINASTAR <span className="font-medium opacity-80">$0.00</span>
      </div>
      <div className="absolute inset-x-3 bottom-3 z-10 flex items-center gap-2 rounded-2xl bg-black/55 px-3 py-2 backdrop-blur-sm">
        <div className="h-10 w-10 shrink-0 rounded-lg bg-gradient-to-br from-amber-200 to-rose-300" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-medium text-white">Perruque</p>
          <p className="text-[11px] text-white/70">$1,000.00</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-[11px] font-semibold text-black">
          Enchérir
        </span>
      </div>
    </div>
  );
}
