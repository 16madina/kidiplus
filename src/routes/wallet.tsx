import { createFileRoute, redirect } from "@tanstack/react-router";
import { stashSoftSection } from "@/lib/soft-profile-routes";

export const Route = createFileRoute("/wallet")({
  beforeLoad: () => {
    if (typeof window !== "undefined") stashSoftSection("wallet");
    throw redirect({ to: "/" });
  },
});
