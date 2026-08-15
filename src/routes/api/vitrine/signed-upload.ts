// POST /api/vitrine/signed-upload
// Ensures the public `vitrine-media` bucket exists, then returns a
// service-role signed upload URL so sellers can publish even when
// Lovable hasn't applied the storage RLS migration yet.

import { createFileRoute } from "@tanstack/react-router";
import { isAllowedOrigin } from "@/lib/api-cors";

const BUCKET = "vitrine-media";
const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-m4v",
  "video/3gpp",
  "video/3gpp2",
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/flac",
];


function cors(origin: string | null): HeadersInit {
  const h: Record<string, string> = {
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
  if (origin && isAllowedOrigin(origin)) h["Access-Control-Allow-Origin"] = origin;
  return h;
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...cors(origin),
    },
  });
}

async function requireUser(
  request: Request,
): Promise<
  | { ok: true; userId: string; origin: string | null }
  | { ok: false; response: Response }
> {
  const origin = request.headers.get("origin");
  if (origin && !isAllowedOrigin(origin)) {
    return { ok: false, response: json({ error: "Origin not allowed" }, 403, origin) };
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
    return {
      ok: false,
      response: json({ error: "Auth backend not configured" }, 500, origin),
    };
  }

  const authHeader = request.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { ok: false, response: json({ error: "Unauthorized" }, 401, origin) };
  }
  const bearer = authHeader.slice("Bearer ".length).trim();
  if (!bearer) {
    return { ok: false, response: json({ error: "Unauthorized" }, 401, origin) };
  }

  const { createClient } = await import("@supabase/supabase-js");
  const authClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
  const { data: claimsData, error: claimsError } =
    await authClient.auth.getClaims(bearer);
  const userId = claimsData?.claims?.sub ?? null;
  if (claimsError || !userId || typeof userId !== "string") {
    // Fallback for older JWT shapes.
    const { data: userData, error: userError } = await authClient.auth.getUser(bearer);
    if (userError || !userData.user?.id) {
      return { ok: false, response: json({ error: "Unauthorized" }, 401, origin) };
    }
    return { ok: true, userId: userData.user.id, origin };
  }
  return { ok: true, userId, origin };
}

async function ensureVitrineBucket(admin: {
  storage: {
    listBuckets: () => Promise<{ data: { id: string; name: string }[] | null }>;
    createBucket: (
      id: string,
      opts: {
        public: boolean;
        fileSizeLimit: number;
        allowedMimeTypes: string[];
      },
    ) => Promise<{ error: { message: string } | null }>;
    updateBucket: (
      id: string,
      opts: {
        public: boolean;
        fileSizeLimit: number;
        allowedMimeTypes: string[];
      },
    ) => Promise<{ error: { message: string } | null }>;
  };
}) {
  const { data: buckets } = await admin.storage.listBuckets();
  const exists = (buckets ?? []).some((b) => b.id === BUCKET || b.name === BUCKET);
  if (!exists) {
    const { error: createErr } = await admin.storage.createBucket(BUCKET, {
      public: true,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: ALLOWED_MIME,
    });
    // Race: another request may have created it.
    if (createErr && !/already exists|duplicate/i.test(createErr.message)) {
      throw createErr;
    }
  } else {
    // Best-effort: keep mime/size in sync (ignore if API rejects).
    try {
      await admin.storage.updateBucket(BUCKET, {
        public: true,
        fileSizeLimit: MAX_BYTES,
        allowedMimeTypes: ALLOWED_MIME,
      });
    } catch {
      /* ignore */
    }
  }
}

export const Route = createFileRoute("/api/vitrine/signed-upload")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, {
          status: 204,
          headers: cors(request.headers.get("origin")),
        }),

      POST: async ({ request }) => {
        const auth = await requireUser(request);
        if (!auth.ok) return auth.response;
        const { userId, origin } = auth;

        let body: { ext?: unknown; contentType?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid JSON body" }, 400, origin);
        }

        const rawExt =
          typeof body.ext === "string"
            ? body.ext.toLowerCase().replace(/[^a-z0-9]/g, "")
            : "";
        const contentType =
          typeof body.contentType === "string" ? body.contentType : "";
        let ext = rawExt;
        if (!ext) {
          if (contentType.includes("quicktime")) ext = "mov";
          else if (contentType.startsWith("video/")) ext = "mp4";
          else if (contentType === "image/png") ext = "png";
          else if (contentType === "image/webp") ext = "webp";
          else if (contentType.startsWith("image/")) ext = "jpg";
          else ext = "bin";
        }

        try {
          const { supabaseAdmin } = await import(
            "@/integrations/supabase/client.server"
          );
          await ensureVitrineBucket(supabaseAdmin);

          const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const { data, error } = await supabaseAdmin.storage
            .from(BUCKET)
            .createSignedUploadUrl(path);

          if (error || !data?.signedUrl || !data?.token) {
            console.error("[vitrine/signed-upload]", error?.message);
            return json(
              {
                error: "signed_url_failed",
                message: error?.message ?? "Could not create upload URL",
              },
              500,
              origin,
            );
          }

          const { data: pub } = supabaseAdmin.storage
            .from(BUCKET)
            .getPublicUrl(path);

          return json(
            {
              ok: true,
              path: data.path ?? path,
              token: data.token,
              signedUrl: data.signedUrl,
              publicUrl: pub.publicUrl,
              bucket: BUCKET,
            },
            200,
            origin,
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[vitrine/signed-upload]", msg);
          return json({ error: "ensure_failed", message: msg }, 500, origin);
        }
      },
    },
  },
});
