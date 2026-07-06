import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Check } from "lucide-react";
import { toast } from "sonner";
import { BottomSheet } from "./bottom-sheet";
import { Press } from "@/components/press";
import { formatEuro, type Product } from "@/lib/live-viewer-mock";

export function BuySheet({
  product,
  onClose,
}: {
  product: Product | null;
  onClose: () => void;
}) {
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!product) setDone(false);
  }, [product]);

  const shipping = 4.9;
  const total = product ? product.price + shipping : 0;

  const confirm = () => {
    setDone(true);
    if (product) toast.success(`Commande confirmée : ${product.name}`);
    setTimeout(onClose, 1200);
  };

  return (
    <BottomSheet open={!!product} onClose={onClose} heightPercent={62}>
      {product && (
        <div className="flex h-full flex-col px-5 pb-5 pt-2">
          <AnimatePresence mode="wait">
            {!done ? (
              <motion.div
                key="confirm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="flex flex-1 flex-col"
              >
                <h2 className="text-lg font-bold">Confirmer l'achat</h2>
                <div className="mt-4 flex items-center gap-3 rounded-2xl border p-3">
                  <img
                    src={product.image}
                    alt=""
                    className="h-16 w-16 rounded-xl object-cover"
                    onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {product.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Vendu et expédié par le créateur
                    </p>
                  </div>
                </div>

                <dl className="mt-4 space-y-2 text-sm">
                  <Row label="Article" value={formatEuro(product.price)} />
                  <Row label="Livraison" value={formatEuro(shipping)} />
                  <div className="my-2 h-px bg-border" />
                  <Row label="Total" value={formatEuro(total)} bold />
                </dl>

                <div className="mt-auto pt-6">
                  <Press
                    onClick={confirm}
                    className="w-full rounded-2xl bg-primary py-3.5 text-[15px] font-bold text-primary-foreground"
                  >
                    Confirmer et payer {formatEuro(total)}
                  </Press>
                  <Press
                    onClick={onClose}
                    className="mt-2 w-full rounded-2xl py-3 text-[14px] font-semibold text-muted-foreground"
                  >
                    Annuler
                  </Press>
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="done"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex flex-1 flex-col items-center justify-center gap-3"
              >
                <motion.div
                  initial={{ scale: 0.4, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 320,
                    damping: 18,
                  }}
                  className="grid h-20 w-20 place-items-center rounded-full"
                  style={{ backgroundColor: "oklch(0.72 0.2 155)" }}
                >
                  <Check size={44} color="white" strokeWidth={3} />
                </motion.div>
                <p className="text-lg font-bold">Commande confirmée !</p>
                <p className="text-sm text-muted-foreground">
                  Tu recevras un email de suivi.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </BottomSheet>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className={bold ? "font-bold" : "text-muted-foreground"}>{label}</dt>
      <dd className={bold ? "text-lg font-bold" : ""}>{value}</dd>
    </div>
  );
}
