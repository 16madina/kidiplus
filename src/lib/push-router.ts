// Deep-link router for push / in-app notifications.
// Dispatched as a browser CustomEvent so any React tree with access to
// LiveViewer / SellerProfile / tab-nav contexts can consume it.

export type PushOpenPayload = {
  kind?: string;
  order_id?: string;
  live_id?: string;
  seller_handle?: string;
  seller_id?: string;
  thread_id?: string;
  // Free-form extras
  [key: string]: unknown;
};

export const PUSH_OPEN_EVENT = "kidi:push-open";
export const NAV_TAB_EVENT = "kidi:navigate-tab";

/** Normalize a raw FCM `data` block (all values are strings on the wire). */
export function normalizePushData(raw: unknown): PushOpenPayload | null {
  if (!raw || typeof raw !== "object") return null;
  const out: PushOpenPayload = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v == null) continue;
    out[k] = typeof v === "string" ? v : String(v);
  }
  if (!out.kind && typeof out["notification.kind"] === "string") {
    out.kind = out["notification.kind"] as string;
  }
  return out;
}

/** Fire the deep-link event. Safe on SSR (no-op). */
export function openFromPush(payload: PushOpenPayload | null | undefined) {
  if (!payload || typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent<PushOpenPayload>(PUSH_OPEN_EVENT, { detail: payload }),
    );
  } catch {
    /* ignore */
  }
}

/** Convenience: navigate the bottom tab bar. */
export function navigateTab(tab: "home" | "search" | "live" | "activity" | "profile") {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(NAV_TAB_EVENT, { detail: tab }));
  } catch {
    /* ignore */
  }
}

/**
 * Map a DB notification row (via `notifications.kind` + `data`) to a deep-link
 * payload the client router understands.
 */
export function payloadFromNotificationRow(row: {
  kind: string;
  order_id: string | null;
  data: Record<string, unknown> | null;
}): PushOpenPayload {
  const data = (row.data ?? {}) as Record<string, unknown>;
  const rawKind = String(data.kind ?? "").trim();
  let kind = rawKind;
  if (!kind) {
    if (/^order_|^dispute_/.test(row.kind)) kind = "order";
    else if (row.kind === "live_started") kind = "live";
    else if (row.kind === "new_follower") kind = "seller";
    else if (/^chat_/.test(row.kind)) kind = "chat";
    else kind = "notif";
  }
  return {
    kind,
    order_id: row.order_id ?? (data.order_id as string | undefined),
    live_id: data.live_id as string | undefined,
    seller_handle: data.seller_handle as string | undefined,
    seller_id: data.seller_id as string | undefined,
    thread_id: data.thread_id as string | undefined,
  };
}
