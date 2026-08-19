// Traduit les erreurs brutes de LiveKit Egress en messages actionnables (FR).
// Sans ça, l'app affiche des toasts opaques comme « egress minutes exceeded »
// ou « Bad Request » quand un vendeur tente un restream YouTube/Facebook/TikTok.

export function egressErrorMessage(raw: string): string {
  const msg = (raw || "").toLowerCase();

  if (msg.includes("minutes exceeded") || msg.includes("quota")) {
    return "Quota LiveKit Egress épuisé : le restream (YouTube / Facebook / TikTok) est indisponible tant que les minutes Egress ne sont pas rechargées sur le compte LiveKit. Ton live KiDi+ continue normalement.";
  }
  if (msg.includes("bad request")) {
    return "LiveKit a refusé la demande de restream (Bad Request). Vérifie que l'Egress est activé sur le projet LiveKit et que la clé de diffusion de la plateforme est valide.";
  }
  if (msg.includes("unauthorized") || msg.includes("permission")) {
    return "Accès Egress refusé : les identifiants LiveKit n'autorisent pas le Web Egress.";
  }
  if (msg.includes("resource") && msg.includes("exhausted")) {
    return "LiveKit n'a plus de capacité Egress disponible pour le moment. Réessaie dans quelques minutes.";
  }
  if (msg.includes("egress")) return raw;
  return "Impossible de démarrer le Web Egress LiveKit — Egress est-il activé ?";
}
