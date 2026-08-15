import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Press } from "@/components/press";
import { useAuth } from "@/lib/auth-context";
import { formatMoney, normalizeCurrency } from "@/lib/money";
import { EASE_IOS } from "@/lib/motion";
import { haptic } from "@/lib/haptics";
import { supabase } from "@/integrations/supabase/client";

type FirstSaleReward = {
  id: string;
  amount: number;
  currency: string;
  created_at: string;
};

const PLAYBACK_MS = 6_000;

/**
 * Global, durable first-sale celebration.
 *
 * The database is authoritative: it creates one reward row per seller inside
 * the same transaction that credits the sale. Realtime shows it immediately;
 * the initial query catches rewards created while the seller was offline.
 */
export function FirstSaleRewardOverlay() {
  const { user } = useAuth();
  const { t, i18n } = useTranslation();
  const [reward, setReward] = useState<FirstSaleReward | null>(null);
  const [videoFailed, setVideoFailed] = useState(false);
  const closingRef = useRef(false);

  useEffect(() => {
    if (!user?.id) {
      setReward(null);
      return;
    }

    let cancelled = false;
    void supabase
      .from("seller_milestone_rewards")
      .select("id, amount, currency, created_at")
      .eq("seller_id", user.id)
      .eq("reward_key", "first_sale_fee_waiver")
      .is("seen_at", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle()
      .then(({ data }: { data: FirstSaleReward | null }) => {
        if (!cancelled && data) setReward(data);
      });

    const channel = supabase
      .channel(`first-sale-reward:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "seller_milestone_rewards",
          filter: `seller_id=eq.${user.id}`,
        },
        (payload: { new: FirstSaleReward & { reward_key?: string; seen_at?: string | null } }) => {
          const next = payload.new;
          if (next.reward_key === "first_sale_fee_waiver" && !next.seen_at) {
            setReward(next);
            setVideoFailed(false);
            haptic.success();
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const close = useCallback(async () => {
    if (!reward || closingRef.current) return;
    closingRef.current = true;
    const current = reward;
    setReward(null);
    try {
      await supabase
        .from("seller_milestone_rewards")
        .update({ seen_at: new Date().toISOString() })
        .eq("id", current.id);
    } finally {
      closingRef.current = false;
    }
  }, [reward]);

  useEffect(() => {
    if (!reward) return;
    const timer = window.setTimeout(() => void close(), PLAYBACK_MS);
    return () => window.clearTimeout(timer);
  }, [reward, close]);

  const amount = reward
    ? formatMoney(Number(reward.amount), normalizeCurrency(reward.currency), i18n.language)
    : "";

  return (
    <AnimatePresence>
      {reward && (
        <motion.div
          key={reward.id}
          role="dialog"
          aria-modal="true"
          aria-label={t("gifts.firstSale.title")}
          className="fixed inset-0 z-[400] overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 50% 48%, rgba(24,92,224,.42), rgba(8,18,50,.8) 55%, rgba(4,8,24,.94))",
              backdropFilter: "blur(4px)",
            }}
          />

          <Press
            onClick={() => void close()}
            aria-label={t("common.close", "Fermer")}
            className="absolute right-4 top-[calc(env(safe-area-inset-top)+12px)] z-20 h-10 w-10 rounded-full bg-black/35 text-white"
          >
            <X size={18} />
          </Press>

          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            {videoFailed ? (
              <motion.img
                src="/kidi-plus-logo.png"
                alt=""
                className="w-[72%] max-w-[390px] object-contain drop-shadow-2xl"
                initial={{ y: 140, scale: 0.35, opacity: 0 }}
                animate={{ y: [140, 0, -10, 0], scale: [0.35, 1.08, 1, 1], opacity: 1 }}
                transition={{ duration: 1.5, ease: EASE_IOS }}
              />
            ) : (
              <video
                key={reward.id}
                src="/gifts/kidiplus-first-sale.webm"
                autoPlay
                muted
                playsInline
                preload="auto"
                onError={() => setVideoFailed(true)}
                className="h-full w-full object-contain"
                style={{ mixBlendMode: "screen" }}
              />
            )}
          </div>

          <motion.div
            className="pointer-events-none absolute inset-x-5 bottom-[calc(env(safe-area-inset-bottom)+8%)] mx-auto max-w-md rounded-3xl border border-amber-300/35 px-5 py-4 text-center text-white shadow-2xl"
            initial={{ y: 50, opacity: 0, scale: 0.92 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ delay: 2.7, duration: 0.55, ease: EASE_IOS }}
            style={{
              background: "linear-gradient(135deg, rgba(8,35,104,.94), rgba(160,105,12,.94))",
              boxShadow: "0 0 50px rgba(244,181,45,.3)",
            }}
          >
            <p className="text-[20px] font-black">{t("gifts.firstSale.title")}</p>
            <p className="mt-1 text-[13px] font-semibold text-white/85">
              {t("gifts.firstSale.subtitle")}
            </p>
            <p className="mt-2 text-[15px] font-black text-amber-300">
              {t("gifts.firstSale.amount", { amount })}
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
