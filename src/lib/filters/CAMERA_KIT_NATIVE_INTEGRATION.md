# Intégration Snap Camera Kit

> **OBSOLÈTE (juillet 2026)** : ce plan prévoyait des plugins natifs
> Swift/Kotlin. Entre-temps, Snap a publié le **SDK Web** (`@snap/camera-kit`,
> moteur AR en WebAssembly) qui fonctionne directement dans la WebView
> Capacitor — l'intégration est faite SANS plugin natif. Voir :
> - `src/lib/filters/camera-kit.ts` — bootstrap, chargement des lenses, pipeline
> - `src/lib/filters/camera-kit-processor.ts` — TrackProcessor LiveKit (live)
> - `src/components/broadcast/camera-kit-preview.tsx` — aperçu setup
> - Lens Group branché : "test 1" (`df287f43-6646-4b01-a711-1a0e632c211a`) —
>   gérer les lenses sur my-lenses.snapchat.com, elles apparaissent dans l'app
>   sans changement de code.
> - Token staging actif (filigrane "Camera Kit Staging"). Après validation
>   Snap ("Submit For Review" sur kit.snapchat.com/manage avec vidéo démo),
>   définir `VITE_SNAP_CAMERA_KIT_API_TOKEN` avec le token production.
>
> Le contenu ci-dessous est conservé pour référence si un jour on veut la
> variante 100% native (performances supérieures sur vieux téléphones).

## Résumé rapide (ancien plan natif)

## Ce qu'on a déjà côté portail Snap

- App name : **KIDI+**
- Bundle ID iOS/Android : `com.kidiplus.app`
- Demo Lens Group ID : `5b22f85d-3308-452f-8bcc-058a5c9dc34b`
- Staging API Token : env `SNAP_CAMERA_KIT_STAGING_TOKEN`
- Production API Token : env `SNAP_CAMERA_KIT_PRODUCTION_TOKEN`
  (validation Snap requise avant utilisation en prod, ~3–10 jours ouvrés)

## Ce qu'on a déjà côté code web

- `src/lib/filters/lenses-catalog.ts` — structure `Lens { lensId, groupId, ... }`
  alignée sur `cameraKit.lenses.repository.get(lensID:groupID:)`.
- `src/lib/filters/filter-context.tsx` — `useFilter()` retourne `activeLens`.
  Le natif lira `activeLens.lensId` + `activeLens.groupId`.
- `src/components/broadcast/filters-carousel.tsx` — UI carrousel Snap-style,
  la même sur web et sur mobile (pas de rewrite).
- Bouton "Filtres" (Sparkles) dans `broadcast-setup` et `HostToolRail`.

## Ce qu'il restera à faire pour l'app native

### 1. Packager en Capacitor

```bash
bun add @capacitor/core @capacitor/ios @capacitor/android
bunx cap init KIDI+ com.kidiplus.app
bunx cap add ios
bunx cap add android
```

### 2. Créer un plugin Capacitor `snap-camera-kit`

```
plugins/snap-camera-kit/
├── ios/Plugin/SnapCameraKitPlugin.swift
├── android/src/main/java/com/kidiplus/snapck/SnapCameraKitPlugin.kt
└── src/index.ts    // API JS : loadLens(lensId, groupId), clearLens()
```

### 3. iOS — Swift

`Podfile` :
```ruby
pod 'SCSDKCameraKit', '~> 1.35'
pod 'SCSDKCameraKitReferenceUI'
```

`Info.plist` :
```xml
<key>SCCameraKitAPIToken</key>
<string>$(SC_CAMERAKIT_TOKEN)</string>  <!-- Staging ou Production -->
<key>NSCameraUsageDescription</key>
<string>KIDI+ utilise la caméra pour les lives et les filtres</string>
```

Implémentation clé :
```swift
import SCSDKCameraKit

let session = Session(sessionConfig: nil, lensesConfig: nil, errorHandler: nil)
session.lenses.repository.addObserver(self, groupID: "5b22f85d-...")

// Sur applyLens(lensId):
if let lens = session.lenses.repository.lens(id: lensId, groupID: groupId) {
    session.lenses.processor?.apply(lens: lens, launchData: nil) { success in ... }
}

// Piper la sortie AVCaptureSession → LiveKit LocalVideoTrack
// via un CustomVideoCapturer LiveKit (LiveKitClient.LocalVideoTrack.create(...))
```

### 4. Android — Kotlin

`build.gradle` :
```kotlin
implementation "com.snap.camerakit:camerakit:1.35.0"
implementation "com.snap.camerakit:support-camerax:1.35.0"
```

`AndroidManifest.xml` :
```xml
<meta-data
    android:name="com.snap.camerakit.app.id"
    android:value="@string/snap_camera_kit_api_token" />
```

Implémentation clé :
```kotlin
val cameraKitSession = Session(context) {
    apiToken(BuildConfig.SC_CAMERAKIT_TOKEN)
    imageProcessorSource(imageProcessorSource)
    attachTo(surfaceView.holder)
}
cameraKitSession.lenses.repository.get(
    LensesComponent.Repository.QueryCriteria.ById(lensId, groupId)
) { result -> cameraKitSession.lenses.processor.apply(result.whenHasFirst(...)) }
```

### 5. Bridge JS → natif dans le React web

Modifier `broadcast-video.tsx` :

```ts
import { Capacitor } from "@capacitor/core";
import { SnapCameraKit } from "snap-camera-kit"; // notre plugin

useEffect(() => {
  if (!Capacitor.isNativePlatform()) return;
  if (activeLens.lensId === "none") {
    SnapCameraKit.clearLens();
  } else {
    SnapCameraKit.loadLens({
      lensId: activeLens.lensId,
      groupId: activeLens.groupId,
    });
  }
}, [activeLens]);
```

Le plugin natif :
1. Remplace la piste caméra LiveKit locale par la piste filtrée Camera Kit.
2. LiveKit publie normalement la piste filtrée aux viewers.
3. Aucun changement côté viewer / autres composants.

### 6. Récupérer les vraies lenses

Une fois le plugin en place, remplacer les `demo-*` de `lenses-catalog.ts`
par un snapshot dynamique :

```ts
const lenses = await SnapCameraKit.getLenses({ groupId: SNAP_DEMO_LENS_GROUP_ID });
// [{ lensId, name, iconUrl, snapcode, ... }]
```

Snap fournit `iconUrl` par lens — on remplace nos emojis par les vraies
vignettes dans `<LensTile>`.

## Ordre de travail recommandé

1. Finaliser la UI web (déjà fait) ✅
2. Publier l'app web + valider le flow avec les filtres CSS de démo
3. Packager en Capacitor (une fois la version web stable)
4. Créer le plugin natif iOS
5. Répliquer le plugin natif Android
6. Soumettre à Snap pour Production Token
7. Publier sur App Store + Play Store

## Coût

- Snap Camera Kit : **gratuit** (staging + prod)
- Développement plugin natif : ~2–4 semaines pour iOS + Android
- Frais Apple Developer : 99 $/an
- Frais Google Play : 25 $ (une seule fois)
