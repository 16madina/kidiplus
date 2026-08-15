# Bascule vers Supabase externe — environnement de test & validation

Objectif : prouver que le projet Supabase externe (`kidi+`) est fonctionnellement
équivalent à Lovable Cloud **avant** toute déconnexion irréversible.

## 0. Sauvegarde (obligatoire)

- Cloud → Advanced settings → **Export data** → *Full database export*.
- Vérifier que le fichier contient bien schéma **et** données.

## 1. Comparer les deux backends

Le script `scripts/validate-backend.mjs` est en lecture seule. Le lancer une fois
sur chaque backend et comparer les rapports.

```bash
# Backend actuel (Lovable Cloud)
SUPABASE_URL="https://<cloud>.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service_role_cloud>" \
SUPABASE_PUBLISHABLE_KEY="<publishable_cloud>" \
node scripts/validate-backend.mjs --json > /tmp/report-cloud.json

# Backend cible (kidi+)
SUPABASE_URL="https://djwuvxpmvrwfjwjamjno.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="<service_role_kidi>" \
SUPABASE_PUBLISHABLE_KEY="<publishable_kidi>" \
node scripts/validate-backend.mjs --json > /tmp/report-kidi.json

diff <(jq -S . /tmp/report-cloud.json) <(jq -S . /tmp/report-kidi.json)
```

Le script vérifie :

- **Tables** : accessibilité Data API + nombre de lignes (détecte les GRANT manquants).
- **RPC critiques** : existence de chaque fonction (argent, live, enchères, escrow,
  modération, admin). Une fonction absente ⇒ `PGRST202`.
- **Buckets storage** : `avatars`, `shop`, `vitrine`, `payout`, `live-replays`.
- **Auth admin API** : accessible + nombre d'utilisateurs migrés.
- **Lecture anonyme** : la clé publishable peut lire les données publiques (RLS).

Critère de passage : **0 échec** et des volumes de lignes cohérents entre les deux
rapports.

## 2. Tester l'application contre le backend cible (sans déconnecter)

En local (clone GitHub), pointer le `.env` vers `kidi+` :

```
VITE_SUPABASE_URL=https://djwuvxpmvrwfjwjamjno.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable_kidi>
SUPABASE_URL=https://djwuvxpmvrwfjwjamjno.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable_kidi>
SUPABASE_SERVICE_ROLE_KEY=<service_role_kidi>
```

Garder Stripe/PayPal en mode test (`PAYMENTS_MODE=test`, `PAYPAL_MODE=sandbox`).

## 3. Parcours critiques à valider manuellement

| # | Parcours | Attendu |
|---|----------|---------|
| 1 | Inscription e-mail + Google, acceptation EULA | profil créé dans `profiles` |
| 2 | Connexion / déconnexion / refresh | session persistante |
| 3 | Démarrer un live, ajouter un produit | ligne dans `lives`, `live_products` |
| 4 | Enchère + adjudication | `place_live_bid`, `finalize_auction_winner` |
| 5 | Achat prix fixe + paiement carte (test) | `orders` payée, escrow créé |
| 6 | Recharge wallet Stripe (test) | `credit_wallet_topup`, solde à jour |
| 7 | Paiement par wallet | `pay_order_with_wallet` |
| 8 | Gains vendeur | `seller_balances` net = 90 % |
| 9 | Retrait (wallet + gains) | `request_payout` créé |
| 10 | Libération escrow J+3 | `release_overdue_escrow` planifiée via pg_cron |
| 11 | Blocage / signalement | disparition immédiate du contenu |
| 12 | DM, notifications, Vitrine | temps réel fonctionnel |
| 13 | Upload avatar / photo produit / replay | fichiers visibles |
| 14 | Panneau admin | stats, commandes, payouts |

## 4. Points à recréer manuellement sur `kidi+`

Ces éléments ne sont **pas** inclus dans un dump SQL :

- Providers OAuth (Google) + URLs de redirection autorisées.
- Templates d'e-mails d'authentification et SMTP.
- Jobs **pg_cron** (dont `release_overdue_escrow` toutes les 15 min) et extensions
  `pg_cron` / `pg_net`.
- Politiques et CORS des buckets storage + contenu des fichiers.
- Secrets serveur (Stripe, PayPal, LiveKit, R2) — restent côté Lovable, inchangés.

## 5. Feu vert

Ne déconnecter Lovable Cloud que si :

1. Export complet téléchargé et vérifié.
2. `validate-backend.mjs` : 0 échec sur `kidi+`.
3. Les 14 parcours du tableau passent contre `kidi+`.
4. Les jobs cron et providers OAuth sont actifs sur `kidi+`.
