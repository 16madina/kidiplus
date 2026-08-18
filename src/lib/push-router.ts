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
  post_id?: string;
  comment_id?: string;
  parent_comment_id?: string;

  /** "1" / "true" → open the post comments sheet after jumping to the post. */
  open_comments?: string;
  // Free-form extras
  [key: string]: unknown;
};

export const PUSH_OPEN_EVENT = "kidi:push-open";
export const NAV_TAB_EVENT = "kidi:navigate-tab";
/** Open Activity as a PushScreen overlay (not a bottom tab). */
export const OPEN_ACTIVITY_EVENT = "kidi:open-activity";
/** Fired when notif/DM unread counts may have changed (mark read, new message…). */
export const ACTIVITY_UNREAD_EVENT = "kidi:activity-unread";

export type OpenActivityPayload = {
  tab?: "notifs" | "messages";
  thread_id?: string;
  order_id?: string;
};

/** Ask Profile / Home badges to refetch unread counts. Safe on SSR. */
export function notifyActivityUnreadChanged() {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent(ACTIVITY_UNREAD_EVENT));
  } catch {
    /* ignore */
  }
}

/** Open notifications / DMs overlay. Safe on SSR (no-op). */
export function openActivity(payload: OpenActivityPayload = {}) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent<OpenActivityPayload>(OPEN_ACTIVITY_EVENT, { detail: payload }),
    );
  } catch {
    /* ignore */
  }
}

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
export function navigateTab(tab: "home" | "search" | "live" | "vitrine" | "profile") {
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
    else if (row.kind === "moderator_promoted") kind = "live";
    else if (row.kind === "live_host_absent") kind = "resume_host_live";
    else if (row.kind === "new_follower") kind = "seller";
    else if (row.kind === "vitrine_like" || row.kind === "vitrine_comment" || row.kind === "vitrine_comment_reply" || row.kind === "vitrine_comment_like") kind = "vitrine";
    else if (/^chat_/.test(row.kind)) kind = "chat";
    else kind = "notif";
  }
  const battleLiveId =
    (typeof data.live_id === "string" && data.live_id.trim()) ||
    (typeof data.from_live_id === "string" && data.from_live_id.trim()) ||
    "";
  if (row.kind === "battle" || kind === "battle" || kind.startsWith("battle_")) {
    kind = battleLiveId ? "live" : "notif";
  }
  const commentId =
    typeof data.comment_id === "string" && data.comment_id.trim()
      ? data.comment_id.trim()
      : undefined;
  const openComments =
    row.kind === "vitrine_comment" || row.kind === "vitrine_comment_reply" || row.kind === "vitrine_comment_like" || !!commentId ? "1" : undefined;
  return {
    kind,
    order_id: row.order_id ?? (data.order_id as string | undefined),
    live_id: (typeof data.live_id === "string" && data.live_id) || battleLiveId || undefined,
    seller_handle: data.seller_handle as string | undefined,
    seller_id: data.seller_id as string | undefined,
    thread_id: data.thread_id as string | undefined,
    post_id: data.post_id as string | undefined,
    comment_id: commentId,
    parent_comment_id:
      typeof data.parent_comment_id === "string" && data.parent_comment_id.trim()
        ? data.parent_comment_id.trim()
        : undefined,

    open_comments: openComments,
  };
}
