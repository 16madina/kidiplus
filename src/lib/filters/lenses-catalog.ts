// Catalogue des lenses/filtres disponibles pendant un live.
//
// Structure alignée sur Snap Camera Kit (`lensId` + `groupId`) pour qu'on puisse,
// côté natif (Capacitor plugin Swift/Kotlin), appeler directement :
//   cameraKit.lenses.repository.get(lensID: id, groupID: SNAP_LENS_GROUP_ID)
//
// Sur web (mode démo), on utilise `webPreview` — une chaîne CSS `filter:` appliquée
// sur l'élément <video> local. Ça n'est PAS un vrai filtre AR facial, mais ça permet
// au host de tester la UI, choisir un style, et voir l'aperçu avant/pendant le live.
// La vraie tracking faciale (masques, effets, transformations) arrivera avec le
// plugin natif Camera Kit dans l'app iOS/Android.

export type LensCategory = "beauty" | "fun" | "style" | "background" | "none";

export type Lens = {
  /** ID Snap Camera Kit (UUID fourni par le portail my-lenses.snapchat.com). */
  lensId: string;
  /** Groupe de lenses (le "Demo Lens Group ID" pour l'instant). */
  groupId: string;
  /** Nom affiché sous la vignette. */
  name: string;
  /** Emoji / icône affichée dans le carrousel avant qu'on ait les vraies vignettes Snap. */
  icon: string;
  category: LensCategory;
  /** Aperçu web (CSS `filter` string). Ignoré sur natif — Camera Kit prend le relais. */
  webPreview: string;
};

// Group ID du Demo Lens Group fourni par le portail Snap pour KIDI+.
export const SNAP_DEMO_LENS_GROUP_ID = "5b22f85d-3308-452f-8bcc-058a5c9dc34b";

// Aucun filtre = vidéo brute.
export const NONE_LENS: Lens = {
  lensId: "none",
  groupId: SNAP_DEMO_LENS_GROUP_ID,
  name: "Aucun",
  icon: "🚫",
  category: "none",
  webPreview: "none",
};

// Placeholders : à remplacer par les vrais lensId récupérés côté natif via
// `cameraKit.lenses.repository.snapshot(groupID:)`. Les noms/icônes servent
// juste à peupler la UI carrousel dès maintenant.
export const LENSES: Lens[] = [
  NONE_LENS,
  {
    lensId: "demo-beauty-smooth",
    groupId: SNAP_DEMO_LENS_GROUP_ID,
    name: "Éclat",
    icon: "✨",
    category: "beauty",
    webPreview: "brightness(1.08) contrast(1.03) saturate(1.15)",
  },
  {
    lensId: "demo-beauty-glow",
    groupId: SNAP_DEMO_LENS_GROUP_ID,
    name: "Glow",
    icon: "🌟",
    category: "beauty",
    webPreview: "brightness(1.12) contrast(0.98) saturate(1.2) blur(0.4px)",
  },
  {
    lensId: "demo-style-vintage",
    groupId: SNAP_DEMO_LENS_GROUP_ID,
    name: "Vintage",
    icon: "📸",
    category: "style",
    webPreview: "sepia(0.35) contrast(1.1) saturate(0.85)",
  },
  {
    lensId: "demo-style-noir",
    groupId: SNAP_DEMO_LENS_GROUP_ID,
    name: "Noir",
    icon: "🎬",
    category: "style",
    webPreview: "grayscale(1) contrast(1.15) brightness(0.95)",
  },
  {
    lensId: "demo-style-warm",
    groupId: SNAP_DEMO_LENS_GROUP_ID,
    name: "Chaud",
    icon: "🔥",
    category: "style",
    webPreview: "sepia(0.15) saturate(1.3) hue-rotate(-8deg) brightness(1.05)",
  },
  {
    lensId: "demo-style-cool",
    groupId: SNAP_DEMO_LENS_GROUP_ID,
    name: "Froid",
    icon: "❄️",
    category: "style",
    webPreview: "saturate(1.2) hue-rotate(15deg) brightness(1.03)",
  },
  {
    lensId: "demo-fun-dream",
    groupId: SNAP_DEMO_LENS_GROUP_ID,
    name: "Rêve",
    icon: "💭",
    category: "fun",
    webPreview: "blur(1px) brightness(1.15) saturate(1.4) contrast(0.95)",
  },
  {
    lensId: "demo-fun-neon",
    groupId: SNAP_DEMO_LENS_GROUP_ID,
    name: "Néon",
    icon: "💫",
    category: "fun",
    webPreview: "saturate(2) contrast(1.2) hue-rotate(20deg)",
  },
  {
    lensId: "demo-fun-pop",
    groupId: SNAP_DEMO_LENS_GROUP_ID,
    name: "Pop",
    icon: "🎨",
    category: "fun",
    webPreview: "saturate(1.8) contrast(1.15) brightness(1.05)",
  },
];
