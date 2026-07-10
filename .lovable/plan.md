## Problème

Les logos Wave / Orange Money / Djamo s'affichent en cercles blancs vides dans la sheet "Recharger" (et probablement aussi dans "Payer"). Les fichiers existent sur le CDN et retournent bien 200, mais les balises `<img>` restent visuellement vides dans l'iframe de preview.

La cause probable : on utilise des pointeurs `*.asset.json` avec une URL relative `/__l5e/assets-v1/...`. Selon le contexte d'exécution (preview iframe, publish, natif Capacitor), cette URL relative ne résout pas toujours et le fichier ne se charge pas — donc conteneur blanc, aucune image.

## Correctif

Passer des pointeurs JSON à de vrais fichiers image bundlés par Vite, qui produisent une URL absolue fingerprintée et fonctionnent partout (preview, publish, iOS/Android Capacitor).

### Étapes

1. Télécharger les 3 logos depuis le CDN (URLs actuelles connues) et les écrire comme vrais fichiers dans `src/assets/` :
   - `src/assets/wave-logo.webp`
   - `src/assets/orange-money-logo.png`
   - `src/assets/djamo-logo.png`

2. Supprimer les 3 pointeurs `*.asset.json` associés.

3. Mettre à jour les imports dans :
   - `src/components/wallet/topup-sheet.tsx`
   - `src/components/payments/payment-sheet.tsx`

   Remplacer :
   ```ts
   import waveLogo from "@/assets/wave-logo.asset.json";
   ...
   <img src={waveLogo.url} .../>
   ```
   par :
   ```ts
   import waveLogo from "@/assets/wave-logo.webp";
   ...
   <img src={waveLogo} .../>
   ```
   Idem pour Orange Money et Djamo.

4. Garder le conteneur logo tel quel (`h-10 w-10 rounded-xl bg-white overflow-hidden` + `img object-contain`) — le fond blanc est nécessaire car le logo Djamo est sur fond sombre et Wave a des bords transparents.

5. Vérifier après build : les 3 lignes doivent afficher le vrai logo (Wave = tuile bleue avec pingouin, Orange Money = flèches noir/orange, Djamo = "djamo" sur fond sombre).

Aucun changement de logique métier, aucun changement i18n, aucun changement backend.