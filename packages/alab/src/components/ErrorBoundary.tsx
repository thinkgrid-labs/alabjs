import { Component, type ReactNode, type ErrorInfo } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback UI. Receives the error and a reset callback. */
  fallback?: (props: { error: Error; reset: () => void }) => ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * React class error boundary that wraps the Alab page root.
 *
 * Catches unhandled errors thrown during rendering, inside event handlers called
 * during the commit phase, and inside lifecycle methods. Renders the nearest
 * `error.tsx` fallback (or a minimal built-in fallback) instead of crashing.
 *
 * Usage (automatic — wired by the `/@alab/client` virtual module):
 *   The virtual client module wraps `<Page>` in this boundary automatically.
 *   You do not need to add it manually unless building a custom entry point.
 *
 * Manual usage:
 *   import { ErrorBoundary } from "alab/components";
 *   <ErrorBoundary fallback={({ error, reset }) => <p onClick={reset}>{error.message}</p>}>
 *     <MyComponent />
 *   </ErrorBoundary>
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[alab] Unhandled render error:", error, info.componentStack);
  }

  reset(): void {
    this.setState({ error: null });
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    if (this.props.fallback) {
      return this.props.fallback({ error, reset: this.reset });
    }

    // Built-in minimal fallback
    return (
      <div style={{ padding: "2rem", fontFamily: "monospace" }}>
        <h2 style={{ color: "#e11d48" }}>Something went wrong</h2>
        <pre style={{ background: "#fef2f2", padding: "1rem", borderRadius: "0.5rem", overflow: "auto" }}>
          {error.message}
        </pre>
        <button
          onClick={this.reset}
          style={{ marginTop: "1rem", padding: "0.5rem 1rem", cursor: "pointer" }}
        >
          Try again
        </button>
      </div>
    );
  }
}
