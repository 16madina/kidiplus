Je vais corriger l’écran de recharge pour que l’utilisateur voie directement les champs carte Stripe au lieu d’un grand bloc vide.

Plan :
1. Remplacer le rendu actuel du `PaymentElement` qui reste vide par des champs Stripe explicites : numéro de carte, expiration et CVC.
2. Garder le flux existant de recharge du portefeuille : création du paiement côté backend, confirmation Stripe côté écran de recharge, puis crédit du portefeuille après succès.
3. Forcer la méthode Stripe côté backend sur le paiement par carte pour que le formulaire corresponde exactement à l’écran demandé.
4. Ajouter un état de chargement/erreur plus clair si Stripe ne charge pas, sans bloquer l’utilisateur dans un écran vide.
5. Vérifier dans l’aperçu que les champs carte apparaissent bien et que le bouton “Payer 5 000 FCFA” reste désactivé tant que les champs ne sont pas remplis.