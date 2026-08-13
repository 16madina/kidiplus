// Admin-only switch: force the wallet top-up flow into Stripe sandbox mode on
// THIS device only (localStorage). Hidden entirely for non-admins.

import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { FlaskConical } from "lucide-react";
import { getAdminStatus } from "@/lib/admin.functions";
import { isForceStripeTest, setForceStripeTest } from "@/lib/force-stripe-test";
import { IOSSwitch } from "@/components/ios-switch";

export function ForceStripeTestToggle() {
  const fetchAdminStatus = useServerFn(getAdminStatus);
  const [isAdmin, setIsAdmin] = useState(false);
  const [on, setOn] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchAdminStatus()
      .then((r) => {
        if (alive) setIsAdmin(!!r.isAdmin);
      })
      .catch(() => {
        if (alive) setIsAdmin(false);
      });
    return () => {
      alive = false;
    };
  }, [fetchAdminStatus]);

  useEffect(() => {
    setOn(isForceStripeTest());
  }, []);

  if (!isAdmin) return null;

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-3 py-2.5">
      <FlaskConical size={16} className="text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold">Recharge en mode test (Stripe)</p>
        <p className="text-[11px] leading-snug text-muted-foreground">
          Admin · cet appareil uniquement. Les recharges par carte utilisent le
          sandbox Stripe (aucun paiement réel).
        </p>
      </div>
      <IOSSwitch
        checked={on}
        onChange={(v) => {
          setOn(v);
          setForceStripeTest(v);
        }}
      />
    </div>
  );
}
