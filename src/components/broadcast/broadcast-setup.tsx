import { useState } from "react";
import { motion } from "framer-motion";
import { X, RefreshCw, Plus, Trash2, Image as ImageIcon } from "lucide-react";
import { Press } from "@/components/press";
import { BroadcastVideo } from "./broadcast-video";
import { AddProductSheet } from "./add-product-sheet";
import { useBroadcast } from "@/lib/broadcast-context";
import { COVER_POOL } from "@/lib/broadcast-mock";
import { CATEGORIES } from "@/lib/live-mock";
import { EASE_IOS, listContainer, listItem } from "@/lib/motion";
import { haptic } from "@/lib/haptics";

export function BroadcastSetup({ onExit }: { onExit: () => void }) {
  const b = useBroadcast();
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const [showAdd, setShowAdd] = useState(false);
  const [showCovers, setShowCovers] = useState(false);

  const canLaunch = b.title.trim().length > 0 && b.products.length > 0;

  const launch = () => {
    if (!canLaunch) return;
    haptic.medium();
    b.goLive();
  };

  return (
    <motion.div
      key="setup"
      initial={{ opacity: 0, scale: 1.02 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.3, ease: EASE_IOS }}
      className="relative h-full w-full overflow-hidden bg-black"
    >
      <BroadcastVideo facing={facing} enabled={true} fallbackImage={b.cover} />

      {/* Top bar */}
      <div
        className="absolute inset-x-0 top-0 z-30 flex items-center justify-between px-3 pt-safe"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 8px)" }}
      >
        <Press
          onClick={onExit}
          aria-label="Fermer"
          className="!min-h-11 !min-w-11 rounded-full text-white"
          style={{
            backgroundColor: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          <X size={22} />
        </Press>
        <Press
          onClick={() => {
            haptic.selection();
            setFacing((f) => (f === "user" ? "environment" : "user"));
          }}
          aria-label="Changer de caméra"
          className="!min-h-11 !min-w-11 rounded-full text-white"
          style={{
            backgroundColor: "rgba(0,0,0,0.4)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          <RefreshCw size={20} />
        </Press>
      </div>

      {/* Form overlay */}
      <div
        className="absolute inset-x-0 bottom-0 z-20 flex flex-col gap-3 px-4 pt-8 pb-safe"
        style={{
          paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)",
          background:
            "linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.55) 30%, rgba(0,0,0,0.85) 100%)",
        }}
      >
        {/* Cover + title row */}
        <div className="flex items-start gap-3">
          <Press
            onClick={() => setShowCovers((v) => !v)}
            className="!min-h-16 h-16 w-16 shrink-0 overflow-hidden rounded-xl p-0"
            style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
            aria-label="Choisir une couverture"
          >
            {b.cover ? (
              <img src={b.cover} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center text-white/80">
                <ImageIcon size={22} />
              </div>
            )}
          </Press>
          <input
            value={b.title}
            onChange={(e) => b.setTitle(e.target.value)}
            placeholder="Titre du live..."
            maxLength={80}
            className="h-16 flex-1 rounded-xl px-3 text-[15px] font-medium text-white placeholder:text-white/60 outline-none"
            style={{
              backgroundColor: "rgba(255,255,255,0.14)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
            }}
          />
        </div>

        {showCovers && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: EASE_IOS }}
            className="flex gap-2 overflow-x-auto"
          >
            {COVER_POOL.map((c) => {
              const active = c === b.cover;
              return (
                <Press
                  key={c}
                  onClick={() => {
                    b.setCover(c);
                    setShowCovers(false);
                  }}
                  className="!min-h-14 h-14 w-14 shrink-0 overflow-hidden rounded-lg p-0"
                  style={{
                    outline: active ? "2px solid white" : "none",
                    outlineOffset: 2,
                  }}
                >
                  <img src={c} alt="" className="h-full w-full object-cover" />
                </Press>
              );
            })}
          </motion.div>
        )}

        {/* Category pills */}
        <div
          className="flex gap-2 overflow-x-auto pb-1"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {CATEGORIES.filter((c) => c !== "For You").map((c) => {
            const active = c === b.category;
            return (
              <Press
                key={c}
                onClick={() => {
                  haptic.selection();
                  b.setCategory(c);
                }}
                className="!min-h-9 shrink-0 rounded-full px-3.5 text-[12px] font-semibold"
                style={{
                  color: active ? "black" : "white",
                  backgroundColor: active ? "white" : "rgba(255,255,255,0.16)",
                }}
              >
                {c}
              </Press>
            );
          })}
        </div>

        {/* Products row */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[12px] font-semibold text-white/80">
              Produits du live ({b.products.length})
            </span>
          </div>
          <motion.div
            variants={listContainer}
            initial="hidden"
            animate="show"
            className="flex gap-2 overflow-x-auto pb-1"
          >
            {b.products.map((p) => (
              <motion.div
                key={p.id}
                variants={listItem}
                className="relative flex w-24 shrink-0 flex-col gap-1"
              >
                <div className="relative h-24 w-24 overflow-hidden rounded-xl">
                  <img src={p.image} alt="" className="h-full w-full object-cover" />
                  <span
                    className="absolute left-1 top-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white"
                    style={{
                      backgroundColor:
                        p.mode === "auction"
                          ? "oklch(0.62 0.24 20)"
                          : "oklch(0.55 0.18 260)",
                    }}
                  >
                    {p.mode === "auction" ? "ENCHÈRE" : "PRIX FIXE"}
                  </span>
                  <Press
                    onClick={() => b.removeProduct(p.id)}
                    aria-label="Retirer"
                    className="!min-h-7 !min-w-7 absolute right-1 top-1 h-7 w-7 rounded-full p-0 text-white"
                    style={{ backgroundColor: "rgba(0,0,0,0.55)" }}
                  >
                    <Trash2 size={12} />
                  </Press>
                </div>
                <span className="truncate text-[11px] font-medium text-white">
                  {p.name}
                </span>
                <span className="text-[10px] text-white/70">
                  {p.mode === "auction" ? `dès ${p.startPrice} €` : `${p.price} € · stock ${p.stock}`}
                </span>
              </motion.div>
            ))}
            <Press
              onClick={() => setShowAdd(true)}
              className="!min-h-24 flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed text-white"
              style={{ borderColor: "rgba(255,255,255,0.5)" }}
            >
              <Plus size={20} />
              <span className="text-[10px] font-semibold">Ajouter</span>
            </Press>
          </motion.div>
        </div>

        {/* Launch */}
        <Press
          onClick={launch}
          disabled={!canLaunch}
          hapticOnTap={false}
          className="!min-h-14 mt-1 h-14 w-full rounded-2xl text-[16px] font-bold text-white disabled:opacity-40"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.7 0.26 15), oklch(0.62 0.24 20))",
            boxShadow: "0 8px 24px rgba(255, 40, 60, 0.35)",
          }}
        >
          Lancer le live
        </Press>
      </div>

      <AddProductSheet
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onAdd={(p) => b.addProduct(p)}
      />
    </motion.div>
  );
}
