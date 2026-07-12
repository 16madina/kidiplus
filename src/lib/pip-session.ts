// Shared flags so LiveKit can stay connected while Android system PiP
// is active — and during the brief race where Cap reports inactive
// before onPictureInPictureModeChanged fires.
import { useSyncExternalStore } from "react";

let inSystemPip = false;
let pipHold = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function getInSystemPip(): boolean {
  return inSystemPip;
}

export function setInSystemPip(active: boolean): void {
  if (inSystemPip === active) return;
  inSystemPip = active;
  emit();
}

/** True while an Android live session should survive backgrounding (PiP eligible). */
export function getPipHold(): boolean {
  return pipHold;
}

export function setPipHold(hold: boolean): void {
  if (pipHold === hold) return;
  pipHold = hold;
  emit();
}

function subscribe(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function useInSystemPip(): boolean {
  return useSyncExternalStore(subscribe, getInSystemPip, () => false);
}

export function usePipHold(): boolean {
  return useSyncExternalStore(subscribe, getPipHold, () => false);
}

/** Keep media/session alive when foreground, in PiP, or PiP-eligible live open. */
export function useMediaSessionActive(appActive: boolean): boolean {
  const inPip = useInSystemPip();
  const hold = usePipHold();
  return appActive || inPip || hold;
}
