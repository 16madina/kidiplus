// Official "KiDi+" admin messages inbox — realtime rows shown atop the notifications tab.

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { ShieldCheck, ChevronRight } from "lucide-react";
import { PushScreen } from "@/components/push-screen";
import { Press } from "@/components/press";
import { useAuth } from "@/lib/auth-context";
import {
  fetchMyAdminMessages,
  markAdminMessageRead,
  subscribeMyAdminMessages,
  type AdminMessageRow,
} from "@/lib/moderation-admin";

export function AdminMessagesInbox() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [rows, setRows] = useState<AdminMessageRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState<AdminMessageRow | null>(null);

  useEffect(() => {
    if (!user) { setRows([]); setUnread(0); return; }
    let alive = true;
    const load = async () => {
      const r = await fetchMyAdminMessages();
      if (alive) { setRows(r.rows); setUnread(r.unread); }
    };
    void load();
    const un = subscribeMyAdminMessages(user.id, () => { void load(); });
    return () => { alive = false; un(); };
  }, [user]);

  if (!user || rows.length === 0) return null;

  return (
    <>
      <div className="px-4 pb-1 pt-3">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("adminMsg.section")}
          </p>
          {unread > 0 && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
              style={{ backgroundColor: "oklch(0.55 0.2 27)" }}>
              {unread}
            </span>
          )}
        </div>
      </div>
      <ul className="space-y-2 px-4 pb-2">
        <AnimatePresence initial={false}>
          {rows.slice(0, 10).map((m) => (
            <motion.li key={m.id}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <Press
                onClick={async () => {
                  setOpen(m);
                  if (!m.read_at) {
                    await markAdminMessageRead(m.id);
                    setRows((prev) => prev.map((x) => x.id === m.id ? { ...x, read_at: new Date().toISOString() } : x));
                    setUnread((n) => Math.max(0, n - 1));
                  }
                }}
                className="flex w-full items-center gap-3 rounded-2xl border p-3 text-left"
                style={{
                  borderColor: !m.read_at ? "oklch(0.75 0.15 85 / 0.6)" : "var(--border)",
                  backgroundColor: !m.read_at ? "oklch(0.75 0.15 85 / 0.08)" : undefined,
                }}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: "oklch(0.28 0.06 260)", color: "oklch(0.85 0.14 85)" }}>
                  <ShieldCheck size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "oklch(0.75 0.15 85)" }}>KiDi+</span>
                    {!m.read_at && <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "oklch(0.55 0.2 27)" }} />}
                  </div>
                  <p className="truncate text-[14px] font-semibold">{m.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {new Date(m.created_at).toLocaleString(i18n.language)}
                  </p>
                </div>
                <ChevronRight size={14} className="shrink-0 text-muted-foreground" />
              </Press>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <PushScreen open={!!open} onClose={() => setOpen(null)} title={t("adminMsg.detailTitle")} zIndex={80}>
        {open && (
          <div className="space-y-3 px-4 py-4">
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-full"
                style={{ backgroundColor: "oklch(0.28 0.06 260)", color: "oklch(0.85 0.14 85)" }}>
                <ShieldCheck size={18} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "oklch(0.75 0.15 85)" }}>KiDi+</p>
                <p className="text-[11px] text-muted-foreground">{new Date(open.created_at).toLocaleString(i18n.language)}</p>
              </div>
            </div>
            <h2 className="text-[18px] font-bold">{open.title}</h2>
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed">{open.body}</p>
            <p className="pt-4 text-[11px] text-muted-foreground">
              {t("adminMsg.communityRef")}
            </p>
          </div>
        )}
      </PushScreen>
    </>
  );
}
