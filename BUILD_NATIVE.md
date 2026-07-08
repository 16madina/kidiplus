# Build natif KiDi+ (Android / iOS)

Le sandbox Lovable ne peut pas produire d'APK/IPA (pas d'Android SDK ni de Xcode).
Ces étapes se lancent **sur ta machine**.

## Prérequis
- Node 20+, npm
- Android : Android Studio (SDK 34+, JDK 17)
- iOS : macOS + Xcode 15+ + CocoaPods (`sudo gem install cocoapods`)

## 1. Cloner / pull le repo
```bash
git pull
npm install
```

## 2. Ajouter les plateformes natives (première fois seulement)
```bash
npx cap add android
# et/ou
npx cap add ios
```

## 3. Synchroniser l'app native
```bash
npm run native:prepare
npx cap sync android
# et/ou
npx cap sync ios
```

> Le WebView Capacitor charge la page launcher dans `dist/index.html`, puis ouvre
> `https://kidiplus.lovable.app` dans le WebView via `server.allowNavigation`.
> Ne mets pas de `server.url` actif en production.

## 4. Android : enlever le bouton play natif du splash vidéo

Si Android affiche un gros bouton play sur la vidéo d'intro, édite sur ta machine :

`android/app/src/main/java/com/kidiplus/app/MainActivity.java`

Remplace le contenu par :

```java
package com.kidiplus.app;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Bundle;
import android.webkit.WebSettings;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebChromeClient;

public class MainActivity extends BridgeActivity {
  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);

    WebSettings settings = this.bridge.getWebView().getSettings();
    settings.setMediaPlaybackRequiresUserGesture(false);

    this.bridge.getWebView().setWebChromeClient(new BridgeWebChromeClient(this.bridge) {
      @Override
      public Bitmap getDefaultVideoPoster() {
        Bitmap bitmap = Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        canvas.drawARGB(0, 0, 0, 0);
        return bitmap;
      }
    });
  }
}
```

Puis relance :

```bash
npm run native:prepare
npx cap sync android
```

## 5. Configurer Firebase (Push Notifications) — Android

Le fichier `google-services.json` est déjà dans le repo à `android-config/google-services.json`.
Après `npx cap add android` (ou après un `npx cap sync android`), fais :

### 5a. Copier le fichier Firebase
```bash
cp android-config/google-services.json android/app/google-services.json
```

### 5b. Éditer `android/build.gradle` (racine du projet Android)

Dans le bloc `buildscript { dependencies { ... } }`, ajoute :
```gradle
classpath 'com.google.gms:google-services:4.4.2'
```

### 5c. Éditer `android/app/build.gradle`

Tout en haut du fichier, sous les autres `apply plugin:` :
```gradle
apply plugin: 'com.google.gms.google-services'
```

Puis dans `dependencies { ... }` ajoute (si absent) :
```gradle
implementation platform('com.google.firebase:firebase-bom:33.5.1')
implementation 'com.google.firebase:firebase-messaging'
```

### 5d. Re-sync
```bash
npx cap sync android
```

## 6. Ouvrir dans l'IDE natif
```bash
npx cap open android   # Android Studio → Run ▶ ou Build > Build APK(s)
npx cap open ios       # Xcode → Product > Run / Archive
```

## Signer & publier
- **Android** : Build > Generate Signed Bundle / APK → keystore → AAB pour le Play Store.
- **iOS** : Xcode → Product > Archive → Distribute App → App Store Connect.

## Mode 100 % offline (plus tard)
Pour embarquer l'app dans l'APK au lieu de charger l'URL distante, il faudra
générer un vrai client SPA statique (séparé du SSR). Dis-le-moi si tu veux
que je te le prépare.
