Le dropdown Par Pays / par Zones affiche actuellement des emoji drapeaux (🇩🇿, 🇫🇷…). Sur Windows, la police par défaut (Segoe UI) ne les rend pas : on voit les lettres ISO (DZ, FR…) à la place, comme sur la capture.

Objectif : remplacer les emoji drapeaux par des SVG de drapeaux, compatibles tous OS/navigateurs.

1. Installer le package `country-flag-icons` (fournit des SVG React par code pays, léger et tree-shakable).
2. Créer un composant `CountryFlag` dans `src/components/country-flag.tsx` qui prend un `code: string` et retourne le SVG correspondant (`country-flag-icons/react/3x2/{code}`), avec un fallback discret si le code est inconnu.
3. Mettre à jour `src/lib/delivery-zones-data.ts` :
   - Garder le champ `flag` emoji pour ne pas casser d'éventuels consommateurs, mais ne plus l'utiliser pour l'affichage.
   - Ajuster `countryLabel` et `countryFlag` si besoin (le composant `CountryFlag` prendra le relais dans l'UI).
4. Mettre à jour `src/components/seller/delivery-settings-screen.tsx` aux 3 endroits où les drapeaux apparaissent :
   - Bouton pays du picker (ligne ~196)
   - Header de groupe de zones (ligne ~168)
   - Items du dropdown (ligne ~294)
5. Vérifier le rendu visuel dans le preview (dropdown + taille des SVG, espacement).
6. Lancer `tsgo` pour valider le typage.

Impact limité : seule l'UI de livraison est concernée ; pas de changement de données ou de migration.