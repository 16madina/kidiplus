## Problème

Sur la page "Activer le mode vendeur" (`src/screens/live-screen.tsx`), le hero affiche uniquement une zone navy vide au lieu de la scène (vendeuse + baskets + gavel + téléphone).

Cause : l'image est bien servie (HTTP 200, image/png, 1.7 MB), mais elle est très verticale (portrait ~9:16) avec beaucoup de ciel navy en haut. Le conteneur actuel utilise `aspect-ratio: 3/4` + `object-cover` — sur des viewports larges (tablet/preview 702 px) le conteneur devient très haut (~936 px) et le crop se retrouve entièrement dans la zone haute vide de l'image.

## Correctifs

1. **Réencadrer la source** — l'image d'origine a ~30% de vide en haut. Générer une version recadrée sur le sujet, la ré-uploader via `lovable-assets` et remplacer `sellerHero.url`. Ça garantit que quel que soit le viewport, on voit la scène.

2. **Contraindre la hauteur du hero** dans `live-screen.tsx` :
   - remplacer `aspectRatio: "3 / 4"` par une hauteur en `vh` avec cap : `height: "min(58vh, 520px)"` (au lieu de laisser l'aspect ratio exploser la hauteur sur écrans larges).
   - garder `object-cover` avec `objectPosition: "center 45%"` pour centrer le sujet.

3. **Fallback visuel** — si l'image ne charge pas (`onError`), garder le fond navy plein plutôt qu'un carré vide. Ajouter un léger dégradé radial gold en overlay pour rester dans la charte même sans image.

4. **Vérification** — après implémentation, capturer un screenshot de la preview en mobile (390 px) ET en tablet (702 px) via Playwright pour confirmer que la scène est bien visible dans les deux cas.

## Fichiers touchés

- `src/assets/seller-hero.png.asset.json` (remplacer par version recadrée)
- `src/screens/live-screen.tsx` (bloc hero du `if (!profile.is_seller)`)

## Ce qui ne change pas

- La structure de la page (titre, 3 features, bouton gold, dialogue de confirmation) reste identique.
- Le flux `becomeSeller` inchangé.
