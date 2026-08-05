# Réveil et vérification du backend Kidi+

## Contexte
Le backend Lovable Cloud est actuellement en cours de redémarrage (« starting or applying changes »). Les crédits du workspace viennent d'être rechargés. L'utilisateur demande que le backend soit réveillé et que la connexion à l'app soit vérifiée.

## Objectif
1. S'assurer que le backend Lovable Cloud passe à l'état `ACTIVE_HEALTHY`.
2. Vérifier que l'authentification et les appels base de données fonctionnent.
3. Confirmer à l'utilisateur que l'app installée peut à nouveau se connecter.

## Étapes
1. **Poller `supabase--cloud_status`** jusqu'à ce qu'il retourne `ACTIVE_HEALTHY` (ou indiquer un problème si l'état reste bloqué).
2. **Si l'état est `INACTIVE`** (pas simplement en cours de démarrage), appeler `supabase--resume` pour le réveiller explicitement.
3. **Vérifier l'authentification** : exécuter un test simple (ping auth / DB) pour s'assurer que les connexions passent.
4. **Rapporter** à l'utilisateur : backend opérationnel, et l'app peut être relancée.

## Notes
- Aucune migration ni modification de code n'est requise ; il s'agit seulement d'un réveil/health-check.
- Aucune donnée n'est perdue pendant la pause.
