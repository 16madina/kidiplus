Je vais corriger l’affichage en partant du symptôme visible : le haut du bloc affiche surtout le fond navy/gris, donc l’image est bien trop recadrée ou masquée dans le conteneur.

Plan :
1. Remplacer le rendu actuel en `<img object-cover>` par un hero plus sûr : image en fond avec `background-size: contain`, `background-position: center bottom`, `background-repeat: no-repeat`, pour que le sujet ne soit plus coupé.
2. Réduire la zone navy vide en haut et contraindre le bloc hero à une hauteur stable adaptée à la preview/tablette et au mobile.
3. Garder le dégradé blanc en bas, mais le rendre moins haut si nécessaire pour ne pas recouvrir l’image.
4. Vérifier dans la preview que l’image est visible, pas seulement que le fichier charge.