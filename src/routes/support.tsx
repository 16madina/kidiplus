import { createFileRoute, Link } from "@tanstack/react-router";

const SUPPORT_EMAIL = "support@kidiplus.com";

const FAQ_ITEMS: { q: string; a: string }[] = [
  {
    q: "Comment devenir vendeur ?",
    a: "Ouvrez votre profil, puis « Devenir vendeur ». Vous pourrez créer votre boutique et lancer des lives.",
  },
  {
    q: "Comment recharger mon portefeuille ?",
    a: "Depuis Profil → Portefeuille, choisissez un montant. Les paiements sont sécurisés par Stripe.",
  },
  {
    q: "Quand suis-je payé pour mes ventes ?",
    a: "Les fonds sont libérés après confirmation de réception par l'acheteur (ou automatiquement après le délai prévu). Retirez-les depuis Gains.",
  },
  {
    q: "Un problème avec une commande ?",
    a: "Ouvrez la commande dans Activité, puis « Signaler un problème ». Notre équipe intervient sous 48 h.",
  },
  {
    q: "Comment supprimer mon compte ?",
    a: "Dans l'app : Profil → Compte → Supprimer mon compte. Ou consultez la page Suppression de compte ci-dessous.",
  },
];

export const Route = createFileRoute("/support")({
  component: SupportPage,
  head: () => ({
    meta: [
      { title: "Aide et support — KiDi+" },
      {
        name: "description",
        content:
          "Contactez le support KiDi+, consultez la FAQ et les pages légales : sécurité, confidentialité, suppression de compte.",
      },
      { property: "og:title", content: "Aide et support — KiDi+" },
      {
        property: "og:description",
        content:
          "Support KiDi+ : email, FAQ et liens vers sécurité, confidentialité et suppression de compte.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://kidiplus.com/support" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://kidiplus.com/support" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQ_ITEMS.map((item) => ({
            "@type": "Question",
            name: item.q,
            acceptedAnswer: { "@type": "Answer", text: item.a },
          })),
        }),
      },
    ],
  }),
});

function SupportPage() {
  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <article className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <header className="mb-8">
          <p className="text-sm font-medium text-muted-foreground">KiDi+</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
            Aide et support
          </h1>
          <p className="mt-3 text-muted-foreground">
            Besoin d&apos;aide pour utiliser KiDi+, gérer une commande ou
            signaler un problème ? Notre équipe répond sous 48 heures ouvrées.
          </p>
        </header>

        <Section title="Nous contacter">
          <p>
            Envoyez un email à{" "}
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent("Aide KiDi+")}`}
              className="font-semibold text-primary underline"
            >
              {SUPPORT_EMAIL}
            </a>
            . Indiquez votre identifiant ou email de compte, et une description
            claire du problème.
          </p>
          <p>
            Vous pouvez aussi ouvrir <strong>Profil → Aide &amp; support</strong>{" "}
            directement dans l&apos;application.
          </p>
        </Section>

        <Section title="Questions fréquentes">
          <Faq
            q="Comment devenir vendeur ?"
            a="Ouvrez votre profil, puis « Devenir vendeur ». Vous pourrez créer votre boutique et lancer des lives."
          />
          <Faq
            q="Comment recharger mon portefeuille ?"
            a="Depuis Profil → Portefeuille, choisissez un montant. Les paiements sont sécurisés par Stripe."
          />
          <Faq
            q="Quand suis-je payé pour mes ventes ?"
            a="Les fonds sont libérés après confirmation de réception par l'acheteur (ou automatiquement après le délai prévu). Retirez-les depuis Gains."
          />
          <Faq
            q="Un problème avec une commande ?"
            a="Ouvrez la commande dans Activité, puis « Signaler un problème ». Notre équipe intervient sous 48 h."
          />
          <Faq
            q="Comment supprimer mon compte ?"
            a="Dans l'app : Profil → Compte → Supprimer mon compte. Ou consultez la page Suppression de compte ci-dessous."
          />
        </Section>

        <Section title="Ressources utiles">
          <ul className="ml-5 list-disc space-y-2">
            <li>
              <Link to="/safety" className="text-primary underline">
                Sécurité et pertinence de l&apos;âge
              </Link>
            </li>
            <li>
              <Link to="/community" className="text-primary underline">
                Directives de la communauté
              </Link>
            </li>
            <li>
              <Link to="/privacy" className="text-primary underline">
                Politique de confidentialité
              </Link>
            </li>
            <li>
              <Link to="/terms" className="text-primary underline">
                Conditions d&apos;utilisation
              </Link>
            </li>
            <li>
              <Link to="/account-deletion" className="text-primary underline">
                Suppression de compte
              </Link>
            </li>
          </ul>
        </Section>

        <p className="mt-10 text-sm text-muted-foreground">
          <Link to="/" className="underline">
            Retour à KiDi+
          </Link>
        </p>
      </article>
    </main>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8 space-y-3">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-foreground/90">
        {children}
      </div>
    </section>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card px-4 py-3">
      <p className="font-medium">{q}</p>
      <p className="mt-1 text-muted-foreground">{a}</p>
    </div>
  );
}
