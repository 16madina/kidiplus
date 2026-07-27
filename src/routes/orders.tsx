import { createFileRoute, redirect } from "@tanstack/react-router";
import { stashSoftSection } from "@/lib/soft-profile-routes";

export const Route = createFileRoute("/orders")({
  beforeLoad: () => {
    if (typeof window !== "undefined") stashSoftSection("orders");
    throw redirect({ to: "/" });
  },
});
