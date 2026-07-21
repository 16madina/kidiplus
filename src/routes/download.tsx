import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'
import { EMAIL_CONFIG } from '@/lib/email/config'
import kidiPlusLogo from '@/assets/img/brands/kidi-plus-logo.png'

/**
 * Landing page for app download links (App Store + Play Store).
 */
export const Route = createFileRoute('/download')({
  validateSearch: (search: Record<string, unknown>) => ({
    next: typeof search.next === 'string' ? search.next : undefined,
    ref: typeof search.ref === 'string' ? search.ref : undefined,
  }),
  component: DownloadPage,
  head: () => ({
    meta: [
      { title: 'Télécharger KIDI+ — iOS & Android' },
      {
        name: 'description',
        content:
          "Téléchargez l'application KIDI+ sur l'App Store ou Google Play pour vivre le live shopping et les enchères en temps réel.",
      },
      { property: 'og:title', content: 'Télécharger KIDI+' },
      {
        property: 'og:description',
        content: "L'app KIDI+ sur iOS et Android — live shopping & enchères.",
      },
    ],
  }),
})

const APP_STORE_URL = EMAIL_CONFIG.APP_STORE_URL
const PLAY_STORE_URL = EMAIL_CONFIG.PLAY_STORE_URL

function isStoreReady(url: string) {
  return !!url && url !== '#' && !url.includes('YOUR_APP_STORE_ID')
}

function DownloadPage() {
  const { next, ref } = Route.useSearch()

  useEffect(() => {
    try {
      if (next?.startsWith('/')) window.localStorage.setItem('kidi.pending_path', next)
      if (ref) window.localStorage.setItem('kidi.referral_code', ref)
    } catch {
      /* ignore */
    }
  }, [next, ref])

  const appStoreReady = isStoreReady(APP_STORE_URL)
  const playStoreReady = isStoreReady(PLAY_STORE_URL)

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        background:
          'radial-gradient(circle at top, #1B2347 0%, #10162B 60%, #0A0E1F 100%)',
        color: '#fff',
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        textAlign: 'center',
        gap: 28,
      }}
    >
      <img
        src={kidiPlusLogo}
        alt="KIDI+"
        style={{ width: 120, height: 'auto' }}
      />

      <div style={{ maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, letterSpacing: -0.5 }}>
          Téléchargez l'application KIDI+
        </h1>
        <p style={{ margin: 0, fontSize: 15, opacity: 0.8, lineHeight: 1.5 }}>
          Vivez le live shopping et les enchères en temps réel depuis votre mobile.
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          width: '100%',
          maxWidth: 320,
        }}
      >
        <StoreButton
          href={APP_STORE_URL}
          disabled={!appStoreReady}
          badge={appStoreReady ? undefined : 'Bientôt disponible'}
          label="Télécharger sur"
          store="App Store"
          icon={<AppleIcon />}
        />
        <StoreButton
          href={PLAY_STORE_URL}
          disabled={!playStoreReady}
          badge={playStoreReady ? undefined : 'Bientôt disponible'}
          label="Disponible sur"
          store="Google Play"
          icon={<PlayIcon />}
        />
      </div>

      <a
        href={
          next?.startsWith('/')
            ? `${next}${next.includes('?') ? '&' : '?'}web=1`
            : 'https://kidiplus.com'
        }
        style={{
          marginTop: 8,
          fontSize: 13,
          color: '#E8C46A',
          textDecoration: 'none',
          opacity: 0.85,
        }}
      >
        Continuer sur le site web →
      </a>
    </main>
  )
}

function StoreButton({
  href,
  disabled,
  label,
  store,
  icon,
  badge,
}: {
  href: string
  disabled: boolean
  label: string
  store: string
  icon: React.ReactNode
  badge?: string
}) {
  return (
    <a
      href={disabled ? undefined : href}
      onClick={(e) => disabled && e.preventDefault()}
      aria-disabled={disabled}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '14px 18px',
        borderRadius: 14,
        background: '#000',
        color: '#fff',
        textDecoration: 'none',
        border: '1px solid rgba(255,255,255,0.15)',
        opacity: disabled ? 0.55 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
      }}
    >
      <div style={{ flexShrink: 0 }}>{icon}</div>
      <div style={{ textAlign: 'left', lineHeight: 1.1 }}>
        <div style={{ fontSize: 11, opacity: 0.8 }}>{label}</div>
        <div style={{ fontSize: 18, fontWeight: 700 }}>{store}</div>
      </div>
      {disabled && badge ? (
        <span
          style={{
            position: 'absolute',
            top: -8,
            right: 10,
            background: '#E11D48',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: 999,
            letterSpacing: 0.3,
          }}
        >
          {badge}
        </span>
      ) : null}
    </a>
  )
}

function AppleIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.365 1.43c0 1.14-.44 2.23-1.17 3.03-.78.87-2.06 1.55-3.11 1.46-.13-1.1.42-2.27 1.11-3.02.78-.87 2.13-1.52 3.17-1.47zM20.5 17.16c-.56 1.29-.83 1.87-1.55 3.01-1.01 1.6-2.43 3.59-4.19 3.61-1.57.01-1.97-1.02-4.09-1.01-2.13.01-2.57 1.02-4.14 1.01-1.76-.02-3.11-1.82-4.11-3.41C-.32 16.5-.6 11.2 2.16 8.38c1.32-1.34 3.4-2.19 5.37-2.23 1.98-.04 3.85 1.02 5.06 1.02 1.19 0 3.51-1.26 5.9-1.07.98.04 3.73.4 5.5 3-4.02 2.2-3.4 8.14 1.51 8.06z" />
    </svg>
  )
}

function PlayIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.6 2.3c-.4.3-.6.8-.6 1.4v16.6c0 .6.2 1.1.6 1.4l9.5-9.7L3.6 2.3z" fill="#34A853" />
      <path d="M17.6 8.5L14.3 6.6 3.6 2.3l9.5 9.7 4.5-3.5z" fill="#FBBC04" />
      <path d="M17.6 15.5l-4.5-3.5-9.5 9.7 10.7-4.3 3.3-1.9z" fill="#EA4335" />
      <path d="M21.5 10.9l-3.9-2.4-4.5 3.5 4.5 3.5 3.9-2.3c1.1-.6 1.1-2.1 0-2.3z" fill="#4285F4" />
    </svg>
  )
}
