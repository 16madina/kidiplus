// Apple App Site Association — Universal Links for iOS.
//
// Served as a TanStack server route so we control the Content-Type
// (application/json) — Apple's `swcd` daemon rejects the file otherwise.
//
// TEAM ID  : 6XW2XM3NDF   (from ios/App/App.xcodeproj/project.pbxproj)
// BUNDLE   : com.kidiplus.app
// APP ID   : <TEAM>.<BUNDLE>  →  6XW2XM3NDF.com.kidiplus.app
//
// Paths listed under `details.paths` are the URLs iOS will open in the app
// instead of Safari. Everything else on kidiplus.com stays in Safari.
import { createFileRoute } from '@tanstack/react-router'

const AASA = {
  applinks: {
    apps: [],
    details: [
      {
        appIDs: ['6XW2XM3NDF.com.kidiplus.app'],
        components: [
          { '/': '/join/*', comment: 'Referral invite links' },
          { '/': '/live/*', comment: 'Shared live rooms' },
          { '/': '/open', comment: 'Email deep-link bridge' },
          { '/': '/paypal-return', comment: 'PayPal wallet top-up return' },
          { '/': '/auth-callback', comment: 'OAuth return' },
          { '/': '/reset-password', comment: 'Password reset' },
        ],
      },
    ],
  },
  // Optional: webcredentials lets iOS suggest saved passwords in the app.
  webcredentials: {
    apps: ['6XW2XM3NDF.com.kidiplus.app'],
  },
}

export const Route = createFileRoute('/.well-known/apple-app-site-association')({
  server: {
    handlers: {
      GET: () =>
        new Response(JSON.stringify(AASA), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600',
          },
        }),
    },
  },
})
