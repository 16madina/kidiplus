// Safe haptics wrapper. All calls no-op on web / SSR.
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

function native(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

export const haptic = {
  light() {
    if (!native()) return;
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
  },
  medium() {
    if (!native()) return;
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
  },
  heavy() {
    if (!native()) return;
    Haptics.impact({ style: ImpactStyle.Heavy }).catch(() => {});
  },
  success() {
    if (!native()) return;
    Haptics.notification({ type: NotificationType.Success }).catch(() => {});
  },
  warning() {
    if (!native()) return;
    Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
  },
  error() {
    if (!native()) return;
    Haptics.notification({ type: NotificationType.Error }).catch(() => {});
  },
  selection() {
    if (!native()) return;
    Haptics.selectionChanged().catch(() => {});
  },
};

export const isNative = native;
