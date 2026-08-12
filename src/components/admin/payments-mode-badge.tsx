// Discreet admin-only badge showing whether payments run in TEST or PRODUCTION.

import { useEffect, useState } from "react";
import { fetchPaymentsMode, type PaymentsModeReport } from "@/lib/payments-mode-client";

export function PaymentsModeBadge() {
  const [report, setReport] = useState<PaymentsModeReport | null>(null);

  useEffect(() => {
    let alive = true;
    fetchPaymentsMode().then((r) => {
      if (alive) setReport(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!report) return null;
  const isLive = report.effective === "live";

  return (
    <div className="flex items-center justify-center gap-2 px-4 pt-2">
      <span
        title={`Stripe: ${report.stripe.gatewayEnv} · PayPal: ${report.paypal.mode}`}
        className={
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide " +
          (isLive
            ? "bg-destructive/10 text-destructive"
            : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400")
        }
      >
        <span
          className={
            "h-1.5 w-1.5 rounded-full " + (isLive ? "bg-destructive" : "bg-emerald-500")
          }
        />
        {isLive ? "Mode production" : "Mode test"}
      </span>
      <span className="text-[10px] text-muted-foreground">
        Stripe {report.stripe.gatewayEnv} · PayPal {report.paypal.mode}
      </span>
    </div>
  );
}
