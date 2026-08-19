# Plan : Camera Kit natif iOS/Android pour les filtres en live

## Problème actuel
- Les filtres Snap Camera Kit tournent dans le navigateur web (`@snap/camera-kit` en WASM/WebGL).
- Pendant un live, le moteur AR sature le CPU/GPU du téléphone, ce qui provoque des micro-blocages et des décalages audio, même sur un iPhone 15 Pro Max.
- Le rendu web est moins optimisé que le rendu natif de Snapchat.

## Solution retenue
Intégrer le **Snap Camera Kit SDK natif** côté iOS et Android via des plugins Capacitor personnalisés, tout en conservant le SDK web comme fallback pour les utilisateurs web/PWA.

Les filtres restent les mêmes (mêmes Lens IDs / Lens Group), seul le moteur de rendu change.

## Architecture cible

```text
┌─────────────────────────────────────────┐
│  KiDi+ app (Capacitor / WebView)        │
│  - broadcast-live.tsx                     │
│  - filter-context.tsx                     │
│  - host-tool-rail.tsx                     │
└──────────────┬──────────────────────────┘
               │
    ┌──────────┴──────────┐
    ▼                     ▼
┌──────────────┐   ┌──────────────┐
│ Plugin iOS   │   │ Plugin Android│
│ CameraKit    │   │ CameraKit     │
│ (Swift SDK)  │   │ (Kotlin SDK)  │
└──────┬───────┘   └──────┬──────┘
       │                  │
       ▼                  ▼
┌──────────────┐   ┌──────────────┐
│ GPU natif    │   │ GPU natif     │
│ iPhone/iPad  │   │ Android       │
└──────────────┘   └──────────────┘
```

## Découpage en phases

### Phase 1 — Plugin iOS natif (Proof of Concept)
1. Créer un plugin Capacitor `KidiCameraKit` pour iOS (Swift).
2. Intégrer le Snap Camera Kit iOS SDK via CocoaPods/SPM.
3. Exposer les méthodes JS :
   - `initialize(apiToken: string)`
   - `loadLensGroup(groupId: string)`
   - `applyLens(lensId: string)`
   - `clearLens()`
   - `startPreview()` / `stopPreview()`
   - `captureFrame()` (pour envoyer à LiveKit)
4. Connecter le flux vidéo natif au publisher LiveKit iOS natif (pas via WebRTC web).
5. Tester sur iPhone 15 Pro Max puis sur un iPhone d'entrée de gamme.

### Phase 2 — Plugin Android natif
1. Créer l'équivalent Kotlin du plugin Capacitor.
2. Intégrer le Snap Camera Kit Android SDK via Gradle.
3. Réutiliser la même API JS que le plugin iOS.
4. Connecter le flux vidéo natif au publisher LiveKit Android natif.
5. Tester sur plusieurs gammes Android (haut/milieu/bas de gamme).

### Phase 3 — Unification et fallback web
1. Créer une abstraction TypeScript commune (`src/lib/filters/native-camera-kit-bridge.ts`).
2. Détection automatique :
   - iOS/Android + plugin disponible → utiliser le natif.
   - Web/PWA ou plugin indisponible → garder `@snap/camera-kit` web.
3. Migrer `filter-context.tsx` pour appeler le bridge au lieu du SDK web directement.
4. Conserver les optimisations web déjà en place (24 fps, résolution réduite) pour le fallback.

### Phase 4 — Intégration LiveKit
1. S'assurer que la sortie du Camera Kit natif (texture/camera frame) est publiée comme piste vidéo LiveKit.
2. Gérer l'audio : micro natif continu, pas de double capture.
3. Préserver la gestion du son (déblocage au geste) côté viewer.

### Phase 5 — Tests et itération
1. Tests de performance comparatifs : web vs natif sur 3-4 appareils.
2. Mesurer la latence, le CPU/GPU usage, la résolution réelle.
3. Ajustements selon les retours terrain.

## Fichiers et modules impactés
- `src/lib/filters/camera-kit.ts` — SDK web actuel, devient le fallback.
- `src/lib/filters/native-camera-kit-bridge.ts` — nouvelle abstraction (à créer).
- `src/components/broadcast/camera-kit-preview.tsx` — preview, à brancher sur le bridge.
- `src/components/broadcast/broadcast-live.tsx` — live publisher, à brancher sur le bridge.
- `src/components/broadcast/filter-context.tsx` — contexte de sélection de filtre.
- Plugins natifs Capacitor à créer :
  - `ios/App/App/KidiCameraKitPlugin.swift`
  - `android/app/src/main/java/com/kidiplus/app/KidiCameraKitPlugin.kt`

## Dépendances à ajouter
- Snap Camera Kit iOS SDK (via CocoaPods/SPM).
- Snap Camera Kit Android SDK (via Gradle).
- LiveKit iOS/Android native SDKs (si pas déjà intégrés).

## Risques et contraintes
- **Complexité native** : plus lourd que du pur web, nécessite des builds Xcode/Android Studio.
- **Review App Store** : l'utilisation de la caméra + micro + AR doit rester justifiée.
- **Coût Snap** : vérifier les quotas/limits du Camera Kit natif (généralement les mêmes que web).
- **Fallback obligatoire** : le web reste nécessaire pour les utilisateurs qui n'installent pas l'app native.

## Livrables
1. Plugin iOS fonctionnel avec au moins un filtre appliqué en live.
2. Plugin Android fonctionnel.
3. Bridge TS unifié + détection native/web.
4. Documentation de mise à jour des builds natifs.
5. Rapport comparatif web vs natif (latence, fluidité, résolution).

## Prochaine action immédiate
Si tu approuves, je commence par la **Phase 1** : création du plugin Capacitor iOS + intégration du Snap Camera Kit natif, avec un premier test de preview en live.
