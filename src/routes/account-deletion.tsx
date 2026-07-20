import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/account-deletion")({
  component: AccountDeletionPage,
  head: () => ({
    meta: [
      { title: "Suppression de compte — KiDi+" },
      {
        name: "description",
        content:
          "Comment demander la suppression de votre compte KiDi+ et des données associées, directement depuis l'application ou par email.",
      },
      { property: "og:title", content: "Suppression de compte — KiDi+" },
      {
        property: "og:description",
        content:
          "Procédure pour supprimer votre compte KiDi+ et vos données.",
      },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://kidiplus.com/account-deletion" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Suppression de compte — KiDi+",
          description:
            "Comment demander la suppression de votre compte KiDi+ et des données associées.",
          inLanguage: "fr",
          mainEntityOfPage: "https://kidiplus.com/account-deletion",
          image: "https://kidiplus.com/icon-512.png",
          datePublished: "2025-01-01",
          dateModified: "2026-07-10",
          author: { "@type": "Organization", name: "KiDi+", url: "https://kidiplus.com" },
          publisher: {
            "@type": "Organization",
            name: "KiDi+",
            logo: {
              "@type": "ImageObject",
              url: "https://kidiplus.com/icon-512.png",
              width: 512,
              height: 512,
            },
          },
        }),
      },
    ],
  }),
});

function AccountDeletionPage() {
  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <h1 className="text-[28px] font-bold leading-tight">
          Suppression de compte KiDi+
        </h1>
        <p className="mt-3 text-[15px] text-muted-foreground">
          Développeur : KiDi+ &middot; Application : KiDi+ (com.kidiplus.app)
        </p>

        <section className="mt-8 space-y-3">
          <h2 className="text-[20px] font-semibold">
            Depuis l&apos;application (recommandé)
          </h2>
          <ol className="ml-5 list-decimal space-y-2 text-[15px] leading-relaxed">
            <li>Ouvrez l&apos;application KiDi+ et connectez-vous.</li>
            <li>
              Allez dans l&apos;onglet <strong>Profil</strong>.
            </li>
            <li>
              Ouvrez <strong>Compte</strong> puis{" "}
              <strong>Supprimer mon compte</strong>.
            </li>
            <li>
              Confirmez la suppression. Votre compte et vos données sont
              supprimés immédiatement.
            </li>
          </ol>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-[20px] font-semibold">Par email</h2>
          <p className="text-[15px] leading-relaxed">
            Si vous ne pouvez pas accéder à l&apos;application, envoyez un
            email à{" "}
            <a
              href="mailto:support@kidiplus.com?subject=Suppression%20de%20compte"
              className="font-semibold underline"
            >
              support@kidiplus.com
            </a>{" "}
            depuis l&apos;adresse email associée à votre compte, avec l&apos;objet
            « Suppression de compte ». Nous traitons la demande sous 7 jours
            ouvrés.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-[20px] font-semibold">Données supprimées</h2>
          <p className="text-[15px] leading-relaxed">
            Lorsque vous supprimez votre compte, les données suivantes sont
            supprimées définitivement :
          </p>
          <ul className="ml-5 list-disc space-y-1 text-[15px] leading-relaxed">
            <li>Profil (nom d&apos;affichage, @handle, email, avatar, bio)</li>
            <li>Historique de lives et produits créés</li>
            <li>Messages de chat, enchères, favoris</li>
            <li>Signalements et blocages émis</li>
            <li>Portefeuille interne et historique de transactions internes</li>
          </ul>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-[20px] font-semibold">Données conservées</h2>
          <p className="text-[15px] leading-relaxed">
            Pour des raisons légales, comptables et de lutte contre la fraude,
            certaines données peuvent être conservées de manière anonymisée
            ou pseudonymisée :
          </p>
          <ul className="ml-5 list-disc space-y-1 text-[15px] leading-relaxed">
            <li>
              Factures et enregistrements de paiement (obligation comptable —
              jusqu&apos;à 10 ans)
            </li>
            <li>
              Journaux techniques anti-fraude (durée limitée, IP tronquée)
            </li>
          </ul>
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Les paiements traités par Stripe sont soumis à la politique de
            conservation de Stripe.
          </p>
        </section>

        <section className="mt-8 space-y-3">
          <h2 className="text-[20px] font-semibold">Contact</h2>
          <p className="text-[15px] leading-relaxed">
            Pour toute question :{" "}
            <a
              href="mailto:support@kidiplus.com"
              className="font-semibold underline"
            >
              support@kidiplus.com
            </a>
          </p>
          <p className="text-[13px] text-muted-foreground">
            Voir aussi la{" "}
            <Link to="/privacy" className="underline">
              politique de confidentialité
            </Link>{" "}
            et les{" "}
            <Link to="/terms" className="underline">
              conditions d&apos;utilisation
            </Link>
            .
          </p>
        </section>
      </div>
    </main>
  );
}
