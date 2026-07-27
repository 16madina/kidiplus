// Short auctioneer-style "ding ding ding" when an item is sold.
// Web Audio only (no asset) so it works on KiDi+ app, web, and Web Egress
// (YouTube / Facebook capture the composition tab audio).

let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!sharedCtx || sharedCtx.state === "closed") {
    sharedCtx = new AC();
  }
  return sharedCtx;
}

function tone(
  ctx: AudioContext,
  freq: number,
  start: number,
  duration: number,
  peak = 0.28,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.018);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

/** Three bright dings — classic “sold!” cue. Safe to call often; no-ops if blocked. */
export function playAuctionSoldChime(): void {
  try {
    const ctx = getCtx();
    if (!ctx) return;
    void ctx.resume().then(() => {
      const t0 = ctx.currentTime + 0.02;
      // Rising ding-ding-ding
      tone(ctx, 988, t0, 0.28, 0.32); // B5
      tone(ctx, 1319, t0 + 0.16, 0.28, 0.3); // E6
      tone(ctx, 1568, t0 + 0.32, 0.42, 0.34); // G6
      // Soft sparkle over the last ding
      tone(ctx, 2093, t0 + 0.34, 0.35, 0.12); // C7
    });
  } catch {
    /* autoplay / AudioContext blocked — ignore */
  }
}
