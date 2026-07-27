/**
 * Signal LiveKit Web Egress to begin capture.
 * Egress watches the Chrome console for the literal string START_RECORDING
 * (see @livekit/egress-sdk EgressHelper.startRecording).
 * window.startRecording is NOT the contract — console.log is.
 */
export function signalLivekitEgressStartRecording(): void {
  try {
    // Exact token egress scrapes from Chrome logs:
    console.log("START_RECORDING");
  } catch {
    /* ignore */
  }
  try {
    // Some older templates also expose this; harmless if missing.
    const w = window as Window & { startRecording?: () => void };
    w.startRecording?.();
  } catch {
    /* ignore */
  }
}

export function signalLivekitEgressEndRecording(): void {
  try {
    console.log("END_RECORDING");
  } catch {
    /* ignore */
  }
}
