import { BottomSheet } from "./bottom-sheet";
import { Press } from "@/components/press";
import { formatEuro, type Product } from "@/lib/live-viewer-mock";
import { motion } from "framer-motion";

export function ProductsSheet({
  open,
  onClose,
  products,
  onBuyFixed,
}: {
  open: boolean;
  onClose: () => void;
  products: Product[];
  onBuyFixed: (p: Product) => void;
}) {
  return (
    <BottomSheet open={open} onClose={onClose} heightPercent={78}>
      <div className="px-5 pb-6 pt-2">
        <h2 className="text-lg font-bold">Produits du live</h2>
        <p className="text-xs text-muted-foreground">
          {products.length} articles
        </p>
        <ul className="mt-4 flex flex-col gap-2">
          {products.map((p) => (
            <li key={p.id}>
              <ProductRow product={p} onBuyFixed={onBuyFixed} />
            </li>
          ))}
        </ul>
      </div>
    </BottomSheet>
  );
}

function ProductRow({
  product,
  onBuyFixed,
}: {
  product: Product;
  onBuyFixed: (p: Product) => void;
}) {
  const sold = product.status === "sold";
  const current = product.status === "current";

  return (
    <motion.div
      layout
      className="relative flex items-center gap-3 overflow-hidden rounded-2xl border p-2.5"
      style={{
        opacity: sold ? 0.55 : 1,
        borderColor: current
          ? "color-mix(in oklch, var(--accent) 60%, transparent)"
          : "var(--border)",
        boxShadow: current
          ? "0 0 0 3px color-mix(in oklch, var(--accent) 22%, transparent)"
          : undefined,
      }}
    >
      <div className="relative">
        <img
          src={product.image}
          alt=""
          className="h-16 w-16 rounded-xl object-cover"
          style={{ filter: sold ? "grayscale(1)" : undefined }}
          onLoad={(e) => e.currentTarget.setAttribute("data-loaded", "true")}
          draggable={false}
        />
        {sold && (
          <span className="absolute inset-x-1 bottom-1 rounded-md bg-black/80 py-0.5 text-center text-[9px] font-bold text-white">
            VENDU
          </span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{product.name}</p>
        <p className="text-xs text-muted-foreground">
          {product.mode === "auction" ? "Enchère" : "Prix fixe"}
        </p>
        {sold && product.winner && (
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Gagné par @{product.winner}
          </p>
        )}
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="text-sm font-bold">{formatEuro(product.price)}</span>
        {product.mode === "fixed" && !sold && (
          <Press
            onClick={() => onBuyFixed(product)}
            className="!min-h-8 rounded-full bg-primary px-3 text-[12px] font-semibold text-primary-foreground"
          >
            Acheter
          </Press>
        )}
        {current && (
          <span className="text-[10px] font-bold uppercase tracking-wide text-primary">
            En cours
          </span>
        )}
      </div>
    </motion.div>
  );
}
