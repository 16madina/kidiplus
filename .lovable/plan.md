## Problème

Sur la home, la carte « live démo » passe par 3 états contrôlés par `useDemoVideo()` (un HEAD sur la vidéo) :

- probe en cours → `DemoCardSkeleton` (fond gris/noir uni, **pas d'image**)
- probe OK → `DemoCard` (avec l'image de couverture)
- probe KO → rien du tout

Tant que la probe vidéo n'aboutit pas (lenteur réseau, CORS, 404…), on reste bloqué sur le skeleton noir. C'est ce que tu vois.

L'image de couverture n'a rien à voir avec la disponibilité de la vidéo — elle doit s'afficher tout de suite.

## Correctif

Dans `src/components/home/demo-card.tsx` :

1. **`DemoCardSkeleton`** : ajouter la même `<img>` de couverture (`demo-live-cover.jpg.asset.json`) en fond que `DemoCard`, avec le même overlay + vignette. Le skeleton garde son disque pulsant à la place du bouton play pour signaler le chargement, mais l'image est visible dès la première frame.

2. **Rendu dans `home-screen.tsx`** : quand la probe échoue (`demoAvailable === false`), afficher quand même la carte avec l'image — mais désactiver l'ouverture du player (ou afficher un toast « vidéo indisponible » au clic). L'image reste la vitrine du live démo même si la vidéo n'est pas jointe.

3. Vérifier que l'URL `demoLivePosterAsset.url` renvoie bien 200 (au cas où l'asset lui-même serait cassé) via un rapide test navigateur après le fix.

## Résultat attendu

Dès que la home s'ouvre : ton image de couverture est visible sur la carte, avec les badges DÉMO / LIVE / compteur. Plus jamais de fond noir vide.
