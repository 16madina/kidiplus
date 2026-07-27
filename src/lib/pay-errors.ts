// Map a server/Stripe error slug to a translated user-facing message.
// The server route returns one of these slugs in `body.error`:
//   - stripe_not_configured   → paiement non configuré
//   - card_declined           → carte refusée
//   - currency_not_supported  → devise non supportée
//   - invalid_amount          → montant invalide
//   - rate_limited            → trop de tentatives
//   - stripe_error / anything → erreur générique
// Plus internal client-only ones:
//   - "network"      → réseau
//   - "notSignedIn"  → non connecté
import type { TFunction } from "i18next";

export function mapPayErrorToI18n(t: TFunction, code: string | undefined): string {
  switch ((code ?? "").toLowerCase()) {
    case "stripe_not_configured":
      return t("pay.errors.notConfigured");
    case "card_declined":
      return t("pay.errors.cardDeclined");
    case "currency_not_supported":
      return t("pay.errors.currencyNotSupported");
    case "invalid_amount":
      return t("pay.errors.invalidAmount");
    case "rate_limited":
      return t("pay.errors.rateLimited");
    case "network":
      return t("pay.errors.network");
    case "notsignedin":
    case "not_signed_in":
      return t("pay.errors.notSignedIn");
    case "unauthorized":
      return t("pay.errors.notSignedIn");
    case "insufficient_funds":
      return t("wallet.insufficient");
    case "conversion_unavailable":
      return t("pay.errors.conversionUnavailable", {
        defaultValue: "Conversion de devise indisponible. Réessaie ou paie par carte.",
      });
    case "order_not_pending":
      return t("pay.errors.orderNotPending", {
        defaultValue: "Cette commande n'est plus en attente de paiement.",
      });
    case "order_not_found":
      return t("pay.errors.orderNotFound", {
        defaultValue: "Commande introuvable.",
      });
    case "forbidden":
      return t("pay.errors.forbidden", {
        defaultValue: "Tu ne peux pas payer cette commande.",
      });
    default:
      return t("pay.errors.generic");
  }
}
