import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { EMAIL_CONFIG } from '@/lib/email/config'
import { isNative } from '@/lib/native'

/**
 * Referral share landing: https://kidiplus.com/join/CODE
 *
 * Behavior:
 *  - Stores the referral code in localStorage so the signup screen can prefill it.
 *  - Already in the native app → stay in-app (no store redirect).
 *  - On mobile web, tries kidiplus://join/CODE then falls back to /download?ref=.
 *  - On desktop, redirects to the download page with the code preserved.
 */
export const Route = createFileRoute('/join/$code')({
  ssr: false,
  component: JoinPage,
  head: ({ params }) => ({
    meta: [
      { title: `Rejoins KIDI+ avec le code ${params.code}` },
      {
        name: 'description',
        content:
          "Télécharge l'application KIDI+ et utilise ce code à l'inscription pour rejoindre le live shopping.",
      },
      { property: 'og:title', content: `Rejoins KIDI+ avec le code ${params.code}` },
      {
        property: 'og:description',
        content: "Live shopping & enchères en direct — code d'invitation KIDI+.",
      },
      { name: 'robots', content: 'noindex' },
    ],
  }),
})

function JoinPage() {
  const { code } = Route.useParams()
  const navigate = useNavigate()
  const [fallback, setFallback] = useState(false)

  // FALLBACK_URL is already https://kidiplus.com/download — do not append /download again.
  const downloadUrl = `${EMAIL_CONFIG.FALLBACK_URL.replace(/\/$/, '')}?ref=${encodeURIComponent(code)}`
  const appUrl = `${EMAIL_CONFIG.APP_SCHEME}://join/${encodeURIComponent(code)}`

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Persist the referral code so the auth/signup screen can prefill it.
    try {
      window.localStorage.setItem('kidi.referral_code', code)
    } catch {
      /* ignore */
    }

    // Universal Link already opened the app — don't bounce to the stores.
    if (isNative()) {
      void navigate({ to: '/', replace: true })
      return
    }

    const ua = window.navigator.userAgent || ''
    const isMobile = /Android|iPhone|iPad|iPod/i.test(ua)

    if (!isMobile) {
      window.location.replace(downloadUrl)
      return
    }

    const start = Date.now()
    const timer = window.setTimeout(() => {
      if (Date.now() - start < 2500 && !document.hidden) {
        window.location.replace(downloadUrl)
      } else {
        setFallback(true)
      }
    }, 1500)

    window.location.href = appUrl
    return () => window.clearTimeout(timer)
  }, [appUrl, downloadUrl, code, navigate])

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        padding: 24,
        background: '#10162B',
        color: '#fff',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: 22, margin: 0, fontWeight: 800 }}>
        Code d'invitation KIDI+ : {code}
      </h1>
      <p style={{ opacity: 0.8, margin: 0, fontSize: 14, maxWidth: 380 }}>
        {fallback
          ? "L'application n'est pas installée. On t'envoie vers la page de téléchargement."
          : "Ouverture de KIDI+…"}
      </p>
      <a
        href={downloadUrl}
        style={{
          marginTop: 8,
          background: '#E11D48',
          color: '#fff',
          padding: '12px 22px',
          borderRadius: 999,
          fontWeight: 700,
          textDecoration: 'none',
          fontSize: 14,
        }}
      >
        Télécharger l'application
      </a>
    </main>
  )
}
