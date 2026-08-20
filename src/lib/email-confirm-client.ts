import { supabase } from "@/integrations/supabase/client";

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Non connecté");
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

export async function sendEmailConfirmCode(): Promise<void> {
  const res = await fetch("/api/email-confirm/send", {
    method: "POST",
    headers: await authHeaders(),
    body: "{}",
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(body.message || body.error || `Envoi impossible (${res.status})`);
  }
}

export async function verifyEmailConfirmCode(code: string): Promise<void> {
  const res = await fetch("/api/email-confirm/verify", {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify({ code: code.trim() }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(body.message || body.error || `Code invalide (${res.status})`);
  }
}
