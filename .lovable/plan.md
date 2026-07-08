Objectif : quand tu tapes une notification (push OS ou cloche in-app), l'app ouvre directement le bon écran (live, commande, vendeur, chat).

## 1. Router de deep-link (client)

Nouveau `src/lib/push-router.ts` : traduit `data.kind` en action UI.

| `kind`   | Champs attendus | Action                                            |
| -------- | --------------- | ------------------------------------------------- |
| `live`   | `live_id`       | Ouvre le live viewer                              |
| `order`  | `order_id`      | Tab Activité → ouvre `OrderDetailScreen`          |
| `seller` | `seller_handle` | Ouvre la fiche vendeur                            |
| `chat`   | `live_id`       | Ouvre le live viewer avec chat visible            |
| `notif`  | —               | Tab Activité (par défaut)                         |

Comme les contextes (`useLiveViewer`, `useSellerProfile`, tab actif) vivent dans React, le router émet un `CustomEvent("kidi:push-open", { detail })` que `AppShellInner` écoute et exécute (il a accès à toutes les contexts).

## 2. Listeners de tap (client)

Dans `src/lib/push.tsx` (PushProvider) :
- ajouter `PushNotifications.addListener("pushNotificationActionPerformed", …)` → dispatch `kidi:push-open`
- au boot, `PushNotifications.getDeliveredNotifications()` pour gérer le cold-start (app fermée quand la notif arrive)
- foreground `pushNotificationReceived` : toast cliquable qui déclenche la même action

Dans `src/screens/activity-screen.tsx` : le tap sur une notification in-app appelle aussi le router (aujourd'hui il ne fait que marquer lue).

## 3. Fanout serveur (BDD → FCM)

Aujourd'hui `_push_notification()` insère seulement une ligne dans `public.notifications`. J'ajoute :

- **Migration SQL** : trigger `AFTER INSERT ON public.notifications` qui appelle `pg_net.http_post` vers `/api/public/notifications-fanout` avec la ligne complète + un shared secret.
- **Route TSS** `src/routes/api/public/notifications-fanout.ts` (vérifie signature via `NOTIFICATIONS_FANOUT_SECRET`) :
  - dérive `kind` de deep-link à partir de `notifications.kind` (mapping : `order_*` → `order`, `live_started` → `live`, `new_follower` → `seller`, `chat_*` → `chat`, sinon `notif`)
  - construit le `data` payload avec `order_id` etc.
  - appelle `sendFcmToUser(user_id, { notification, data })`

Résultat : **toute** notification insérée en BDD envoie automatiquement un push FCM deep-linké — les flux existants (commande expédiée, livrée, remboursée, escrow libéré…) fonctionnent immédiatement.

## 4. Route admin de test

`src/routes/api/admin/test-push.ts` : accepter un champ `data` optionnel pour tester chaque `kind` (`live`, `order`, `seller`, `chat`).

## Détails techniques

- Nouveau secret généré : `NOTIFICATIONS_FANOUT_SECRET` (48 chars).
- Le trigger utilise `pg_net` (déjà activé sur Cloud) en mode fire-and-forget ; échec HTTP → notif in-app existe toujours, seul le push est perdu.
- URL cible du trigger : `https://project--{project-id}.lovable.app/api/public/notifications-fanout` (stable, publié).
- Nouveau `chat_id` / `live_id` / `seller_handle` : on ajoute une colonne `data jsonb` à `public.notifications` (nullable) pour transporter ces champs sans multiplier les colonnes. `_push_notification()` gagne un paramètre `_data jsonb DEFAULT NULL`. Rétrocompatible.
- Le fanout ne s'exécute qu'en prod (URL publiée) — en preview les pushs ne partent pas mais les rows sont bien créées.

## Fichiers touchés

- `src/lib/push-router.ts` (nouveau)
- `src/lib/push.tsx` (listeners tap + cold-start)
- `src/components/app-shell.tsx` (listener `kidi:push-open` → contextes)
- `src/screens/activity-screen.tsx` (tap notif in-app → router)
- `src/routes/api/admin/test-push.ts` (support `data`)
- `src/routes/api/public/notifications-fanout.ts` (nouveau)
- Migration SQL : colonne `data jsonb`, trigger fanout, `_push_notification` étendue.

Rappel : après merge il faut **republier** pour que le trigger atteigne la nouvelle route.