// Snap Camera Kit (Web SDK) — bootstrap + chargement des lenses + pipeline.
//
// Le SDK tourne en WebAssembly directement dans le navigateur / la WebView
// Capacitor : vrai suivi du visage, maquillage, masques 3D — le même moteur
// AR que l'app Snapchat. Pas de plugin natif nécessaire.
//
// Pipeline : caméra (MediaStreamTrack) → CameraKitSession (applique la lens,
// rend sur un <canvas>) → canvas.captureStream() → piste vidéo filtrée.
// - En preview (avant le live) : le canvas est affiché à la place du <video>.
// - En live : la piste filtrée remplace la piste caméra publiée sur LiveKit
//   via un TrackProcessor (voir camera-kit-processor.ts) — les viewers voient
//   le filtre en temps réel.
//
// Tokens : les tokens API Camera Kit sont des jetons clients publics (ils
// sont embarqués dans les apps mobiles de la même façon). Le token staging
// affiche un filigrane "Camera Kit Staging" ; après validation de l'app par
// Snap, basculer sur le token production (VITE_SNAP_CAMERA_KIT_API_TOKEN).

import type { CameraKit, CameraKitSession, Lens as SnapLens } from "@snap/camera-kit";

function readEnv(key: string): string {
  try {
    const v = (import.meta.env as Record<string, string | undefined>)[key];
    return (v ?? "").trim();
  } catch {
    return "";
  }
}

/**
 * Snap Camera Kit API token for the KiDi+ Web app.
 *
 * Paste the Staging token in .env / .env.production as
 * VITE_SNAP_CAMERA_KIT_API_TOKEN. The production token will be configured
 * later, once Snap approves Production Camera Kit status for kidiplus.com.
 */
export function snapApiToken(): string {
  return readEnv("VITE_SNAP_CAMERA_KIT_API_TOKEN");
}

export function isSnapProductionToken(): boolean {
  const t = snapApiToken();
  const payload = t.split(".")[1];
  if (!payload) return false;
  try {
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return json.includes("~PRODUCTION~");
  } catch {
    return false;
  }
}


/** Lens Group displayed in the Filters carousel — KiDi+ Web "test 1" group.
 * Add/remove lenses on my-lenses.snapchat.com ; they appear in-app without
 * code changes. Configure via VITE_SNAP_LENS_GROUP_ID. */
export const SNAP_LENS_GROUP_ID =
  readEnv("VITE_SNAP_LENS_GROUP_ID") || "df287f43-6646-4b01-a711-1a0e632c211a";

/** Unique groupe chargé par défaut. L'utilisateur ajoutera ses futurs filtres
 * directement dans ce groupe. Configurable via VITE_SNAP_LENS_GROUP_IDS
 * (liste séparée par des virgules) pour charger des groupes additionnels. */
export const SNAP_LENS_GROUP_IDS: string[] = Array.from(
  new Set(
    [
      SNAP_LENS_GROUP_ID,
      ...readEnv("VITE_SNAP_LENS_GROUP_IDS")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    ].filter(Boolean),
  ),
);

/** Supporté = WebGL2 + WebAssembly + un token Camera Kit configuré.
 * Si le token est vide, le carrousel tombe automatiquement sur les filtres CSS. */
export function isCameraKitSupported(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof WebAssembly === "undefined") return false;
  if (!snapApiToken()) return false;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    return !!gl;
  } catch {
    return false;
  }
}

let bootstrapPromise: Promise<CameraKit> | null = null;

/** Bootstrap paresseux (télécharge le runtime WASM au premier appel).
 * Nécessite que VITE_SNAP_CAMERA_KIT_API_TOKEN soit renseigné. */
export function getCameraKit(): Promise<CameraKit> {
  const token = snapApiToken();
  if (!token) {
    return Promise.reject(
      new Error("VITE_SNAP_CAMERA_KIT_API_TOKEN is not configured"),
    );
  }
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      const { bootstrapCameraKit } = await import("@snap/camera-kit");
      return bootstrapCameraKit({ apiToken: token });
    })().catch((e) => {
      bootstrapPromise = null; // permettre un retry au prochain appel
      throw e;
    });
  }
  return bootstrapPromise;
}

let lensesCache: SnapLens[] | null = null;
let lensesPromise: Promise<SnapLens[]> | null = null;

/** Vide le cache mémoire des lenses (pour re-télécharger le groupe). */
export function clearSnapLensesCache(): void {
  lensesCache = null;
  lensesPromise = null;
}

/** Charge (et met en cache) les lenses du groupe KIDI+. */
export function loadSnapLenses(force = false): Promise<SnapLens[]> {
  if (force) clearSnapLensesCache();
  if (lensesCache) return Promise.resolve(lensesCache);
  if (!lensesPromise) {
    lensesPromise = (async () => {
      const cameraKit = await getCameraKit();
      const { lenses, errors } =
        await cameraKit.lensRepository.loadLensGroups(SNAP_LENS_GROUP_IDS);
      if (errors.length) {
        console.warn("[camera-kit] lens group load errors", errors.map(String));
      }
      console.info(
        `[camera-kit] groups ${SNAP_LENS_GROUP_IDS.join(", ")}: ${lenses.length} lens(es)`,
        lenses.map((l) => `${l.name} (${l.groupId})`),
      );
      lensesCache = lenses;
      return lenses;
    })().catch((e) => {
      lensesPromise = null;
      throw e;
    });
  }
  return lensesPromise;
}

// ---------------------------------------------------------------------------
// Pipeline de rendu (une session Camera Kit par flux vidéo)
// ---------------------------------------------------------------------------

export type CameraKitPipeline = {
  /** Canvas où le moteur AR dessine (affichable en preview). */
  canvas: HTMLCanvasElement;
  /** Piste vidéo filtrée (captureStream du canvas) — à publier sur LiveKit. */
  outputTrack: MediaStreamTrack;
  /** Applique une lens du groupe (remplace la précédente). */
  setLens: (lensId: string, groupId?: string) => Promise<void>;
  /** Retire la lens (la vidéo brute continue de passer). */
  clearLens: () => Promise<void>;
  destroy: () => Promise<void>;
};

/** Appareil "modeste" : très peu de cœurs CPU → on rend le filtre plus petit.
 * Attention : iOS (iPhone 13→16) expose souvent 6 cœurs tout en étant très
 * puissant ; on ne les dégrade donc PAS d'office, une mesure de FPS réelle
 * (voir plus bas) décide d'un éventuel repli. */
function lowPowerDevice(): boolean {
  try {
    const ua = navigator.userAgent || "";
    const isApple = /iPhone|iPad|Macintosh/.test(ua);
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
    const cores = navigator.hardwareConcurrency ?? 4;
    if (isApple) return cores <= 4; // A9/A10 et plus anciens uniquement
    if (typeof mem === "number" && mem <= 3) return true;
    return cores <= 4;
  } catch {
    return false;
  }
}


export async function createCameraKitPipeline(args: {
  source: MediaStreamTrack;
  /** Miroir selfie horizontal appliqué au rendu (caméra avant publiée). */
  mirror: boolean;
  cameraType: "user" | "environment";
  fps?: number;
  /** Plafond du plus grand côté du rendu AR (défaut : 1280, 960 si mobile modeste). */
  maxLongSide?: number;
  /** Appelé si la sortie reste figée malgré les tentatives de reprise —
   *  l'appelant doit retirer le processeur et repasser sur la caméra brute. */
  onFatalStall?: () => void;
}): Promise<CameraKitPipeline> {
  const [cameraKit, mod] = await Promise.all([
    getCameraKit(),
    import("@snap/camera-kit"),
  ]);
  const { createMediaStreamSource, Transform2D } = mod;

  const session: CameraKitSession = await cameraKit.createSession();
  session.events.addEventListener("error", (event) => {
    console.warn("[camera-kit] session error", event.detail?.error);
  });

  const stream = new MediaStream([args.source]);
  const source = createMediaStreamSource(stream, {
    cameraType: args.cameraType,
    disableSourceAudio: true,
    ...(args.mirror ? { transform: Transform2D.MirrorX } : {}),
  });
  await session.setSource(source);

  const fps = args.fps ?? (lowPowerDevice() ? 24 : 30);
  await session.setFPSLimit(fps).catch(() => {});

  await session.play("live");

  // Plafonne la résolution de rendu AR (après play, requis par le SDK).
  try {
    const s = args.source.getSettings();
    const sw = s.width ?? 720;
    const sh = s.height ?? 1280;
    const cap = args.maxLongSide ?? (lowPowerDevice() ? 960 : 1280);
    const long = Math.max(sw, sh);
    if (long > cap) {
      const k = cap / long;
      await source.setRenderSize(Math.round(sw * k), Math.round(sh * k));
    }
  } catch (e) {
    console.warn("[camera-kit] setRenderSize failed", e);
  }

  const canvas = session.output.live;
  const out = canvas.captureStream(fps);
  const outputTrack = out.getVideoTracks()[0];
  if (!outputTrack) {
    await session.destroy().catch(() => {});
    throw new Error("camera-kit: no output track");
  }

  // Qualité adaptative : on démarre en haute qualité, et on ne dégrade que si
  // l'appareil n'y arrive pas réellement (mesure du rafraîchissement pendant 5 s).
  let degraded = false;
  const measureAndAdapt = () => {
    let frames = 0;
    const t0 = performance.now();
    const tick = () => {
      if (destroyed || degraded) return;
      frames++;
      const dt = performance.now() - t0;
      if (dt < 5000) { requestAnimationFrame(tick); return; }
      const real = (frames * 1000) / dt;
      if (real < 22) {
        degraded = true;
        console.warn("[camera-kit] rendu dégradé (", Math.round(real), "fps )");
        session.setFPSLimit(24).catch(() => {});
        try {
          const s = args.source.getSettings();
          const sw = s.width ?? 720;
          const sh = s.height ?? 1280;
          const long = Math.max(sw, sh);
          const k = 960 / long;
          if (k < 1) source.setRenderSize(Math.round(sw * k), Math.round(sh * k));
        } catch { /* ignore */ }
      }
    };
    requestAnimationFrame(tick);
  };

  let destroyed = false;
  setTimeout(() => { if (!destroyed) measureAndAdapt(); }, 3000);

  // Watchdog anti-image-figée, mesuré sur la PISTE DE SORTIE : le rAF de la
  // page peut tourner alors que le moteur AR ne produit plus aucune frame
  // (WebGL perdu, WASM saturé, applyLens qui met le rendu en pause — constaté
  // sur WebView Android). On sonde donc le flux captureStream via un <video>
  // caché : si aucune frame n'arrive, la vidéo publiée est figée pour les
  // viewers et il faut reprendre la session, puis se replier sur la caméra
  // brute si la reprise échoue.
  const probe = document.createElement("video");
  probe.muted = true;
  probe.playsInline = true;
  probe.setAttribute("playsinline", "true");
  probe.srcObject = out;
  void probe.play().catch(() => {});

  let lastOutputFrameAt = performance.now();
  const noteFrame = () => {
    lastOutputFrameAt = performance.now();
  };
  const probeRvfc = probe as HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: () => void) => number;
  };
  const hasRvfc = typeof probeRvfc.requestVideoFrameCallback === "function";
  if (hasRvfc) {
    const onRvfc = () => {
      if (destroyed) return;
      noteFrame();
      probeRvfc.requestVideoFrameCallback!(onRvfc);
    };
    probeRvfc.requestVideoFrameCallback!(onRvfc);
  }

  let currentLens: { lensId: string; groupId: string } | null = null;
  let recovering = false;
  let recoveryAttempts = 0;
  let fatalSignalled = false;

  const resume = () => {
    if (destroyed || fatalSignalled) return;
    session.play("live").catch(() => {});
  };

  /** Reprise d'une session figée : pause/play + ré-application de la lens. */
  const recover = async () => {
    if (destroyed || recovering || fatalSignalled) return;
    recovering = true;
    recoveryAttempts++;
    console.warn(
      `[camera-kit] sortie figée — reprise de session (essai ${recoveryAttempts})`,
    );
    try {
      await session.pause("live").catch(() => {});
      await session.play("live").catch(() => {});
      if (currentLens) {
        const lens = await cameraKit.lensRepository
          .loadLens(currentLens.lensId, currentLens.groupId)
          .catch(() => null);
        if (lens) await session.applyLens(lens).catch(() => {});
        await session.play("live").catch(() => {});
      }
    } finally {
      recovering = false;
      // Laisse une fenêtre à la reprise avant de re-mesurer le gel.
      lastOutputFrameAt = performance.now();
    }
  };

  let lastProbeTime = -1;
  const watchdog = setInterval(() => {
    if (destroyed || fatalSignalled) return;
    if (!hasRvfc) {
      // Sans requestVideoFrameCallback : currentTime d'un flux MediaStream
      // n'avance que si des frames arrivent réellement.
      if (probe.currentTime !== lastProbeTime) {
        lastProbeTime = probe.currentTime;
        noteFrame();
      }
    }
    const stallMs = performance.now() - lastOutputFrameAt;
    if (stallMs <= 1500) {
      recoveryAttempts = 0;
      return;
    }
    if (recoveryAttempts >= 3 || stallMs > 8000) {
      fatalSignalled = true;
      console.error(
        "[camera-kit] sortie définitivement figée — repli caméra brute",
      );
      try {
        args.onFatalStall?.();
      } catch {
        /* ignore */
      }
      return;
    }
    void recover();
  }, 1000);

  // Perte du contexte WebGL (pression mémoire GPU fréquente sur Android) :
  // empêche le comportement par défaut et tente une reprise immédiate.
  const onContextLost = (e: Event) => {
    e.preventDefault();
    console.warn("[camera-kit] webglcontextlost — reprise");
    void recover();
  };
  canvas.addEventListener("webglcontextlost", onContextLost);

  document.addEventListener("visibilitychange", resume);
  window.addEventListener("focus", resume);
  window.addEventListener("pageshow", resume);
  const stopWatchdog = () => {
    clearInterval(watchdog);
    canvas.removeEventListener("webglcontextlost", onContextLost);
    document.removeEventListener("visibilitychange", resume);
    window.removeEventListener("focus", resume);
    window.removeEventListener("pageshow", resume);
    try {
      probe.pause();
      probe.srcObject = null;
    } catch {
      /* ignore */
    }
  };


  return {
    canvas,
    outputTrack,
    setLens: async (lensId: string, groupId: string = SNAP_LENS_GROUP_ID) => {
      if (destroyed) return;
      const lens = await cameraKit.lensRepository.loadLens(lensId, groupId);
      await session.applyLens(lens);
    },
    clearLens: async () => {
      if (destroyed) return;
      await session.removeLens();
    },
    destroy: async () => {
      if (destroyed) return;
      destroyed = true;
      stopWatchdog();
      try { outputTrack.stop(); } catch { /* ignore */ }

      try { await session.pause("live"); } catch { /* ignore */ }
      try { await session.destroy(); } catch { /* ignore */ }
    },
  };
}
