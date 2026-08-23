# Stabiliser les filtres Camera Kit sur Android

## Objectif

Empêcher définitivement qu’un filtre fige le live Android : utiliser le moteur natif Android lorsqu’il est réellement opérationnel et conserver la caméra LiveKit brute dès que le filtre ne produit plus d’images.

## Constats vérifiés

- Le pont Camera Kit désactive actuellement le chemin natif pour toutes les plateformes avec un retour forcé à `false`.
- Le composant de diffusion et le contexte des filtres interrogent directement le support du SDK Web, au lieu de respecter cette décision centralisée du pont.
- Android exécute donc encore Camera Kit Web (WASM/WebGL) dans la WebView pendant l’encodage LiveKit, précisément le chemin qui se fige sur le téléphone testé.
- Le watchdog actuel utilise les callbacks de lecture d’une vidéo issue de `canvas.captureStream()`. Ces callbacks peuvent continuer même si le canvas répète visuellement la même image, donc le repli vers la caméra brute n’est pas garanti.

## Modifications

1. **Unifier la sélection du moteur**
   - Faire du pont Camera Kit l’unique source de vérité pour le support et le moteur choisi.
   - Supprimer les appels directs au test de support Web dans le contexte, l’aperçu et la diffusion.
   - Garder le chemin natif iOS désactivé tant que sa validation d’image n’est pas fiable, sans désactiver Android avec lui.

2. **Activer Android natif avec preuve d’image**
   - Activer le plugin Camera Kit natif uniquement sur Android quand il est réellement enregistré.
   - Faire remonter depuis le capturer natif le premier frame reçu, puis attendre cette confirmation avant d’annoncer que la publication filtrée fonctionne.
   - Après l’application d’une lens, exiger une nouvelle frame dans un délai court ; un simple retour `applyLens: success` ne suffira plus.

3. **Ajouter une surveillance native continue**
   - Compter les frames Camera Kit envoyées à LiveKit et publier un état de santé au pont JavaScript.
   - Détecter l’absence de nouvelle frame après activation/changement de filtre.
   - Fermer proprement la sortie Camera Kit et la publication native si elle décroche.

4. **Repli sans écran figé**
   - En cas d’échec d’initialisation, de première frame ou de reprise, retirer automatiquement la lens et conserver/recréer la caméra LiveKit brute.
   - Ne plus lancer le pipeline Camera Kit Web dans une WebView Android comme solution de secours ; il restera réservé au navigateur/PWA.
   - Afficher le message existant indiquant que le filtre a été désactivé sur cet appareil.

5. **Fiabiliser le changement de filtre en live**
   - Sérialiser les changements de lens pour éviter deux applications concurrentes.
   - Ignorer les réponses tardives d’une ancienne lens.
   - Ne mettre à jour l’état visuel du filtre qu’après confirmation d’une frame post-filtre.

## Validation

- Vérifier le build TypeScript et le build Android.
- Tester sur Android : live sans filtre, ajout d’un filtre, changement rapide de filtres, retrait du filtre, caméra avant/arrière, arrière-plan/retour dans l’app.
- Confirmer dans Logcat : initialisation native, première frame, frame post-lens et publication LiveKit.
- Simuler une absence de frames et confirmer que le live revient automatiquement à la caméra brute au lieu de rester figé.

## Livraison

Ce correctif touche le plugin Android natif : il faudra générer et installer un nouveau build Android après publication du code web. Une simple publication du site ne suffira pas pour la partie native.
