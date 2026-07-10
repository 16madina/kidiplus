// Server function to record push-registration diagnostic events per user.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  platform: z.string().max(20),
  step: z.string().max(64),
  ok: z.boolean(),
  message: z.string().max(1000).optional(),
});

export const logPushEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase.from("push_debug_logs").insert({
      user_id: userId,
      platform: data.platform,
      step: data.step,
      ok: data.ok,
      message: data.message ?? null,
    });
    return { ok: true };
  });
