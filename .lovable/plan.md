## Problème

Dans l'écran des zones de livraison, "CÔTE D'IVOIRE" (et quelques autres noms longs comme "RÉPUBLIQUE DÉMOCRATIQUE DU CONGO") débordent visuellement à deux endroits :

1. **Header de groupe de zones** (au-dessus de chaque liste) — le texte en `uppercase tracking-wide` est particulièrement large et casse la mise en page sur mobile étroit.
2. **Items du dropdown de sélection de pays** — le nom en majuscules ne rentre pas dans les 224px (`w-56`), on voit "CÔTE" / "D'IVOIRE" cassés sur deux lignes ou l'ellipse tronquer trop tôt.

Le bouton du picker (image 2) est OK une fois sélectionné : il n'affiche que le drapeau.

## Correctifs proposés (UI uniquement)

1. **Utiliser la casse normale au lieu de MAJUSCULES** pour les noms de pays dans :
   - le header de groupe : retirer `uppercase tracking-wide` sur le `<span>` du nom (garder l'uppercase pour le mot "PAYS" éventuel), passer à `text-[11px] font-semibold normal-case`. "Côte d'Ivoire" est bien plus court que "CÔTE D'IVOIRE".
   - les items du dropdown : idem, casse normale (`countryName` renvoie déjà "Côte d'Ivoire"), taille `text-[12px]`.

2. **Ajouter une map de noms courts** dans `src/lib/delivery-zones-data.ts` (nouvelle fonction `countryShortName(code, locale)`) pour les cas extrêmes :
   - `CD` → "RD Congo" (au lieu de "République démocratique du Congo")
   - `CF` → "Rép. centrafricaine"
   - `GB` → "Royaume-Uni" (déjà court)
   - fallback = `countryName(code, locale)`
   Utilisée uniquement dans le header de groupe et les items du dropdown.

3. **Élargir légèrement le dropdown** de `w-56` à `w-64` (256px) pour donner un peu d'air, tout en gardant `max-w-[calc(100vw-1rem)]` pour la sécurité mobile.

4. **Conserver `min-w-0 truncate` + `title`** déjà en place — inchangé — pour que les rares noms plus longs que le short-name affichent une ellipse propre avec tooltip au survol.

## Fichiers touchés

- `src/lib/delivery-zones-data.ts` — ajouter `countryShortName()` et la map d'overrides.
- `src/components/seller/delivery-settings-screen.tsx` — remplacer `countryName` par `countryShortName` dans le header de groupe et l'item de dropdown ; enlever `uppercase tracking-wide` sur ces deux emplacements ; passer `w-56` → `w-64`.

Aucun changement de logique métier, aucune migration, aucun changement d'API.

## Vérification

- Relancer le picker sur mobile 375px et vérifier que "Côte d'Ivoire" et "RD Congo" tiennent sur une ligne.
- Lancer `tsgo` pour valider les types.
