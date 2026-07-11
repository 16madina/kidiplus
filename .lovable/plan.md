Je vais corriger l’écran de recharge du portefeuille pour que les moyens de paiement ne ressemblent plus à une simple liste non cliquable.

Plan :
1. Ajouter un état de sélection pour la méthode de paiement : Carte bancaire, Wave Visa, Orange Visa, et Djamo si disponible.
2. Transformer chaque ligne de méthode en bouton sélectionnable avec un seul choix actif à la fois.
3. Afficher clairement les logos Wave, Orange Money et Djamo à gauche, avec une icône carte pour Carte bancaire.
4. Mettre un indicateur visuel propre sur la méthode choisie, sans que toutes les méthodes paraissent sélectionnées.
5. Garder le paiement réel à l’étape Stripe actuelle, sans changer la logique de recharge ni les montants.