import { createFileRoute, redirect } from "@tanstack/react-router";
import { stashSoftSection } from "@/lib/soft-profile-routes";

export const Route = createFileRoute("/earnings")({
  beforeLoad: () => {
    if (typeof window !== "undefined") stashSoftSection("earnings");
    throw redirect({ to: "/" });
  },
});
