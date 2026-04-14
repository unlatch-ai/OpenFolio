import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[openfolio] Render error:", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="gate-shell">
          <div className="gate-card">
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground mb-3">
              Something went wrong
            </p>
            <h1 className="text-xl font-bold tracking-tight">
              OpenFolio encountered an error
            </h1>
            <p className="mt-2 text-sm text-destructive">
              {this.state.error?.message || "Unknown error"}
            </p>
            <button
              className="mt-4 text-sm text-primary underline"
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
