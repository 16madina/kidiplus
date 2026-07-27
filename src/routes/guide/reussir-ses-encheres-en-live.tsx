import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/guide/reussir-ses-encheres-en-live")({
  component: SuccessfulLiveAuctionsGuide,
  head: () => ({
    meta: [
      { title: "Réussir ses enchères en live — Guide vendeur KiDi+" },
      {
        name: "description",
        content:
          "Le guide complet pour réussir son live shopping sur KiDi+ : préparation, lumière, interaction avec le chat, gestion du minuteur et closing.",
      },
      { property: "og:title", content: "Réussir ses enchères en live — Guide vendeur KiDi+" },
      {
        property: "og:description",
        content:
          "Préparation, mise en scène, animation et closing : les bonnes pratiques pour vendre en enchères live sur KiDi+.",
      },
      { property: "og:type", content: "article" },
      { property: "og:url", content: "https://kidiplus.com/guide/reussir-ses-encheres-en-live" },
      { name: "twitter:card", content: "summary" },
    ],
    links: [{ rel: "canonical", href: "https://kidiplus.com/guide/reussir-ses-encheres-en-live" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: "Réussir ses enchères en live shopping",
          description:
            "Guide pratique pour organiser un live shopping performant : préparation, lumière, animation, minuteur et conversion.",
          inLanguage: "fr",
          mainEntityOfPage: "https://kidiplus.com/guide/reussir-ses-encheres-en-live",
          image: "https://kidiplus.com/icon-512.png",
          datePublished: "2026-07-20",
          dateModified: "2026-07-20",
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

function SuccessfulLiveAuctionsGuide() {
  return (
    <main className="min-h-[100dvh] bg-background text-foreground">
      <article className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
        <header className="mb-8">
          <p className="text-sm font-medium text-muted-foreground">Guide vendeur KiDi+</p>
          <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">
            Réussir ses enchères en live shopping
          </h1>
          <p className="mt-3 text-muted-foreground">
            Un bon live shopping ne s'improvise pas. Voici les bonnes
            pratiques concrètes des vendeurs qui performent sur KiDi+ :
            préparation, mise en scène, animation du chat et gestion du
            minuteur d'enchère.
          </p>
        </header>

        <Section title="1. Préparer son stock et son scénario">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Sélectionnez 8 à 15 pièces&nbsp;: assez pour tenir 45 minutes,
              pas assez pour perdre l'énergie.
            </li>
            <li>
              Rangez-les dans l'ordre de passage à portée de main, avec une
              étiquette prix de départ visible.
            </li>
            <li>
              Rédigez une fiche flash par produit&nbsp;: taille, matière,
              état, argument clé. Vous la lirez en 15 secondes à la caméra.
            </li>
          </ul>
        </Section>

        <Section title="2. Soigner la lumière et le cadrage">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Une source de lumière face à vous (fenêtre ou ring light),
              jamais dans le dos.
            </li>
            <li>
              Cadrage vertical, produit tenu à hauteur de poitrine, fond
              uni ou peu chargé.
            </li>
            <li>
              Testez le son <strong>avant</strong> de lancer&nbsp;: le chat
              ferme un live inaudible en 20 secondes.
            </li>
          </ul>
        </Section>

        <Section title="3. Animer le chat en continu">
          <p>
            Les enchères montent quand le public se sent vu. Répétez les
            pseudos qui enchérissent, remerciez les nouveaux arrivants,
            annoncez le nombre de watchers toutes les 5 minutes. Un live
            silencieux = un live qui décroche.
          </p>
        </Section>

        <Section title="4. Gérer le minuteur d'enchère">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Départ court&nbsp;: 30 à 60 secondes. Trop long et la tension
              retombe.
            </li>
            <li>
              Annoncez « il reste 10 secondes » à voix haute&nbsp;: ça
              déclenche les dernières enchères.
            </li>
            <li>
              Ne relancez pas plus d'une fois un produit qui ne prend
              pas&nbsp;: enchaînez, gardez le rythme.
            </li>
          </ul>
        </Section>

        <Section title="5. Closing et fidélisation">
          <p>
            Terminez toujours en annonçant le prochain live (date + thème)
            et invitez les acheteurs à suivre votre boutique. Les vendeurs
            top KiDi+ programment leur live suivant <em>pendant</em> le
            live en cours.
          </p>
        </Section>

        <Section title="Aller plus loin">
          <p>
            Nouveau au format ? Commencez par notre{" "}
            <Link
              to="/guide/what-is-live-shopping"
              className="text-primary underline"
            >
              introduction au live shopping
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
      <h2 className="mb-3 text-xl font-semibold tracking-tight sm:text-2xl">{title}</h2>
      <div className="space-y-3 text-[15px] leading-relaxed text-foreground/90">{children}</div>
    </section>
  );
}
