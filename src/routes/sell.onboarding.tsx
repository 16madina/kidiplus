import { createFileRoute, redirect } from "@tanstack/react-router";
import { stashSoftSection } from "@/lib/soft-profile-routes";

export const Route = createFileRoute("/sell/onboarding")({
  beforeLoad: () => {
    if (typeof window !== "undefined") stashSoftSection("sell");
    throw redirect({ to: "/" });
  },
});
