/**
 * Sign live/shop storage paths with the service role so Web Egress
 * (unauthenticated browser) can show the real product photos.
 */

import { parseSupabaseStorageUrl, stripBucketPrefix } from "@/lib/storage-path";

const SIGN_TTL_SEC = 60 * 60 * 6; // 6h — covers a long live + finalize

type Admin = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

export async function signBroadcastProductImage(
  supabaseAdmin: Admin,
  value: string | null | undefined,
): Promise<string | null> {
  if (!value) return null;
  if (/^(blob:|data:)/i.test(value)) return value;

  let prefer: string[] = ["live-products", "shop-products", "live-covers"];
  let path = value;

  if (/^https?:\/\//i.test(value)) {
    const parsed = parseSupabaseStorageUrl(value);
    if (!parsed) return value; // external (Unsplash, etc.)
    prefer = [parsed.bucket];
    path = parsed.path;
  }

  for (const b of prefer) {
    const objectPath = stripBucketPrefix(path, b);
    const { data, error } = await supabaseAdmin.storage
      .from(b)
      .createSignedUrl(objectPath, SIGN_TTL_SEC);
    if (!error && data?.signedUrl) return data.signedUrl;
  }
  return null;
}
