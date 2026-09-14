# Mode plein écran « à la TikTok » sur l'accueil

Oui, je vois exactement l'option dont tu parles — et c'est faisable : une bonne partie
existe déjà (la Vitrine a déjà un défilement vertical plein écran, et le lecteur de live
a déjà le passage d'un live à l'autre par glissement).

## Ce qu'on ajoute

1. **Un petit bouton de bascule** en haut de l'accueil : vue « cartes » (actuelle) ou vue
   « plein écran ». Le choix est mémorisé pour les prochaines visites.
2. **Mode plein écran = aperçu**. Un live par écran, on glisse vers le haut pour passer au
   suivant. On voit et on entend le live, mais sans y « entrer » :
   - pas de chat, pas d'enchères, pas de cadeaux à l'écran,
   - la personne n'apparaît pas dans la liste des spectateurs,
   - juste le nom du vendeur, le titre, le nombre de spectateurs et un bouton
     **« Rejoindre le live »**.
3. **Entrer dans le live** : le bouton (ou un appui sur l'écran) ouvre le vrai lecteur avec
   tout ce qui s'y passe — enchères, chat, produits, cadeaux.
4. **Une fois entré**, on garde le comportement actuel : glisser vers le haut/bas passe au
   live suivant/précédent, et cette fois on rejoint vraiment chaque live.
5. **Retour en arrière** : un geste de retour depuis le live ramène à la liste d'aperçu, au
   même endroit où on était.

## Détails à régler

- Son coupé par défaut à l'aperçu, avec une petite icône pour l'activer (comportement
  attendu sur mobile, et évite de faire sursauter les gens).
- Seuls les lives réellement en direct passent en vidéo ; les lives programmés et les
  exemples de démonstration affichent leur image de couverture.
- Un seul live joue à la fois ; les voisins sont préchargés pour que le glissement soit
  instantané.
- Textes en français et en anglais.

## Détails techniques

- Nouveau composant `src/components/home/home-live-pager.tsx` : réutilise
  `VitrineVerticalPager` pour le geste et `ViewerLiveVideo` en mode aperçu
  (abonnement vidéo basse résolution, audio coupé, aucune présence envoyée).
- `src/screens/home-screen.tsx` : état `viewMode` ("grid" | "immersive") persisté dans les
  réglages locaux, bouton de bascule dans l'en-tête, rendu conditionnel du pager.
- Entrer dans le live appelle `openList(list, index)` du `live-viewer-context` existant —
  le pager interne du lecteur (playlist + peek) fonctionne déjà.
- Mode aperçu ajouté à `real-live-viewer-screen` / `viewer-live-video` via une prop
  `preview` qui masque les surcouches et saute l'enregistrement de présence.
