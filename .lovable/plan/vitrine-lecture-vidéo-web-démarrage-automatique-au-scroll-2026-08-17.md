# Vitrine : lecture vidéo web + démarrage automatique au scroll

## Ce que montre le diagnostic

J'ai téléchargé et analysé les vidéos réellement servies par le stockage :

- Toutes les publications vidéo pointent bien vers des `.mp4`.
- Codecs vérifiés : **H.264 (avc1) + AAC**, en-tête `moov` en début de fichier (lecture progressive OK), `content-type: video/mp4`, requêtes partielles (`Accept-Ranges`) supportées.

Conclusion : les fichiers sont parfaitement lisibles par Chrome et Firefox. Le message « format non supporté » vient donc du **lecteur de l'application**, pas des vidéos.

Deux causes dans le composant du feed :

1. Le statut ne passe à « prêt » que si un évènement de chargement arrive. Un simple délai de 8 s sans évènement bascule la vidéo en **erreur** et affiche le message « format non supporté », même quand le fichier est valide. L'URL est en plus mémorisée comme « média cassé » pour toute la session, donc elle reste en erreur même après rechargement du feed.
2. Le son : une fois le son « débloqué », l'élément vidéo est rendu **non muet**. Chrome, Firefox, iOS et Android refusent la lecture automatique d'une vidéo avec son → la lecture est bloquée et le bouton Play apparaît. Le code tente bien un repli en muet, mais le rendu React remet aussitôt `muted = false`, ce qui re-bloque la lecture. D'où « il faut toujours appuyer sur Play ».

## Ce que je vais changer

Fichier concerné : le lecteur du feed Vitrine (`vitrine-vertical-pager.tsx`), plus un petit ajustement du registre de médias cassés.

### 1. Ne plus afficher « format non supporté » à tort

- L'erreur ne sera affichée que sur une **vraie erreur média** du navigateur (code `MEDIA_ERR_DECODE` / `SRC_NOT_SUPPORTED`), avec des messages distincts : format non supporté vs. échec de chargement (réseau).
- Le délai de sécurité ne déclenchera plus d'erreur : il affichera la vignette + un bouton « Réessayer » qui relance le chargement (`load()` puis `play()`), au lieu de condamner la vidéo.
- Un test rapide de lisibilité (`canPlayType`) avant de conclure au format non supporté ; les `.mp4` ne pourront plus tomber dans ce cas.
- Le registre « média cassé » ne mémorisera plus que les 404 réels, pas les lenteurs de décodage.

### 2. Démarrage instantané au scroll (comportement TikTok)

- L'élément vidéo est **toujours rendu muet** au départ : c'est la seule façon d'obtenir la lecture automatique garantie sur Chrome, Firefox, Safari iOS et Android.
- Dès que la lecture démarre, le son est réactivé **en impératif** (`el.muted = false`) si l'utilisateur a débloqué le son ; si le navigateur refuse, on reste en muet et un petit indicateur « Toucher pour le son » s'affiche.
- Plus de re-rendu qui remet `muted` : l'état muet est piloté par effet, pas par attribut React, ce qui supprime la remise en pause.
- Préchargement de la diapositive suivante et lancement de `play()` dès que la vidéo devient active, avec relances courtes tant que le décodeur n'est pas prêt.
- Le bouton Play manuel ne reste qu'en dernier recours (lecture réellement refusée).

### 3. Vérification

- Contrôle en navigateur (Chromium) sur le feed : la vidéo active démarre seule, sans message d'erreur, et le passage à la vidéo suivante démarre immédiatement.
- Contrôle console : aucune entrée « média cassé » ajoutée pour ces MP4.

## Notes techniques

- Aucun changement de base de données ni de stockage : les fichiers sont déjà conformes.
- Aucun changement du flux de publication / conversion `.mov` → MP4 déjà en place.
- i18n : ajout d'une clé pour « échec de chargement / Réessayer » en français et anglais.
