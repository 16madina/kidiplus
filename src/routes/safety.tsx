import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/safety")({
  component: SafetyPage,
  head: () => ({
    meta: [
      { title: "Sécurité et pertinence de l'âge — KiDi+" },
      {
        name: "description",
        content:
          "Âge minimum requis, modération des lives et du chat, signalement, blocage et politique zéro tolérance sur KiDi+.",
      },
      { property: "og:title", content: "Sécurité et pertinence de l'âge — KiDi+" },
      {
        property: "og:description",
        content:
          "Comment KiDi+ protège sa communauté : âge minimum, modération, signalement, blocage.",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://kidiplus.com/safety" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://kidiplus.com/safety" }],
  }),
});

function SafetyPage() {
  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <article className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <header className="mb-8">
          <p className="text-sm font-medium text-muted-foreground">KiDi+</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
            Sécurité et pertinence de l'âge
          </h1>
          <p className="mt-3 text-muted-foreground">
            Cette page décrit les règles d'âge et les outils de sécurité mis en
            place par KiDi+ pour protéger sa communauté d'acheteurs et de
            vendeurs de produits pour enfants.
          </p>
        </header>

        <Section title="Âge minimum requis">
          <p>
            KiDi+ est classée <strong>16 ans et plus</strong>. Cet âge est
            adapté à une marketplace vidéo en direct qui inclut du chat entre
            utilisateurs et des transactions financières (achats, enchères,
            paiements par carte).
          </p>
          <p>
            Les mineurs de moins de 18 ans doivent utiliser l'application sous
            la supervision d'un parent ou tuteur légal, en particulier pour
            toute transaction financière. La création d'un compte vendeur et
            l'accès aux fonctions de paiement Stripe nécessitent d'avoir l'âge
            légal de contracter dans le pays de résidence.
          </p>
        </Section>

        <Section title="Modération des lives et du chat">
          <p>
            Chaque live diffusé sur KiDi+ est encadré par nos{" "}
            <a href="/community" className="text-primary underline">
              Directives de la communauté
            </a>
            . Le chat en direct est modérable en temps réel par l'hôte du live,
            qui peut supprimer un message, réduire au silence ou bannir un
            participant.
          </p>
          <p>
            Les contenus interdits (nudité, violence, discours haineux,
            harcèlement, produits illégaux, contrefaçons, articles dangereux
            pour enfants) entraînent la suspension immédiate du live et du
            compte concerné.
          </p>
        </Section>

        <Section title="Signalement de contenu ou d'utilisateur">
          <p>
            Tout utilisateur peut signaler un live, un message de chat ou un
            profil directement depuis l'application via l'action{" "}
            <em>Signaler</em>. Les signalements sont revus par notre équipe et
            peuvent entraîner un avertissement, la suppression du contenu ou la
            suspension du compte.
          </p>
        </Section>

        <Section title="Blocage d'utilisateurs">
          <p>
            Chaque utilisateur peut bloquer un autre utilisateur depuis son
            profil ou depuis le chat d'un live. Un utilisateur bloqué ne peut
            plus interagir avec toi, ni voir tes lives, ni t'envoyer de
            messages.
          </p>
        </Section>

        <Section title="Politique zéro tolérance">
          <p>
            KiDi+ applique une politique de tolérance zéro envers les contenus
            illégaux, la mise en danger de mineurs, le harcèlement, les
            arnaques et la vente d'articles dangereux pour les enfants. Les
            comptes concernés sont supprimés définitivement et, si nécessaire,
            signalés aux autorités compétentes.
          </p>
        </Section>

        <Section title="Nous contacter">
          <p>
            Pour toute question de sécurité, signalement urgent ou demande
            liée à la protection des mineurs, écris-nous à{" "}
            <a
              href="mailto:safety@kidiplus.com"
              className="text-primary underline"
            >
              safety@kidiplus.com
            </a>
            .
          </p>
        </Section>

        <p className="mt-10 text-sm text-muted-foreground">
          Dernière mise à jour : 7 juillet 2026
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
    <section className="mb-8">
      <h2 className="mb-3 text-xl font-semibold tracking-tight sm:text-2xl">
        {title}
      </h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-foreground/90">
        {children}
      </div>
    </section>
  );
}
