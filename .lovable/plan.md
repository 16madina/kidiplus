## Objectif

Ajouter dans l'Admin Panel un bouton "Vidéo démo" qui te laisse **uploader un nouveau .mp4** ; la carte Démo de la home utilisera automatiquement la nouvelle vidéo — sans redéploiement, sans passer par le code.

## Comment ça marchera pour toi

1. Profil → Admin → onglet **Overview** → carte "Vidéo démo" (nouveau).
2. Tu vois la vidéo actuelle (lecteur intégré) + la date de mise à jour.
3. Bouton **"Remplacer la vidéo"** → sélecteur de fichier (.mp4 / .webm / .mov, max 100 MB).
4. Barre de progression pendant l'upload, puis toast de confirmation.
5. La carte Démo sur la home affiche la nouvelle vidéo **immédiatement** (cache-busté par URL).

## Détails techniques

**Backend (Lovable Cloud)**

- Bucket Storage public `demo-videos` (SELECT anon, INSERT/UPDATE/DELETE réservés aux admins via policy `has_role(auth.uid(),'admin')`).
- Table `public.app_settings (key text PK, value jsonb, updated_at timestamptz, updated_by uuid)`.
  - GRANT SELECT à `anon` + `authenticated` (lecture publique de la config non sensible).
  - GRANT INSERT/UPDATE réservé via RLS aux admins.
  - Ligne `key='demo_video'` → `value = { url, size, content_type, uploaded_at }`.
- La vidéo actuelle (CDN Lovable Assets) reste le **fallback** si aucun override n'existe.

**Frontend**

- `src/lib/demo-video-db.ts` :
  - `fetchDemoVideoUrl()` — lit `app_settings.demo_video`, retourne l'URL ou le fallback bundlé.
  - `uploadDemoVideo(file)` — upload dans le bucket sous `demo-video-{timestamp}.mp4`, puis upsert dans `app_settings`.
- `src/components/home/demo-card.tsx` :
  - `useDemoAvailable()` remplacé par `useDemoVideo()` qui charge d'abord l'URL depuis la DB, puis fait le HEAD probe.
  - `DemoPlayer` reçoit l'URL en prop (plus d'import statique).
- `src/components/admin/admin-demo-video.tsx` (nouveau) :
  - Aperçu vidéo + input file caché + bouton Upload + progression + gestion d'erreur.
  - Utilise le client Supabase browser (RLS impose déjà l'admin).
- Insertion de la carte dans `OverviewTab` de `admin-dashboard-screen.tsx`, sous les KPIs.

**Sécurité**

- Upload et update de settings gouvernés par RLS `has_role(auth.uid(), 'admin')`.
- Un utilisateur non-admin peut lire la config publique (URL vidéo) mais pas l'écrire.
- Validation côté client : type MIME `video/*`, taille max 100 MB.

## Ce que je NE fais pas

- Pas de suppression des anciennes vidéos (chaque upload crée un nouveau fichier ; tu pourras nettoyer plus tard depuis le dashboard Lovable Cloud si besoin).
- Pas de re-encodage / compression (Apple accepte les .mp4 H.264 directement — c'est ton fichier tel quel).
- Pas de modification du titre/sous-titre de la carte (ça reste dans les traductions).

OK pour que je code ?
