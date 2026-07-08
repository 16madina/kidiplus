Constat : l’envoi fonctionne bien. La photo est dans le stockage, le profil contient le nouveau `avatar_url`, et les URLs signées sont bien générées. Le problème vient donc de l’affichage qui garde une image ancienne ou ne force pas le rechargement.

Plan :
1. Dans l’écran de modification du profil, afficher immédiatement un aperçu local de la photo choisie pendant/après l’upload, au lieu d’attendre uniquement l’URL distante.
2. Après la mise à jour du profil, forcer un rafraîchissement du profil global pour que l’écran Profil récupère la nouvelle valeur.
3. Ajouter un petit paramètre anti-cache à l’URL signée affichée pour éviter qu’iOS/le navigateur garde l’ancienne image.
4. Sur l’écran Profil, écouter précisément `profile.avatar_url` et ignorer les anciennes résolutions asynchrones pour éviter qu’une ancienne URL écrase la nouvelle.
5. Vérifier que l’avatar se met à jour dans la fenêtre Modifier le profil et sur la carte Profil après fermeture.