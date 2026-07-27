// GET /api/public/app-version
// -----------------------------
// Public policy for native store updates. Change env vars on Lovable to
// prompt (soft) or block (force) users still on an old binary — no need to
// rebuild the web app.
//
// Env (optional):
//   APP_NATIVE_MIN_VERSION=5.0          // below this → always force
//   APP_NATIVE_LATEST_VERSION=5.1       // below this → soft (or force if flag)
//   APP_NATIVE_FORCE_UPDATE=1           // treat "below latest" as force
//   APP_NATIVE_UPDATE_MESSAGE=...        // optional custom copy
//   APP_NATIVE_MIN_VERSION_IOS=...      // platform overrides
//   APP_NATIVE_MIN_VERSION_ANDROID=...
//   APP_NATIVE_LATEST_VERSION_IOS=...
//   APP_NATIVE_LATEST_VERSION_ANDROID=...

import { createFileRoute } from "@tanstack/react-router";
import { EMAIL_CONFIG } from "@/lib/email/config";

function env(name: string, fallback = ""): string {
  return (process.env[name] ?? fallback).trim();
}

function truthy(raw: string): boolean {
  const v = raw.toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
}

export const Route = createFileRoute("/api/public/app-version")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const platform = (url.searchParams.get("platform") ?? "").toLowerCase();

        let minVersion = env("APP_NATIVE_MIN_VERSION", "0.0.0");
        let latestVersion = env("APP_NATIVE_LATEST_VERSION", minVersion || "0.0.0");

        if (platform === "ios") {
          minVersion = env("APP_NATIVE_MIN_VERSION_IOS", minVersion);
          latestVersion = env("APP_NATIVE_LATEST_VERSION_IOS", latestVersion);
        } else if (platform === "android") {
          minVersion = env("APP_NATIVE_MIN_VERSION_ANDROID", minVersion);
          latestVersion = env("APP_NATIVE_LATEST_VERSION_ANDROID", latestVersion);
        }

        if (!latestVersion) latestVersion = minVersion || "0.0.0";
        if (!minVersion) minVersion = "0.0.0";

        const body = {
          minVersion,
          latestVersion,
          force: truthy(env("APP_NATIVE_FORCE_UPDATE")),
          message: env("APP_NATIVE_UPDATE_MESSAGE") || null,
          iosStoreUrl: env("APP_STORE_URL", EMAIL_CONFIG.APP_STORE_URL),
          androidStoreUrl: env("PLAY_STORE_URL", EMAIL_CONFIG.PLAY_STORE_URL),
        };

        return new Response(JSON.stringify(body), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
          },
        });
      },
    },
  },
});
