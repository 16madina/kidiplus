# Rendre visible le logo KiDi+ au centre de la barre

## Ce qui ne va pas

Sur ta capture, l'encoche de la pilule est bien là, mais le logo au-dessus est invisible. Deux causes possibles :

1. Le `<Press>` (motion.button en `inline-flex`) peut réduire l'`<img>` à sa taille intrinsèque au lieu de la contraindre à 72×72, donc l'image s'affiche minuscule ou vide.
2. Le `filter: drop-shadow(...)` appliqué sur le bouton s'applique aussi à l'image transparente — s'il y a un souci de rendu, l'image peut disparaître.

## Ce que je vais changer (`src/components/bottom-tab-bar.tsx`)

1. **Remplacer `<Press>` par un `<button>` natif** pour le bouton central, avec :
   - `block` (pas flex) + `h-[72px] w-[72px]`
   - un `<img>` avec `width={72} height={72}` explicites + `className="h-full w-full object-contain block"`
   - `draggable={false}` conservé

2. **Retirer le `filter: drop-shadow`** sur le bouton, le remplacer par une ombre douce dorée dessinée derrière le logo via un pseudo-cercle (`::before` ou un `<span>` `absolute inset-0 rounded-2xl` avec `boxShadow`), pour ne pas dépendre du filter qui peut mal rendre l'image PNG.

3. **Ajouter un `bg-transparent` explicite** et `z-20` sur le bouton, pour être sûr qu'il passe au-dessus de la pilule (qui a `backdrop-filter` créant un stacking context).

4. **Conserver** : l'encoche de la pilule (mask radial-gradient), la position `-top-5`, l'indicateur "en direct" (ping rouge).

## Vérification après changement

- Ouvrir la preview et confirmer que le logo apparaît bien au centre au-dessus de la barre.
- Vérifier qu'il reste cliquable (ouvre l'écran Live).
- Vérifier sur viewport mobile (375px) que le logo reste centré et proportionné.
