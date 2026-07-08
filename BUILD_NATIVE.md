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

## 3. Synchroniser le web (le stub `dist/index.html` est déjà dans le repo)
```bash
npx cap sync android
# et/ou
npx cap sync ios
```

> Le WebView charge directement `https://kidiplus.lovable.app` (voir `capacitor.config.ts`).
> Aucune build SPA locale n'est nécessaire — TanStack Start est SSR.

## 4. Ouvrir dans l'IDE natif
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
