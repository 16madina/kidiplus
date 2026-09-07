import { decodeJwt, importPKCS8, SignJWT } from "jose";

const APPLE_AUDIENCE = "https://appleid.apple.com";
const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
const APPLE_REVOKE_URL = "https://appleid.apple.com/auth/revoke";
const DEFAULT_APPLE_CLIENT_ID = "com.kidiplus.app";

export class AppleRevokeError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "AppleRevokeError";
  }
}

type AppleConfig = {
  clientId: string;
  keyId: string;
  teamId: string;
  privateKey: string;
};

type AppleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  id_token?: string;
  error?: string;
};

function readAppleConfig(): AppleConfig {
  const clientId = (process.env.APPLE_CLIENT_ID ?? DEFAULT_APPLE_CLIENT_ID).trim();
  const keyId = (process.env.APPLE_KEY_ID ?? "").trim();
  const teamId = (process.env.APPLE_TEAM_ID ?? "").trim();
  const rawPrivateKey = (process.env.APPLE_PRIVATE_KEY ?? "").trim();
  const base64PrivateKey = (process.env.APPLE_PRIVATE_KEY_BASE64 ?? "").trim();
  const privateKey = (
    rawPrivateKey ||
    (base64PrivateKey
      ? new TextDecoder().decode(
          Uint8Array.from(atob(base64PrivateKey), (character) => character.charCodeAt(0)),
        )
      : "")
  ).replace(/\\n/g, "\n");

  if (!clientId || !keyId || !teamId || !privateKey) {
    throw new AppleRevokeError("apple_revoke_not_configured");
  }
  return { clientId, keyId, teamId, privateKey };
}

async function createAppleClientSecret(config: AppleConfig) {
  const key = await importPKCS8(config.privateKey, "ES256");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: config.keyId })
    .setIssuer(config.teamId)
    .setSubject(config.clientId)
    .setAudience(APPLE_AUDIENCE)
    .setIssuedAt(now)
    .setExpirationTime(now + 5 * 60)
    .sign(key);
}

async function postAppleForm(url: string, form: URLSearchParams) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}

/** Exchange a fresh native authorization code and revoke the resulting Apple token. */
export async function revokeAppleAuthorizationCode(
  authorizationCode: string,
  expectedAppleSubject: string,
) {
  const config = readAppleConfig();
  const clientSecret = await createAppleClientSecret(config);
  const tokenResponse = await postAppleForm(
    APPLE_TOKEN_URL,
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: clientSecret,
      code: authorizationCode,
      grant_type: "authorization_code",
    }),
  );
  const tokenBody = (await tokenResponse.json().catch(() => ({}))) as AppleTokenResponse;
  if (!tokenResponse.ok || tokenBody.error) {
    throw new AppleRevokeError("apple_code_exchange_failed");
  }

  const subject = tokenBody.id_token ? decodeJwt(tokenBody.id_token).sub : undefined;
  if (!subject || subject !== expectedAppleSubject) {
    throw new AppleRevokeError("apple_identity_mismatch");
  }

  const token = tokenBody.refresh_token ?? tokenBody.access_token;
  const tokenType = tokenBody.refresh_token ? "refresh_token" : "access_token";
  if (!token) throw new AppleRevokeError("apple_revoke_token_missing");

  const revokeResponse = await postAppleForm(
    APPLE_REVOKE_URL,
    new URLSearchParams({
      client_id: config.clientId,
      client_secret: clientSecret,
      token,
      token_type_hint: tokenType,
    }),
  );
  if (!revokeResponse.ok) throw new AppleRevokeError("apple_revoke_failed");
}
