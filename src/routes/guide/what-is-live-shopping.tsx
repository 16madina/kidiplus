import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/guide/what-is-live-shopping")({
  component: LiveShoppingGuide,
  head: () => ({
    meta: [
      { title: "Qu'est-ce que le live shopping ? — Guide KiDi+" },
      {
        name: "description",
        content:
          "Le live shopping expliqué simplement : achats en direct, enchères en temps réel, chat avec le vendeur. Découvre comment participer sur KiDi+.",
      },
      { property: "og:title", content: "Qu'est-ce que le live shopping ? — Guide KiDi+" },
      {
        property: "og:description",
        content:
          "Comprends le live shopping et découvre comment acheter ou vendre en direct sur KiDi+.",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://kidiplus.com/guide/what-is-live-shopping" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://kidiplus.com/guide/what-is-live-shopping" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Qu'est-ce que le live shopping ?",
          description:
            "Guide complet sur le live shopping : concept, avantages et tutoriel pour acheter et vendre en direct sur KiDi+.",
          inLanguage: "fr",
          mainEntityOfPage: "https://kidiplus.com/guide/what-is-live-shopping",
          publisher: { "@type": "Organization", name: "KiDi+" },
        }),
      },
    ],
  }),
});

function LiveShoppingGuide() {
  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <article className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <header className="mb-8">
          <p className="text-sm font-medium text-muted-foreground">Guide KiDi+</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
            Qu'est-ce que le live shopping ?
          </h1>
          <p className="mt-3 text-muted-foreground">
            Le live shopping est un format de vente en direct où un vendeur
            présente ses produits face caméra pendant que les acheteurs
            interagissent, posent des questions et enchérissent en temps réel.
            C'est le mélange entre une émission télé, une place de marché et
            un chat communautaire.
          </p>
        </header>

        <Section title="Comment ça marche">
          <p>
            Un hôte lance une diffusion depuis son téléphone, présente un
            article, et fixe soit un prix direct, soit un prix de départ pour
            une enchère minutée. Les personnes qui regardent voient les autres
            offres arriver en direct et peuvent surenchérir en un tap. Le
            gagnant paie dans l'app à la fin du minuteur.
          </p>
        </Section>

        <Section title="Pourquoi le live shopping cartonne">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Émotion et rareté&nbsp;:</strong> pièces uniques,
              enchères courtes, décisions rapides.
            </li>
            <li>
              <strong>Confiance&nbsp;:</strong> tu vois le produit sous tous
              les angles avant d'acheter et tu parles au vendeur.
            </li>
            <li>
              <strong>Communauté&nbsp;:</strong> les fidèles reviennent aux
              lives de leurs vendeurs préférés.
            </li>
          </ul>
        </Section>

        <Section title="Comment acheter sur KiDi+">
          <ol className="list-decimal space-y-2 pl-5">
            <li>Ouvre l'app et rejoins un live qui t'intéresse.</li>
            <li>
              Regarde la présentation du produit et vérifie le prix ou le
              minuteur d'enchère.
            </li>
            <li>Tape <em>Enchérir</em> ou <em>Acheter</em> pour te positionner.</li>
            <li>Paie en toute sécurité et suis la livraison depuis ton compte.</li>
          </ol>
        </Section>

        <Section title="Comment vendre sur KiDi+">
          <ol className="list-decimal space-y-2 pl-5">
            <li>Crée ta boutique et ajoute ta photo de profil.</li>
            <li>Prépare tes produits (photos, description, prix de départ).</li>
            <li>
              Lance un live depuis l'onglet <em>Go live</em>, présente chaque
              article et gère le chat.
            </li>
            <li>Reçois les paiements et gère les expéditions depuis l'app.</li>
          </ol>
        </Section>

        <Section title="Prêt·e à essayer ?">
          <p>
            Découvre les lives en cours sur la{" "}
            <Link to="/" className="text-primary underline">
              page d'accueil KiDi+
            </Link>
            . Pour toute question de sécurité, consulte notre{" "}
            <Link to="/safety" className="text-primary underline">
              page Sécurité
            </Link>
            .
          </p>
        </Section>
      </article>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
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
