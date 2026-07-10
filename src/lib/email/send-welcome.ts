import { supabase } from '@/integrations/supabase/client'

/**
 * Send the KIDI+ welcome email to the currently authenticated user.
 * Idempotent at the DB level via profiles.welcome_email_sent.
 */
export async function sendWelcomeEmailOnce(params: {
  userId: string
  email: string
  displayName?: string | null
  alreadySent: boolean
}): Promise<void> {
  if (params.alreadySent) return

  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) return

  try {
    const res = await fetch('/lovable/email/transactional/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        templateName: 'welcome',
        recipientEmail: params.email,
        idempotencyKey: `welcome-${params.userId}`,
        templateData: {
          displayName: params.displayName ?? undefined,
        },
      }),
    })

    if (!res.ok) {
      const body = await res.text().catch(() => '')
      console.warn('[welcome-email] send failed', res.status, body)
      return
    }

    // Mark the flag so we never send it twice, even if the user signs in again.
    await supabase
      .from('profiles')
      .update({ welcome_email_sent: true })
      .eq('id', params.userId)
  } catch (err) {
    console.warn('[welcome-email] unexpected error', err)
  }
}
