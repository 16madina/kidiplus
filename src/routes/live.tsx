import { createFileRoute, Link } from "@tanstack/react-router";
import { LocalStressLiveScreen } from "@/components/live-viewer/local-stress-live-screen";

export const Route = createFileRoute("/live")({
  validateSearch: (search: Record<string, unknown>) => ({
    stress: search.stress === "1" ? "1" : undefined,
  }),
  head: () => ({
    meta: [
      { title: "KiDi+ — Test live local" },
      {
        name: "description",
        content: "Mode local pour tester le chat et les cœurs du live KiDi+ à fort volume.",
      },
      { property: "og:title", content: "KiDi+ — Test live local" },
      {
        property: "og:description",
        content: "Mode local pour tester le chat et les cœurs du live KiDi+ à fort volume.",
      },
    ],
  }),
  component: LiveRoute,
});

function LiveRoute() {
  const search = Route.useSearch();
  if (search.stress === "1") return <LocalStressLiveScreen />;

  return (
    <main className="grid min-h-screen place-items-center bg-background px-4 text-center text-foreground">
      <div className="max-w-sm">
        <h1 className="text-3xl font-black tracking-tight">Live KiDi+</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pour ouvrir le test local, ajoute <span className="font-mono">?stress=1</span> à cette URL.
        </p>
        <Link
          to="/live"
          search={{ stress: "1" }}
          className="mt-5 inline-flex h-11 items-center justify-center rounded-full bg-primary px-5 text-sm font-bold text-primary-foreground"
        >
          Ouvrir le test
        </Link>
      </div>
    </main>
  );
}