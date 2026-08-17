// Vitrine sound: TikTok-style. No in-feed mute button — volume is the phone's.
// Browsers may start muted; the first swipe/tap unlocks sound for the session.

import { useEffect, useState } from "react";

const EVT = "vitrine-sound-change";

// Autoplay permission is granted by the browser for the current page lifecycle,
// not permanently. Restoring a previous "sound on" value makes a fresh iOS /
// Android session unmute before it has received a gesture, which cancels play().
let soundOn = false;

export function getVitrineSoundOn(): boolean {
  return soundOn;
}

export function setVitrineSoundOn(on: boolean) {
  soundOn = on;
  try {
    window.dispatchEvent(new CustomEvent(EVT));
  } catch {
    /* ignore */
  }
}

/** First swipe / tap on the feed — enable sound like TikTok. */
export function unlockVitrineSound() {
  if (soundOn) return;
  setVitrineSoundOn(true);
}

export function tryUnlockVitrineSoundFromGesture() {
  try {
    const ua = navigator.userActivation;
    if (ua?.hasBeenActive || ua?.isActive) unlockVitrineSound();
  } catch {
    /* ignore */
  }
}

/** Returns [muted, toggleMuted]. */
export function useVitrineSound(): [boolean, () => void] {
  const [on, setOn] = useState(false);

  useEffect(() => {
    tryUnlockVitrineSoundFromGesture();
    setOn(getVitrineSoundOn());
    const h = () => setOn(getVitrineSoundOn());
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, []);

  const toggle = () => setVitrineSoundOn(!getVitrineSoundOn());

  return [!on, toggle];
}
