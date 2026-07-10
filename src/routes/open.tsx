import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

/**
 * Bridge page used in emails/links to open the mobile app when installed,
 * and fall back to the web app otherwise.
 *
 * Usage: /open?path=/sell/onboarding
 */
export const Route = createFileRoute('/open')({
  validateSearch: (search: Record<string, unknown>) => ({
    path: typeof search.path === 'string' ? search.path : '/',
  }),
  component: OpenBridge,
  head: () => ({
    meta: [
      { title: 'Ouverture de KIDI+…' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
})

function OpenBridge() {
  const { path } = Route.useSearch()
  const safePath = path.startsWith('/') ? path : `/${path}`
  const downloadUrl = `/download?path=${encodeURIComponent(safePath)}`
  const appUrl = `kidiplus://${safePath.replace(/^\//, '')}`
  const [fallback, setFallback] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const ua = window.navigator.userAgent || ''
    const isMobile = /Android|iPhone|iPad|iPod/i.test(ua)

    // Desktop → straight to the download page (nothing to deep-link into).
    if (!isMobile) {
      window.location.replace(downloadUrl)
      return
    }

    // Mobile: try to launch the native app, then fall back to the download page.
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
  }, [appUrl, downloadUrl])

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
      <h1 style={{ fontSize: 22, margin: 0, fontWeight: 800 }}>Ouverture de KIDI+…</h1>
      <p style={{ opacity: 0.8, margin: 0, fontSize: 14 }}>
        {fallback
          ? "L'application n'a pas répondu, ouverture du site."
          : "Nous tentons d'ouvrir l'application. Patiente un instant…"}
      </p>
      <a
        href={webUrl}
        style={{
          marginTop: 12,
          background: '#E11D48',
          color: '#fff',
          padding: '12px 22px',
          borderRadius: 999,
          fontWeight: 700,
          textDecoration: 'none',
          fontSize: 14,
        }}
      >
        Continuer sur le site
      </a>
    </main>
  )
}
