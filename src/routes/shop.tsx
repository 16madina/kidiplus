import { createFileRoute, redirect } from "@tanstack/react-router";
import { stashSoftSection } from "@/lib/soft-profile-routes";

export const Route = createFileRoute("/shop")({
  beforeLoad: () => {
    if (typeof window !== "undefined") stashSoftSection("shop");
    throw redirect({ to: "/" });
  },
});
