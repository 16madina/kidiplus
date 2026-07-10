## Plan

1. **Remonter les actions d’accueil**
   - Réduire l’espace vertical réservé à l’image pour que les trois boutons tiennent toujours dans l’écran mobile.
   - Garder le bloc de boutons au-dessus de la zone basse/safe-area, visible sans scroll.

2. **Ajouter un bouton invité plus évident**
   - Afficher `Continuer en tant qu’invité` directement sous `Se connecter`, avec un style lisible et contrasté.
   - Réduire ou supprimer le séparateur `OU` si nécessaire pour gagner de la place.

3. **Ajuster l’image comme demandé**
   - Centrer l’image de fond.
   - La réduire avec `object-contain`/scale pour éviter que le badge “LIVE/Like” passe derrière le logo KIDI+.
   - Renforcer le z-index du logo et du texte pour qu’ils restent au-dessus.

4. **Vérifier en mobile**
   - Contrôler la vue 430×762 pour confirmer que le logo n’est plus caché et que le bouton invité est visible.