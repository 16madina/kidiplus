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

## iOS — étapes de finalisation côté Xcode

### 1. Ajouter le SDK Snap Camera Kit

Le plugin `KidiCameraKitPlugin.swift` est déjà créé dans `ios/App/App/`. Il faut maintenant ajouter la dépendance Snap Camera Kit au projet iOS.

**Option A — CocoaPods (recommandée par Snap)**

Créer ou mettre à jour `ios/App/Podfile` :

```ruby
platform :ios, '15.0'
use_frameworks!

target 'App' do
  pod 'Capacitor', :path => '../../node_modules/@capacitor/ios'
  pod 'CapacitorCordova', :path => '../../node_modules/@capacitor/ios'
  pod 'SCSDKCameraKit', '~> 1.35'
  pod 'SCSDKCameraKitReferenceUI'
  # ... autres pods existants
end
```

Puis :

```bash
cd ios/App && pod install
```

**Option B — Swift Package Manager (si Snap fournit un package)**

Ajouter le package SCSDKCameraKit dans Xcode → `File → Add Package Dependencies`.

### 2. Ajouter le fichier au target Xcode

Si `KidiCameraKitPlugin.swift` n'apparaît pas dans le navigateur Xcode :

1. Ouvrir `ios/App/App.xcworkspace` (ou `.xcodeproj` si pas de CocoaPods).
2. Faire glisser `KidiCameraKitPlugin.swift` dans le dossier `App` du navigateur.
3. Cocher `Copy items if needed` et s'assurer que le target `App` est sélectionné.

### 3. Remplacer les placeholders `TODO` dans le plugin

Les méthodes Swift contiennent des `TODO` marquant l'endroit où appeler le vrai SDK Snap Camera Kit :

- `initialize(...)` → créer la `Session` SCSDKCameraKit et observer le(s) groupe(s).
- `loadLenses(...)` → récupérer les lenses via `session.lenses.repository`.
- `applyLens(...)` / `clearLens()` → appliquer/retirer la lens.
- `startPreview(...)` / `stopPreview()` → démarrer/arrêter la preview caméra native.
- `setPublishEnabled(...)` → connecter au room LiveKit iOS natif et publier une `LocalVideoTrack` alimentée par la sortie Camera Kit.

### 4. Permissions Info.plist

Vérifier que les clés suivantes sont présentes dans `ios/App/App/Info.plist` :

```xml
<key>NSCameraUsageDescription</key>
<string>KiDi+ utilise la caméra pour les lives et les filtres AR.</string>
<key>NSMicrophoneUsageDescription</key>
<string>KiDi+ utilise le micro pour diffuser le son du live.</string>
```

## Android — étapes de finalisation

1. Ajouter dans `android/app/build.gradle` :

```kotlin
implementation "com.snap.camerakit:camerakit:1.35.0"
implementation "com.snap.camerakit:support-camerax:1.35.0"
```

2. Créer `android/app/src/main/java/com/kidiplus/app/KidiCameraKitPlugin.kt` en miroir du plugin iOS.
3. Enregistrer le plugin dans `MainActivity.java` ou via `capacitor.config.ts`.

## Cycle de vie attendu

1. **Setup / preview** : le host ouvre le carrousel → `loadBridgeLenses()` charge les lenses via le pont (natif ou web). Une lens sélectionnée est appliquée via `applyBridgeLens()`.
2. **Démarrage du live** : `broadcast-video.tsx` connecte le room LiveKit web et appelle `setNativePublishEnabled({ enabled: true, roomUrl, token })`. Sur iOS/Android natif, le plugin prendra le relais pour la publication vidéo filtrée.
3. **Changement de lens en live** : `applyHostPipeline()` appelle `applyBridgeLens()` pour mettre à jour le filtre côté natif (et met à jour le `TrackProcessor` web en fallback).
4. **Fin du live** : `setNativePublishEnabled({ enabled: false })` arrête la publication native.

## Tests recommandés

1. **Web** : s'assurer que les filtres Snap continuent de charger et de s'appliquer (pas de régression).
2. **iOS natif** : après intégration du SDK Snap, vérifier que `KidiCameraKit.initialize()` et `loadLenses()` retournent les vraies lenses.
3. **Performance** : comparer la charge CPU/GPU entre le rendu web et le rendu natif sur iPhone 15 Pro Max, iPhone SE et un Android milieu de gamme.

## Notes

- Le token API Camera Kit est un **jeton client public** — il est embarqué dans l'app mobile et dans le web.
- Le SDK web reste le fallback pour les utilisateurs qui n'installent pas l'app native (PWA, navigateur).
- Le plugin iOS actuel est un squelette fonctionnel : le bridge JS est opérationnel, mais les appels au SDK Snap natif doivent être décommentés/implémentés une fois la dépendance ajoutée dans Xcode.
