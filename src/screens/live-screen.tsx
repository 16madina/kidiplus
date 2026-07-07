import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Store } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { BroadcastProvider, useBroadcast } from "@/lib/broadcast-context";
import { BroadcastSetup } from "@/components/broadcast/broadcast-setup";
import { BroadcastLive } from "@/components/broadcast/broadcast-live";
import { BroadcastSummary } from "@/components/broadcast/broadcast-summary";
import { useAuth, frenchAuthError } from "@/lib/auth-context";
import { EASE_IOS } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { useState } from "react";

export function LiveScreen() {
  const { t } = useTranslation();
  const { profile, loading, becomeSeller } = useAuth();
  const [flipping, setFlipping] = useState(false);

  if (loading || !profile) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="animate-spin text-muted-foreground" size={22} />
      </div>
    );
  }

  if (!profile.is_seller) {
    return (
      <motion.div
        key="become-seller"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: EASE_IOS }}
        className="flex h-full flex-col items-center justify-center px-6 pt-safe text-center"
        style={{
          paddingBottom: "calc(3.5rem + env(safe-area-inset-bottom))",
        }}
      >
        <div
          className="mb-4 grid h-16 w-16 place-items-center rounded-2xl"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))",
          }}
        >
          <Store size={30} color="white" />
        </div>
        <h1 className="text-[24px] font-bold">Deviens vendeur ✨</h1>
        <p className="mt-2 max-w-xs text-[14px] leading-snug text-muted-foreground">
          Active ton mode vendeur pour lancer des lives, faire des enchères et
          vendre à ta communauté en direct.
        </p>
        <Press
          onClick={async () => {
            setFlipping(true);
            try {
              await becomeSeller();
              haptic.success();
              toast.success("Bienvenue parmi les vendeurs 🎉");
            } catch (e) {
              haptic.error();
              toast.error(frenchAuthError(e));
            } finally {
              setFlipping(false);
            }
          }}
          disabled={flipping}
          className="!min-h-12 mt-8 h-12 w-full max-w-xs rounded-2xl text-[15px] font-bold text-white"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))",
            opacity: flipping ? 0.7 : 1,
          }}
        >
          {flipping ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 size={16} className="animate-spin" /> Activation…
            </span>
          ) : (
            "Activer le mode vendeur"
          )}
        </Press>
        <p className="mt-4 max-w-xs text-[11px] text-muted-foreground">
          La vérification vendeur avancée arrive bientôt.
        </p>
      </motion.div>
    );
  }

  return (
    <BroadcastProvider>
      <BroadcastFlow />
    </BroadcastProvider>
  );
}

function BroadcastFlow() {
  const { stage, goSetup, goSummary, reset, setHost } = useBroadcast();
  const { profile, user } = useAuth();

  // Feed the real signed-in host identity/name into broadcast context.
  useEffect(() => {
    if (user && profile) setHost(user.id, profile.display_name || profile.handle);
  }, [user, profile, setHost]);

  return (
    <div className="relative h-full w-full overflow-hidden">
      <AnimatePresence mode="wait">
        {stage === "setup" && (
          <BroadcastSetup key="setup" onExit={() => reset()} />
        )}
        {stage === "live" && (
          <BroadcastLive key="live" onEnd={() => goSummary()} />
        )}
        {stage === "summary" && (
          <BroadcastSummary key="summary" onDone={() => goSetup()} />
        )}
      </AnimatePresence>
    </div>
  );
}
