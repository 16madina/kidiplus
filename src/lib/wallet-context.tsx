// WalletProvider — subscribes to the current user's wallet row + tx feed
// and exposes { balance, currency, transactions, refresh } across the app.
//
// Realtime: on any change to `wallets` or a new `wallet_transactions` row,
// we refetch. The wallet is a single row per user; the tx feed is capped
// at 50 most-recent items in memory.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchMyWallet,
  fetchMyWalletTransactions,
  subscribeMyWallet,
  type WalletRow,
  type WalletTxRow,
} from "@/lib/wallet-db";

type WalletCtx = {
  wallet: WalletRow | null;
  balance: number;
  currency: string;
  transactions: WalletTxRow[];
  loading: boolean;
  refresh: () => Promise<void>;
};

const Ctx = createContext<WalletCtx | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [transactions, setTransactions] = useState<WalletTxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const userId = user?.id ?? null;
  const refreshing = useRef(false);

  const refresh = useCallback(async () => {
    if (!userId || refreshing.current) return;
    refreshing.current = true;
    try {
      const [w, tx] = await Promise.all([
        fetchMyWallet(userId),
        fetchMyWalletTransactions(userId, 50),
      ]);
      setWallet(w);
      setTransactions(tx);
    } finally {
      refreshing.current = false;
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setWallet(null);
      setTransactions([]);
      return;
    }
    setLoading(true);
    void refresh().finally(() => setLoading(false));
    const unsub = subscribeMyWallet(userId, () => {
      void refresh();
    });
    return () => unsub();
  }, [userId, refresh]);

  // Safety sync: whenever the profile currency changes AND the wallet
  // balance is 0 but the wallet currency lags behind, force a server-side
  // sync via the sync_my_wallet_currency RPC then refresh. Idempotent.
  useEffect(() => {
    if (!userId || !profile) return;
    const target = profile.currency;
    if (!target) return;
    if (wallet && Number(wallet.balance) === 0 && (wallet.currency ?? "").toUpperCase() !== target.toUpperCase()) {
      void (async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).rpc("sync_my_wallet_currency", {});
        await refresh();
      })();
    }
  }, [userId, profile, wallet, refresh]);

  const value = useMemo<WalletCtx>(
    () => ({
      wallet,
      balance: wallet ? Number(wallet.balance) : 0,
      currency: wallet?.currency ?? "eur",
      transactions,
      loading,
      refresh,
    }),
    [wallet, transactions, loading, refresh],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWallet(): WalletCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

// Consumer-safe fallback: components that may render outside the provider
// (e.g. during SSR fragments) can use this. Falls back to zero balance.
export function useWalletSafe(): WalletCtx {
  const ctx = useContext(Ctx);
  return (
    ctx ?? {
      wallet: null,
      balance: 0,
      currency: "eur",
      transactions: [],
      loading: false,
      refresh: async () => {},
    }
  );
}
