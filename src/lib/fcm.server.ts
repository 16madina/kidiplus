// FCM HTTP v1 sender.
// Uses the service-account JSON stored in FCM_SERVICE_ACCOUNT_JSON to mint an
// OAuth2 access token, then POSTs to fcm.googleapis.com/v1/projects/<id>/messages:send.
//
// Server-only: never import from client code.

type ServiceAccount = {
  client_email: string;
  private_key: string;
  token_uri?: string;
};

type FcmNotification = { title?: string; body?: string; image?: string };
type FcmSendInput = {
  tokens: string[]; // FCM registration tokens
  notification?: FcmNotification;
  data?: Record<string, string>;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function base64UrlEncode(input: string | Uint8Array): string {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function getAccessToken(sa: ServiceAccount): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.value;
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: sa.token_uri ?? "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(claim),
  )}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      key,
      new TextEncoder().encode(unsigned),
    ),
  );
  const jwt = `${unsigned}.${base64UrlEncode(sig)}`;

  const res = await fetch(sa.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  if (!res.ok) {
    throw new Error(`FCM token exchange failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return cachedToken.value;
}

function loadServiceAccount(): { sa: ServiceAccount; projectId: string } {
  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
  const projectId = process.env.FCM_PROJECT_ID;
  if (!raw) throw new Error("FCM_SERVICE_ACCOUNT_JSON is not set");
  if (!projectId) throw new Error("FCM_PROJECT_ID is not set");
  const sa = JSON.parse(raw) as ServiceAccount;
  if (!sa.client_email || !sa.private_key) {
    throw new Error("FCM_SERVICE_ACCOUNT_JSON is missing client_email or private_key");
  }
  return { sa, projectId };
}

export type FcmSendResult = {
  sent: number;
  failed: number;
  invalidTokens: string[]; // tokens to remove from DB
};

/**
 * Sends a push to a list of FCM registration tokens.
 * Returns invalidTokens (UNREGISTERED / INVALID_ARGUMENT) so callers can prune device_tokens.
 */
export async function sendFcmToTokens(input: FcmSendInput): Promise<FcmSendResult> {
  const tokens = Array.from(new Set(input.tokens.filter(Boolean)));
  if (tokens.length === 0) return { sent: 0, failed: 0, invalidTokens: [] };

  const { sa, projectId } = loadServiceAccount();
  const accessToken = await getAccessToken(sa);
  const url = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;

  let sent = 0;
  let failed = 0;
  const invalidTokens: string[] = [];

  // FCM HTTP v1 sends one token per request. Cap concurrency to be gentle.
  const concurrency = 8;
  let idx = 0;
  async function worker() {
    while (idx < tokens.length) {
      const token = tokens[idx++];
      const body = {
        message: {
          token,
          ...(input.notification ? { notification: input.notification } : {}),
          ...(input.data ? { data: input.data } : {}),
          android: { priority: "HIGH" as const },
        },
      };
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          sent++;
        } else {
          failed++;
          const text = await res.text();
          if (
            res.status === 404 ||
            /UNREGISTERED|INVALID_ARGUMENT|NOT_FOUND/i.test(text)
          ) {
            invalidTokens.push(token);
          }
          console.warn("[fcm] send failed", res.status, text.slice(0, 200));
        }
      } catch (e) {
        failed++;
        console.warn("[fcm] send error", e);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, tokens.length) }, worker));

  return { sent, failed, invalidTokens };
}

/** Fetch tokens for a user and send. Uses the admin client (server-only). */
export async function sendFcmToUser(
  userId: string,
  payload: Omit<FcmSendInput, "tokens">,
): Promise<FcmSendResult> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("device_tokens")
    .select("token")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const tokens = (data ?? []).map((r) => r.token);
  const result = await sendFcmToTokens({ ...payload, tokens });
  if (result.invalidTokens.length > 0) {
    await supabaseAdmin
      .from("device_tokens")
      .delete()
      .in("token", result.invalidTokens);
  }
  return result;
}
