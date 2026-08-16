# Battle de ventes (PK ventes) — plan technique

Deux vendeurs en écran splitté dans un même live, manche chronométrée, score de ventes en temps réel, révélation du gagnant.

## Ce qui existe déjà et qu'on réutilise

- **LiveKit** : `src/lib/livekit.ts` (tokens, caméra, ladder de résolution), `src/routes/api/livekit-token.ts` (émission de token, rôle `host`/`viewer`, autorisation par `lives.seller_id` **ou** `live_moderators`), `broadcast-video.tsx` (publisher hôte), `viewer-live-video.tsx` (abonné — sélectionne aujourd'hui **une seule** piste vidéo distante).
- **Temps réel** : `useLiveRoom` (`src/lib/live-room.ts`) — canal Supabase unique par live, broadcast d'événements éphémères + `postgres_changes` + presence. C'est le canal naturel pour les événements de battle.
- **Invitations entre vendeurs** : `src/lib/moderators-db.ts` + table `live_moderators` (règle « doit suivre l'hôte », limite 3, hooks realtime). Même schéma d'UX pour inviter un co-hôte.
- **Habillage de fin de manche** : `winner-reveal.tsx`, `confetti.tsx`, `sudden-death-flash.tsx`, `auction-final-countdown.tsx`, `bid-pulse-flash.tsx` — réutilisables tels quels avec des props « camp A / camp B ».
- **Commandes** : `create_live_order` (RPC) → `orders` avec `live_id`, `product_id`, `seller_id`, `paid_at`, `status`.

## Point de blocage n°1 (structurel) — à qui appartient la vente

Vérifié dans la migration `20260725022128…` : `create_live_order` fixe `seller_id := lives.seller_id`. Aujourd'hui **tout** ce qui se vend dans un live est crédité à l'hôte propriétaire du live. Sans changement, les ventes de l'invité seraient encaissées par l'hôte (et donc son solde, ses gains, ses retraits).

Correctif requis dès la v1 : ajouter `live_products.seller_id` (nullable, par défaut = `lives.seller_id`) et faire dériver `create_live_order` de `COALESCE(live_products.seller_id, lives.seller_id)`. Toute la chaîne d'aval (escrow, `credit_seller_earning`, livraison via `resolve_buyer_delivery`, notifications) suit automatiquement puisqu'elle lit `orders.seller_id`. La livraison de l'invité utilise **ses** `seller_delivery_settings`.

## 1. Vidéo co-hôte

**Le room LiveKit accepte déjà plusieurs publishers** — c'est le token et l'UI qui sont mono-hôte.

- **Token** : dans `api/livekit-token.ts`, ajouter au test d'autorisation `host` une 3e voie : être participant accepté d'une battle active sur ce live (`battle_participants` avec `status='accepted'`). Aucune nouvelle route.
- **Publisher invité** : réutiliser `BroadcastVideo` en mode LiveKit avec `role: "host"`, mais sans les outils de l'hôte (pas de fin de live, pas de gestion du live). Nouveau composant fin `battle-cohost-video.tsx` qui l'enveloppe.
- **Affichage splitté** : `viewer-live-video.tsx` sélectionne aujourd'hui une seule piste (`pickRemoteVideoTrack`). Le passer à un mode « 1 ou 2 pistes », clé de tri = identité participant (host = `lives.seller_id`, invité = son id). Nouveau `battle-split-stage.tsx` : deux moitiés verticales 50/50 (portrait mobile → empilé haut/bas, ce qui correspond au PK TikTok), badge nom + score par moitié, séparateur VS animé.
- **Côté hôtes** : chacun voit sa propre caméra locale dans sa moitié et la piste distante de l'autre dans l'autre moitié — même composant, la moitié « moi » branchée sur la piste locale.
- **Handshake** : l'hôte ouvre une feuille « Inviter en battle » listant les vendeurs qu'il suit / qui sont présents dans le live (réutilise `presentViewers` de `useLiveRoom` + `follows`). Recommandation v1 : **uniquement des comptes vendeurs** que l'hôte suit ou qui sont spectateurs du live — évite le spam. Invitation = ligne `battle_invites` (`pending`) + événement broadcast `battle:invite`; l'invité voit une feuille Accepter/Refuser (avec push si hors app en v2). À l'acceptation → `battle_sessions` + 2 `battle_participants`, événement `battle:start`.
- **Cas limites** :
  - Invité déconnecté : heartbeat `last_seen_at` (10 s) côté participants + `ParticipantDisconnected` LiveKit. Grâce de 30 s avec overlay « reconnexion… », l'écran reste splitté, le chrono continue.
  - Au-delà de 30 s (ou départ volontaire) : battle terminée par forfait, score figé, `WinnerReveal` avec mention « abandon », retour au plein écran de l'hôte.
  - L'hôte principal quitte / termine le live : la battle se clôt avec le live (déjà couvert par `expire_abandoned_lives` — étendre pour clôturer les battles ouvertes).
  - Réseau instable : la reconnexion LiveKit existante (watchdog de frame gelée dans `viewer-live-video.tsx`) s'applique; l'état de battle est re-hydraté depuis la DB à la reconnexion, jamais depuis le broadcast seul (même logique que les enchères).
  - Garde-fou : une seule battle active par live, un vendeur ne peut être invité que dans une battle à la fois.

## 2. Tableau de score en temps réel

**Recommandation sur ce qui compte** : le **montant payé** (`orders.total` hors frais de livraison, converti dans la devise de l'hôte via `convert_money`), pour les commandes dont `paid_at` tombe dans la fenêtre de la manche, `status` payé/en escrow, et `live_id` = le live. Un compteur secondaire « nb d'articles » est affiché en petit. Raison : le montant est la métrique qui reflète la performance de vente et évite qu'un vendeur gagne en bradant 20 petits articles; le compte d'articles reste utile visuellement. Les commandes annulées/expirées/remboursées sont décomptées en direct (le score peut baisser). Les cadeaux (`live_gifts`) **ne comptent pas** en v1.

- **Agrégation** : trigger sur `orders` (INSERT + UPDATE de `status`/`paid_at`) qui, si une battle est active sur `live_id` et que `seller_id` correspond à un participant, met à jour `battle_participants.score_amount` / `score_items`. Source de vérité en DB, jamais un calcul client.
- **Diffusion** : `postgres_changes` sur `battle_participants` (déjà le pattern de `live_products`/`live_bids` dans `useLiveRoom`) + un broadcast `battle:score` pour l'animation immédiate. Nouveaux champs dans `LiveRoomState` : `battle`, `battleScores`, `broadcastBattle*`.
- **Chrono & habillage** : la manche a un `ends_at` en DB, comme `auction_deadline_at` — même logique anti-dérive et de re-hydratation. On réutilise `AuctionFinalCountdown` (10 dernières secondes), `SuddenDeathFlash` en cas d'égalité (prolongation de 30 s, recommandée), `WinnerReveal` + `Confetti` à la révélation, `bid-pulse-flash` à chaque vente encaissée.

## 3. Modèle de données

Nouvelles tables (schéma `public`, avec `GRANT` + RLS) :

- `battle_invites` — `id`, `live_id`, `from_seller_id`, `to_seller_id`, `status` (pending/accepted/declined/expired), `expires_at`, horodatages.
- `battle_sessions` — `id`, `live_id`, `status` (pending/running/ended/cancelled), `started_at`, `ends_at`, `duration_sec`, `winner_seller_id`, `end_reason` (timeout/forfait/annulée), `currency`.
- `battle_participants` — `battle_id`, `seller_id`, `display_name`, `side` (a/b), `score_amount`, `score_items`, `last_seen_at`, `left_at`. Clé primaire `(battle_id, seller_id)`.
- Colonnes ajoutées : `live_products.seller_id` (voir point de blocage n°1), `orders.battle_id` (nullable, pour l'attribution et les stats post-battle).

RLS :
- Lecture publique (`anon` + `authenticated`) des sessions/participants d'un live dont le statut est visible — nécessaire pour que les spectateurs voient le score.
- Écriture uniquement via des fonctions `SECURITY DEFINER` (`battle_invite`, `battle_accept`, `battle_decline`, `battle_heartbeat`, `battle_end`), pas d'INSERT/UPDATE direct — même posture que `create_live_order` et `finalize_auction_winner`. Le score n'est jamais écrit par un client.
- `battle_invites` : lisible par l'émetteur et le destinataire seulement.
- Ajouter les tables de battle à la publication realtime.

## 4. Coût & contraintes

- **Egress LiveKit** : c'est le poste dominant. Avec 2 publishers, chaque spectateur s'abonne à 2 pistes → **l'egress double par spectateur**. Mesures : publier l'invité en 540p max (le ladder existe déjà dans `HOST_VIDEO_RESOLUTION_CHAIN`), activer simulcast, et limiter la durée d'une manche (3 / 5 minutes) pour borner la dépense. Estimation d'ordre de grandeur : une battle de 5 min avec 200 spectateurs ≈ 2× l'egress d'un live normal sur la même durée. Prévoir un plafond (durée max, nb de battles/jour) avant ouverture générale.
- **Egress de restream (YouTube/Facebook/TikTok)** : la composition actuelle (`broadcast-composition.tsx`, `egress-template`) est mono-hôte. En v1, **désactiver la battle quand un restream social est actif**; adapter le template en v2.
- **Mobile / WebView** : pas de double caméra — chaque téléphone ne publie que sa propre caméra, donc pas de contrainte nouvelle de capture. Points d'attention : consommation batterie/CPU accrue (décodage de 2 flux côté spectateur, encodage + décodage côté hôtes) → **désactiver les filtres Camera Kit et les effets fond vert pendant une battle** en v1 (ils sont déjà les plus coûteux en CPU). Permissions caméra/micro de l'invité : réutiliser `ensureCameraMicAccess`; l'invité doit accorder les permissions **avant** l'acceptation, sinon l'invitation échoue proprement. PiP natif (`pip-native.ts`) : composer les 2 pistes est complexe → en v1, PiP affiche l'hôte principal seulement.

## 5. Phasage & estimation

**v1 — minimum viable (≈ 6 à 8 jours de dev)**
1. Migration : tables battle, `live_products.seller_id`, `orders.battle_id`, RPC + RLS, mise à jour de `create_live_order` — 1,5 j
2. Token co-hôte + `battle_participants` accepté dans `api/livekit-token.ts` — 0,5 j
3. Invitation / acceptation (feuilles UI + `battles-db.ts` + événements dans `useLiveRoom`) — 1,5 j
4. Écran splitté (viewer + les 2 hôtes), multi-pistes dans `viewer-live-video.tsx` — 2 j
5. Score serveur (trigger + realtime) et HUD de score + chrono — 1,5 j
6. Fin de manche : `WinnerReveal` / `Confetti` / égalité, gestion des déconnexions et du forfait — 1 j
7. i18n FR/EN, garde-fous (pas de battle si restream actif, filtres coupés) — 0,5 j

**v2 — complet (≈ 4 à 6 jours)**
- Composition restream à 2 flux (YouTube/Facebook/TikTok).
- Push notification d'invitation hors app, invitations depuis le profil vendeur.
- Manches multiples (best-of-3), prolongation « mort subite » configurable.
- Récompenses au gagnant (badge, mise en avant Accueil), historique des battles sur le profil vendeur.
- Cadeaux comptabilisés en bonus de score (optionnel, à trancher).
- Statistiques post-battle dans `broadcast-summary.tsx` et « Mes gains ».

### Fichiers touchés
`src/lib/live-room.ts`, `src/lib/livekit.ts`, `src/routes/api/livekit-token.ts`, `src/components/broadcast/broadcast-live.tsx`, `src/components/broadcast/broadcast-video.tsx`, `src/components/broadcast/host-tool-rail.tsx`, `src/components/live-viewer/viewer-live-video.tsx`, `src/components/live-viewer/real-live-viewer-screen.tsx`, `src/components/live-viewer/winner-reveal.tsx`, `src/lib/lives-db.ts`, `src/lib/orders-db.ts`, `src/i18n/fr.json`, `src/i18n/en.json`.

### Nouveaux fichiers
`src/lib/battles-db.ts`, `src/lib/battle-context.tsx`, `src/components/battle/battle-invite-sheet.tsx`, `battle-incoming-invite-sheet.tsx`, `battle-split-stage.tsx`, `battle-score-hud.tsx`, `battle-cohost-video.tsx`, `battle-result-overlay.tsx`, plus la migration Supabase.

## Décisions à confirmer avant de coder
1. Qui peut être invité : vendeurs suivis par l'hôte + vendeurs présents dans le live (proposition) ou tout vendeur ?
2. Durée de manche : 3 min, 5 min, ou choix de l'hôte parmi une liste ?
3. Score = montant payé (proposition) ou nombre d'articles ?
4. Les cadeaux comptent-ils dans le score ? (proposition : non en v1)
