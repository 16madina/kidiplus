// Shared "sound on/off" preference for the Vitrine feed.
// Videos must start muted (browser autoplay policy), but once the user
// taps the speaker, every following video keeps the sound on.

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
  window.dispatchEvent(new CustomEvent(EVT));
}

/** Returns [muted, toggle]. */
export function useVitrineSound(): [boolean, () => void] {
  const [on, setOn] = useState(false);

  useEffect(() => {
    setOn(getVitrineSoundOn());
    const h = () => setOn(getVitrineSoundOn());
    window.addEventListener(EVT, h);
    return () => window.removeEventListener(EVT, h);
  }, []);

  return [!on, () => setVitrineSoundOn(!getVitrineSoundOn())];
}
