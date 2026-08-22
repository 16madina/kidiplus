# Intégration Snap Camera Kit — web + natif

## Résumé

KiDi+ utilise maintenant un **pont unifié** (`src/lib/filters/native-camera-kit-bridge.ts`) qui choisit automatiquement entre :

- **Web / PWA** : SDK `@snap/camera-kit` en WebAssembly/WASM — rendu AR dans la WebView, publié via un `TrackProcessor` LiveKit web.
- **iOS / Android natif** : plugin Capacitor `KidiCameraKit` qui fait tourner le SDK natif Snap Camera Kit sur le GPU du téléphone.

Les filtres (Lens ID / Lens Group) restent **exactement les mêmes** ; seul le moteur de rendu change.

## Pourquoi le natif ?

Le rendu WASM dans la WebView sature le CPU sur certains appareils, ce qui provoque des micro-blocages et un décalage audio pendant le live — constaté même sur iPhone 15 Pro Max. Le SDK natif Snap Camera Kit délègue le rendu AR au GPU natif et permet une intégration directe avec le SDK LiveKit natif pour la publication vidéo.

## Fichiers clés

| Fichier | Rôle |
|---|---|
| `src/lib/filters/native-camera-kit-bridge.ts` | Pont JS unifié : détection natif/web, chargement des lenses, application/retrait, contrôle de la publication. |
| `src/lib/filters/camera-kit.ts` | SDK web uniquement (bootstrap, chargement lenses, pipeline canvas). Appelé par le bridge en fallback web. |
| `src/lib/filters/filter-context.tsx` | Charge les lenses via le pont unifié. |
| `src/components/broadcast/broadcast-video.tsx` | Applique la lens via le pont ; signale au plugin natif quand on entre/sort du live. |
| `src/components/broadcast/camera-kit-preview.tsx` | Aperçu setup : utilise le pipeline web (le plugin natif gère sa propre preview). |
| `ios/App/App/KidiCameraKitPlugin.swift` | Plugin Capacitor iOS (bridge vers SCSDKCameraKit + LiveKit iOS natif). |
| `android/app/src/main/java/com/kidiplus/app/KidiCameraKitPlugin.kt` | Plugin Capacitor Android (Camera Kit + CameraX + LiveKit). |

## Configuration

### Token API

Le même jeton client public est utilisé pour web et natif :

```env
VITE_SNAP_CAMERA_KIT_API_TOKEN=eyJhbGciOiJIUzI1NiIsImtpZCI6IkNhbnZhc1MyU0hNQUNQcm9kIiwidHlwIjoiSldUIn0...
```

### Groupe de lenses

Par défaut, un seul groupe est chargé :

```ts
// src/lib/filters/camera-kit.ts
export const SNAP_LENS_GROUP_ID = "df287f43-6646-4b01-a711-1a0e632c211a";
```

Pour charger des groupes additionnels (web comme natif) :

```env
VITE_SNAP_LENS_GROUP_IDS=9dd9798c-cef5-443b-a494-af0cc480059e,...
```

Le pont JS (`native-camera-kit-bridge.ts`) active le chemin natif dès que `KidiCameraKit` est disponible dans le build. Fallback WASM si le plugin n’est pas compilé.

Pour forcer le fallback WASM même si le plugin natif est compilé :

```env
VITE_NATIVE_CAMERA_KIT_ENABLED=false
```

## iOS — étapes de finalisation côté Xcode

### 1. SDK Snap Camera Kit (fait)

Le package SPM `https://github.com/Snapchat/camera-kit-ios-sdk` (produit `SCSDKCameraKit`) est ajouté au target `App`, avec :

- `KidiCameraKitPlugin.swift` — Session, lenses, apply/clear, preview, LiveKit publish
- `KidiCameraKitLiveKitOutput.swift` — frames filtrées → `BufferCapturer`
- enregistrement dans `MainViewController` via `registerPluginInstance`

Ouvrir `ios/App/App.xcodeproj` (ou le workspace) dans Xcode, laisser SPM résoudre les packages, puis build sur un **appareil physique** (pas le simulateur).

### 2. Token API

Le token est passé dynamiquement depuis le JS (`VITE_SNAP_CAMERA_KIT_API_TOKEN`) via `SessionConfig(apiToken:)`. Optionnel : ajouter `SCCameraKitAPIToken` dans `Info.plist`.

### 3. Cycle live natif

Sur Capacitor iOS, le host **ne connecte pas** LiveKit depuis la WebView pour la caméra : le plugin publie vidéo + micro en natif (évite le conflit d’identité et le WASM).

## Android — plugin Capacitor (fait)

Fichiers :

- `android/app/src/main/java/com/kidiplus/app/KidiCameraKitPlugin.kt` — Session Snap + preview CameraX + publish LiveKit
- Enregistrement dans `MainActivity.java` via `registerPlugin(KidiCameraKitPlugin.class)`
- Deps Gradle : `com.snap.camerakit:camerakit` **1.50.0+** (support pages 16 Ko) + `support-camerax` + `io.livekit:livekit-android`

Ouvrir `android/` dans Android Studio, Sync Gradle, puis **Build > Generate Signed Bundle / APK** (appareil physique, pas l’émulateur x86).

Le pont JS (`native-camera-kit-bridge.ts`) active le chemin natif dès que `KidiCameraKit` est disponible dans le build. Fallback WASM si le plugin n’est pas compilé.

## Cycle de vie attendu

1. **Setup / preview** : le host ouvre le carrousel → `loadBridgeLenses()` charge les lenses via le pont (natif ou web). Une lens sélectionnée est appliquée via `applyBridgeLens()`.
2. **Démarrage du live** : `broadcast-video.tsx` connecte le room LiveKit web et appelle `setNativePublishEnabled({ enabled: true, roomUrl, token })`. Sur iOS/Android natif, le plugin prendra le relais pour la publication vidéo filtrée.
3. **Changement de lens en live** : `applyHostPipeline()` appelle `applyBridgeLens()` pour mettre à jour le filtre côté natif (et met à jour le `TrackProcessor` web en fallback).
4. **Fin du live** : `setNativePublishEnabled({ enabled: false })` arrête la publication native.

## Tests recommandés

1. **Web** : s'assurer que les filtres Snap continuent de charger et de s'appliquer (pas de régression).
2. **iOS natif** : après intégration du SDK Snap, vérifier que `KidiCameraKit.initialize()` et `loadLenses()` retournent les vraies lenses.
3. **Android natif** : installer l’APK 1.6+ sur un appareil physique, ouvrir un live avec un filtre Snap, vérifier preview + publication.
4. **Performance** : comparer la charge CPU/GPU entre le rendu web et le rendu natif sur iPhone 15 Pro Max, iPhone SE et un Android milieu de gamme.

## Notes

- Le token API Camera Kit est un **jeton client public** — il est embarqué dans l'app mobile et dans le web.
- Le SDK web reste le fallback pour les utilisateurs qui n'installent pas l'app native (PWA, navigateur).
