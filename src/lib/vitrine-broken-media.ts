/**
 * Registre des médias Vitrine introuvables (404 / erreur de décodage).
 * Filet de sécurité : une publication dont tous les médias échouent est
 * retirée du feed au lieu de rester affichée en boucle de chargement.
 */

const EVT = "kidi:vitrine-broken-media";
const KEY = "vitrine_broken_media";

const broken = new Set<string>();

if (typeof window !== "undefined") {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) (JSON.parse(raw) as string[]).forEach((u) => broken.add(u));
  } catch {
    /* ignore */
  }
}

export function isBrokenMedia(url: string | null | undefined): boolean {
  return !!url && broken.has(url);
}

/** Toutes les URLs du média sont cassées → la publication est inaffichable. */
export function isPostMediaBroken(urls: string[] | null | undefined): boolean {
  if (!urls || urls.length === 0) return true;
  return urls.every((u) => broken.has(u));
}

export function reportBrokenMedia(url: string | null | undefined) {
  if (!url || broken.has(url)) return;
  broken.add(url);
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify([...broken]));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVT, { detail: { url } }));
  } catch {
    /* ignore */
  }
}

export function subscribeBrokenMedia(cb: () => void) {
  if (typeof window === "undefined") return () => undefined;
  const h = () => cb();
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
}
