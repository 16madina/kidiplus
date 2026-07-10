import { createFileRoute } from "@tanstack/react-router";
import { CountryFlag } from "@/components/country-flag";

export const Route = createFileRoute("/test-flags")({
  component: () => (
    <div className="p-8 space-y-4">
      <h1 className="text-xl font-bold">Flag test</h1>
      <div className="flex flex-wrap gap-2">
        <CountryFlag code="FR" className="h-6 w-9 rounded-sm" />
        <CountryFlag code="CI" className="h-6 w-9 rounded-sm" />
        <CountryFlag code="US" className="h-6 w-9 rounded-sm" />
        <CountryFlag code="DZ" className="h-6 w-9 rounded-sm" />
        <CountryFlag code="JP" className="h-6 w-9 rounded-sm" />
        <CountryFlag code="UNKNOWN" className="h-6 w-9 rounded-sm" />
      </div>
    </div>
  ),
});
