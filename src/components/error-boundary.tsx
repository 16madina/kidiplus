// Reusable React ErrorBoundary — wraps major surfaces (live viewer, broadcast,
// payment sheets, admin, feed) so a component crash NEVER white-screens the
// whole app. Renders a friendly recoverable fallback and logs the error via
// the existing lovable-error-reporting hook.
import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportLovableError } from "@/lib/lovable-error-reporting";

type Props = {
  /** Human name of the surface — appears in logs to help triage. */
  boundary: string;
  /** Custom fallback renderer; falls back to the default card. */
  fallback?: (opts: { error: Error; reset: () => void }) => ReactNode;
  /** Called after reset — useful to also close a modal / go back. */
  onReset?: () => void;
  children: ReactNode;
};

type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      reportLovableError(error, {
        boundary: this.props.boundary,
        componentStack: info.componentStack ?? undefined,
      });
    } catch {
      // never let the reporter itself crash the app
    }
    // Also surface in console for local debugging.
     
    console.error(`[boundary:${this.props.boundary}]`, error, info.componentStack);
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset?.();
  };

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback({ error: this.state.error, reset: this.reset });
      }
      return <DefaultFallback error={this.state.error} reset={this.reset} />;
    }
    return this.props.children;
  }
}

function DefaultFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="absolute inset-0 z-[9999] flex items-center justify-center bg-background/95 px-6 backdrop-blur-xl">
      <div className="mx-auto w-full max-w-sm text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-destructive/10 text-destructive">
          !
        </div>
        <h2 className="mt-4 text-base font-semibold text-foreground">
          Une erreur est survenue
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground">
          On n'a pas pu afficher cette section. Réessaie ou reviens en arrière.
        </p>
        {import.meta.env.DEV && (
          <p className="mt-2 break-all text-[11px] font-mono text-muted-foreground/70">
            {error.message}
          </p>
        )}
        <button
          onClick={reset}
          className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-primary px-5 text-[14px] font-semibold text-primary-foreground active:opacity-80"
        >
          Réessayer
        </button>
      </div>
    </div>
  );
}
