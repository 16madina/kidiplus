import { createFileRoute } from "@tanstack/react-router";
import { SellerDeliverySettingsScreen } from "@/components/seller/delivery-settings-screen";

export const Route = createFileRoute("/test-delivery")({
  component: () => <SellerDeliverySettingsScreen open={true} onClose={() => {}} />,
});
