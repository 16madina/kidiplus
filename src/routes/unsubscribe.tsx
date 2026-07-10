import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

type State =
  | { kind: 'loading' }
  | { kind: 'valid' }
  | { kind: 'already' }
  | { kind: 'invalid' }
  | { kind: 'success' }
  | { kind: 'error'; message: string }

function UnsubscribePage() {
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [token, setToken] = useState<string | null>(null)

  useEffect(() => {
    const url = new URL(window.location.href)
    const t = url.searchParams.get('token')
    setToken(t)
    if (!t) {
      setState({ kind: 'invalid' })
      return
    }
    fetch(`/email/unsubscribe?token=${encodeURIComponent(t)}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({}))
        if (!r.ok) {
          setState({ kind: 'invalid' })
          return
        }
        if (body.valid === false && body.reason === 'already_unsubscribed') {
          setState({ kind: 'already' })
          return
        }
        if (body.valid) {
          setState({ kind: 'valid' })
        } else {
          setState({ kind: 'invalid' })
        }
      })
      .catch(() => setState({ kind: 'invalid' }))
  }, [])

  const confirm = async () => {
    if (!token) return
    setState({ kind: 'loading' })
    try {
      const r = await fetch('/email/unsubscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      const body = await r.json().catch(() => ({}))
      if (!r.ok) {
        setState({ kind: 'error', message: body?.error ?? 'Erreur inconnue' })
        return
      }
      if (body.success) setState({ kind: 'success' })
      else if (body.reason === 'already_unsubscribed') setState({ kind: 'already' })
      else setState({ kind: 'error', message: 'Impossible de traiter la demande.' })
    } catch {
      setState({ kind: 'error', message: 'Erreur réseau.' })
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-foreground">KIDI+</h1>
        <p className="mt-1 text-sm text-muted-foreground">Gestion des emails</p>

        <div className="mt-6">
          {state.kind === 'loading' && (
            <p className="text-sm text-muted-foreground">Chargement…</p>
          )}
          {state.kind === 'valid' && (
            <>
              <p className="text-base text-foreground">
                Souhaites-tu vraiment te désabonner des emails KIDI+ ?
              </p>
              <button
                onClick={confirm}
                className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90"
              >
                Confirmer le désabonnement
              </button>
            </>
          )}
          {state.kind === 'already' && (
            <p className="text-base text-foreground">
              Tu es déjà désabonné(e). Tu ne recevras plus nos emails.
            </p>
          )}
          {state.kind === 'success' && (
            <p className="text-base text-foreground">
              C'est fait. Tu es désabonné(e) des emails KIDI+.
            </p>
          )}
          {state.kind === 'invalid' && (
            <p className="text-base text-foreground">
              Ce lien de désabonnement est invalide ou a expiré.
            </p>
          )}
          {state.kind === 'error' && (
            <p className="text-base text-destructive">{state.message}</p>
          )}
        </div>

        <a
          href="/"
          className="mt-8 inline-block text-xs text-muted-foreground underline"
        >
          Retour à KIDI+
        </a>
      </div>
    </div>
  )
}

export const Route = createFileRoute('/unsubscribe')({
  component: UnsubscribePage,
})
