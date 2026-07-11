// Tracks whether the on-screen keyboard is visible so chrome (tab bar) can
// get out of the way and never cover the focused input.
//
// - Native (iOS/Android via Capacitor): uses Keyboard plugin events.
// - Web: falls back to visualViewport height diff (>150px) which is a
//   reliable signal on mobile Safari and Chrome.
import { useEffect, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { Keyboard } from "@capacitor/keyboard";

export function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let native = false;
    try { native = Capacitor.isNativePlatform(); } catch {}

    if (native) {
      const subs: Array<{ remove: () => void }> = [];
      Keyboard.addListener("keyboardWillShow", () => setOpen(true)).then((s) => subs.push(s));
      Keyboard.addListener("keyboardDidShow", () => setOpen(true)).then((s) => subs.push(s));
      Keyboard.addListener("keyboardWillHide", () => setOpen(false)).then((s) => subs.push(s));
      Keyboard.addListener("keyboardDidHide", () => setOpen(false)).then((s) => subs.push(s));
      return () => { subs.forEach((s) => s.remove()); };
    }

    // Web fallback: watch visualViewport.
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!vv) return;
    const onResize = () => {
      const diff = window.innerHeight - vv.height;
      setOpen(diff > 150);
    };
    onResize();
    vv.addEventListener("resize", onResize);
    vv.addEventListener("scroll", onResize);
    return () => {
      vv.removeEventListener("resize", onResize);
      vv.removeEventListener("scroll", onResize);
    };
  }, []);

  return open;
}
