// Vitrine sound: TikTok-style. No in-feed mute button — volume is the phone's.
// Browsers may start muted; the first swipe/tap unlocks sound for the session.

import { useEffect, useState } from "react";

const KEY = "vitrine_sound_on";
const EVT = "vitrine-sound-change";

let soundOn = false;
if (typeof window !== "undefined") {
  try {
    soundOn = window.localStorage.getItem(KEY) === "1";
  } catch {
    /* ignore */
  }
}

export function getVitrineSoundOn(): boolean {
  return soundOn;
}

export function setVitrineSoundOn(on: boolean) {
  soundOn = on;
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
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

/** Returns [muted]. */
export function useVitrineSound(): [boolean] {
  const [on, setOn] = useState(false);

  useEffect(() => {
    tryUnlockVitrineSoundFromGesture();
    setOn(getVitrineSoundOn());
    const h = () => setOn(getVitrineSoundOn());
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, []);

  return [!on];
}
