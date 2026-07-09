## Problème

Les images des articles ne s'affichent ni dans l'aperçu de la fiche "Modifier l'article", ni sur la carte de la boutique.

Vérifications faites en base :
- Les fichiers sont bien uploadés (mime `image/png`, tailles réelles ~1 MB).
- Le chemin est bien enregistré dans `shop_products.image_url`.
- Le bucket `shop-products` est **privé** → on doit générer une URL signée (24h) à chaque affichage. C'est cette signature qui échoue silencieusement dans certains contextes (aperçu iframe, live différé > 24h, spectateur non-authentifié), d'où les cadres vides.

## Solution

Passer le bucket `shop-products` en **public** et utiliser des URLs publiques stables. Le contenu (photo d'un article en vente) n'a aucune sensibilité, ça correspond à l'usage.

### Ce que ça change

- Aperçu immédiat dans la fiche article et sur la carte boutique.
- Les spectateurs du live voient l'image sans dépendre d'une URL signée qui expire.
- Les lives programmés à plus de 24h n'ont plus d'images cassées.
- Code plus simple, aucune requête `createSignedUrl` à faire.

### Étapes techniques

1. Passer le bucket `shop-products` en public via l'outil dédié.
2. Ajouter des policies RLS "SELECT public" sur `storage.objects` pour ce bucket (les policies INSERT/UPDATE/DELETE existantes restent réservées au propriétaire).
3. Remplacer `resolveShopImage` par `getPublicShopImageUrl` qui retourne `supabase.storage.from('shop-products').getPublicUrl(path).data.publicUrl` — synchrone, pas de cache, pas d'expiration.
4. Simplifier les composants qui l'utilisent :
   - `src/screens/my-shop-screen.tsx` : plus besoin de `Promise.all` pour résoudre les URLs, on peut faire `img.src` directement.
   - `src/components/shop/shop-product-form-sheet.tsx` : `useEffect` synchrone.
   - `src/components/shop/shop-picker-sheet.tsx` : idem.
   - `src/components/broadcast/add-product-sheet.tsx` et `broadcast-setup.tsx` : URL publique stockée dans le live product.
5. Ne pas casser les URLs signées déjà stockées dans `live_products.image` — la fonction `resolveShopImage` peut rester en fallback (déjà-est-une-URL → renvoie telle quelle).

### Note

Si la politique workspace bloque les buckets publics, l'outil renverra une erreur ; je te préviendrai pour que tu l'autorises dans Settings → Privacy & Security.
