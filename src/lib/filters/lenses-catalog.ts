// Catalogue des lenses/filtres disponibles pendant un live.
//
// Deux familles :
// - Lenses Snap Camera Kit (`isSnapLens: true`) : vrais filtres AR (suivi du
//   visage, maquillage, masques 3D) chargées dynamiquement depuis le Lens
//   Group KIDI+ (voir camera-kit.ts). Rendues par le moteur WebAssembly Snap.
// - Styles CSS (`webPreview`) : simples effets de couleur appliqués en CSS
//   sur le <video>. Conservés comme styles rapides + fallback si Camera Kit
//   n'est pas disponible (WebGL2 absent, réseau bloqué...).

export type LensCategory = "beauty" | "fun" | "style" | "background" | "snap" | "none";

export type Lens = {
  /** ID de lens Snap Camera Kit, ou identifiant local pour les styles CSS. */
  lensId: string;
  /** Groupe de lenses Camera Kit. */
  groupId: string;
  /** Nom affiché sous la vignette. */
  name: string;
  /** Emoji affiché si pas de vignette Snap. */
  icon: string;
  /** Vignette fournie par Snap (lenses réelles uniquement). */
  iconUrl?: string;
  category: LensCategory;
  /** Aperçu CSS (`filter:`). `"none"` pour les lenses Snap — le moteur AR rend le vrai effet. */
  webPreview: string;
  /** true = vraie lens AR Snap (rendue par Camera Kit, pas par CSS). */
  isSnapLens?: boolean;
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
