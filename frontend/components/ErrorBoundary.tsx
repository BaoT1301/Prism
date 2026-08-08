import { Component, type ErrorInfo, type ReactNode } from "react";

type FallbackRender = (args: { error: Error; reset: () => void }) => ReactNode;

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: FallbackRender;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches render-time exceptions so a single bad payload or logic error shows a
 * recoverable message instead of a blank white screen. `reset` clears the error
 * and re-mounts the subtree.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Surface for debugging; kept out of the UI to avoid leaking internals.
    console.error("Prism ErrorBoundary caught an error", error, info.componentStack);
  }

  reset = (): void => this.setState({ error: null });

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback({ error, reset: this.reset });
    return (
      <main className="system-message" role="alert" data-testid="error-boundary">
        <p className="eyebrow">Something interrupted your Prism</p>
        <h1>We hit an unexpected snag.</h1>
        <p>Your work is safe. Try again, and if it keeps happening, reload the page.</p>
        <div className="button-group">
          <button type="button" onClick={this.reset}>Try again</button>
          <button className="secondary-button" type="button" onClick={() => location.reload()}>Reload</button>
        </div>
      </main>
    );
  }
}
