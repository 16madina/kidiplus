## Problème exact
Le splash vidéo est bien présent, mais Android WebView affiche encore son overlay natif de démarrage vidéo. D’après la recherche et le code actuel, les attributs web (`autoplay`, `muted`, `playsInline`, CSS pseudo-controls) ne suffisent pas toujours : Android peut afficher un poster/play natif via `WebChromeClient.getDefaultVideoPoster()` même quand `setMediaPlaybackRequiresUserGesture(false)` est activé.

## Plan
1. Garder la vidéo splash sur Android et iOS, sans skip Android.
2. Renforcer `src/components/splash-screen.tsx` pour empêcher toute UI native :
   - ajouter explicitement `controls={false}` côté JSX,
   - retirer l’attribut `poster` sur Android si besoin, car il peut déclencher l’overlay natif,
   - forcer `muted/defaultMuted/playsInline/controls=false` avant chaque `play()`.
3. Ajouter une aide native Android documentée dans le repo, puisque le dossier `android/` n’est pas présent ici :
   - fichier cible sur ta machine : `android/app/src/main/java/com/kidiplus/app/MainActivity.java`,
   - en plus de `setMediaPlaybackRequiresUserGesture(false)`, remplacer le poster vidéo natif Android par un bitmap transparent via `BridgeWebChromeClient.getDefaultVideoPoster()`.
4. Mettre à jour la doc native Android (`README-CAPACITOR.md` / `BUILD_NATIVE.md`) avec le snippet exact à copier, puis les commandes :
   - `node scripts/prepare-native.mjs`
   - `npx cap sync android`
   - Run depuis Android Studio.
5. Typecheck après modification.

## Snippet natif à viser
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

## Important
Oui, une modification native est nécessaire sur ta machine : ce bouton vient d’Android WebView, pas de React. Le repo actuel n’a pas le dossier `android/`, donc je ne peux pas l’appliquer directement ici.