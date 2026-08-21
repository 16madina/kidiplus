// Pompe de frames robuste pour les pipelines canvas (miroir, effets, filtres).
//
// Problème constaté en live : la piste publiée est un `canvas.captureStream()`
// alimenté par une boucle `requestAnimationFrame`. Dès que la WebView throttle
// le rAF (app en arrière-plan, appel entrant, mémoire basse) ou que le <video>
// source se met en pause (iOS met en pause les éléments média hors écran /
// après une interruption audio), la boucle s'arrête : le canvas garde sa
// dernière image et la piste WebRTC continue d'émettre… une image figée.
// Résultat : le vendeur ET les spectateurs voient une image gelée alors que la
// connexion reste « verte ».
//
// Cette pompe :
//  1. relance en continu `video.play()` si la source se met en pause,
//  2. redémarre la boucle rAF sur `visibilitychange` / `resume`,
//  3. bascule sur un timer si le rAF ne peint plus (watchdog),
//  4. signale un décrochage réel de la source (currentTime figé) via `onStall`.

export type FramePump = { stop(): void };

export function startFramePump(opts: {
  video: HTMLVideoElement;
  draw: () => void;
  fps?: number;
  /** Appelé quand la source vidéo ne délivre plus de frame depuis ~3 s. */
  onStall?: () => void;
}): FramePump {
  const fps = opts.fps ?? 30;
  const frameMs = 1000 / fps;
  let stopped = false;
  let raf = 0;
  let lastPaint = performance.now();
  let lastMediaTime = -1;
  let lastMediaAdvance = performance.now();
  let stallNotified = false;

  const paint = () => {
    lastPaint = performance.now();
    try {
      opts.draw();
    } catch {
      /* une frame ratée ne doit jamais tuer la boucle */
    }
  };

  const ensurePlaying = () => {
    const v = opts.video;
    if (!v) return;
    if (v.paused || v.ended) void v.play().catch(() => {});
  };

  const loop = () => {
    if (stopped) return;
    paint();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  // Watchdog : peint via timer si le rAF est throttlé, et surveille la source.
  const watchdog = setInterval(() => {
    if (stopped) return;
    ensurePlaying();

    const now = performance.now();
    if (now - lastPaint > Math.max(200, frameMs * 3)) {
      // Le rAF ne tourne plus (onglet caché / WebView throttlée) : on continue
      // d'alimenter le canvas pour ne pas figer la piste publiée.
      paint();
      // Et on tente de relancer une boucle rAF propre.
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(loop);
    }

    const t = opts.video?.currentTime ?? 0;
    if (t !== lastMediaTime) {
      lastMediaTime = t;
      lastMediaAdvance = now;
      stallNotified = false;
    } else if (!stallNotified && now - lastMediaAdvance > 3000) {
      stallNotified = true;
      console.warn("[frame-pump] source vidéo figée depuis 3 s");
      opts.onStall?.();
    }
  }, 250);

  const onVisibility = () => {
    if (stopped) return;
    ensurePlaying();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("focus", onVisibility);
  window.addEventListener("pageshow", onVisibility);

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      cancelAnimationFrame(raf);
      clearInterval(watchdog);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onVisibility);
      window.removeEventListener("pageshow", onVisibility);
    },
  };
}

/** Ré-attache la piste source à l'élément vidéo (récupération après décrochage). */
export function rebindVideoSource(
  video: HTMLVideoElement,
  source: MediaStreamTrack,
): void {
  try {
    video.srcObject = new MediaStream([source]);
    void video.play().catch(() => {});
  } catch {
    /* ignore */
  }
}
