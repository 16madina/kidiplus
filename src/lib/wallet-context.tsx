// WalletProvider — subscribes to the current user's wallet row + tx feed
// and exposes { balance, currency, transactions, refresh } across the app.
//
// Realtime: on any change to `wallets` or a new `wallet_transactions` row,
// we refetch. The wallet is a single row per user; the tx feed is capped
// at 50 most-recent items in memory.
//
// Demo debits: because the "démo" lives on the home feed don't have a
// server-side live row, sending a gift from a demo live can't hit the real
// `send_gift` RPC. So we track a local, per-user "demo debit" overlay in
// localStorage and subtract it from the displayed balance everywhere the
// wallet is read. Real top-ups (server balance goes up) automatically
// clear the overlay so the user always sees a coherent number.

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
  /** Demo-only local debit (used by demo lives on the home feed). */
  demoDebit: (amount: number) => void;
};

const Ctx = createContext<WalletCtx | null>(null);

const demoKey = (userId: string) => `kidi:demo-debit:${userId}`;

function readDemoDebit(userId: string): number {
  try {
    const raw = localStorage.getItem(demoKey(userId));
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeDemoDebit(userId: string, amount: number) {
  try {
    if (amount <= 0) localStorage.removeItem(demoKey(userId));
    else localStorage.setItem(demoKey(userId), String(amount));
  } catch {
    /* ignore */
  }
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const { user, profile } = useAuth();
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [transactions, setTransactions] = useState<WalletTxRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [demoDebitAmt, setDemoDebitAmt] = useState(0);
  const userId = user?.id ?? null;
  const refreshing = useRef(false);
  const lastServerBalance = useRef<number | null>(null);

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
      // Auto-clear demo debit if a real top-up arrived (server balance grew).
      const serverBal = w ? Number(w.balance) : 0;
      if (
        lastServerBalance.current !== null &&
        serverBal > lastServerBalance.current
      ) {
        setDemoDebitAmt(0);
        writeDemoDebit(userId, 0);
      }
      lastServerBalance.current = serverBal;
    } finally {
      refreshing.current = false;
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) {
      setWallet(null);
      setTransactions([]);
      setDemoDebitAmt(0);
      lastServerBalance.current = null;
      return;
    }
    setDemoDebitAmt(readDemoDebit(userId));
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

  const demoDebit = useCallback(
    (amount: number) => {
      if (!userId || amount <= 0) return;
      setDemoDebitAmt((prev) => {
        const next = prev + amount;
        writeDemoDebit(userId, next);
        return next;
      });
    },
    [userId],
  );

  const value = useMemo<WalletCtx>(() => {
    const serverBal = wallet ? Number(wallet.balance) : 0;
    const effective = Math.max(0, serverBal - demoDebitAmt);
    return {
      wallet,
      balance: effective,
      currency: wallet?.currency ?? "eur",
      transactions,
      loading,
      refresh,
      demoDebit,
    };
  }, [wallet, transactions, loading, refresh, demoDebit, demoDebitAmt]);

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
      demoDebit: () => {},
    }
  );
}
