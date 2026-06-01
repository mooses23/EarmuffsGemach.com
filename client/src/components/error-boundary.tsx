import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: React.ReactNode;
  variant?: "light" | "dark";
  label?: string;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary] Rendering error caught:", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    const isDark = this.props.variant === "dark";
    return (
      <div
        className={`rounded-xl border p-6 flex flex-col items-center justify-center gap-4 min-h-[200px] text-center ${
          isDark
            ? "border-white/10 bg-white/5"
            : "border-border bg-muted/40"
        }`}
        role="alert"
      >
        <AlertTriangle
          className={`h-8 w-8 ${isDark ? "text-amber-400" : "text-amber-500"}`}
          aria-hidden="true"
        />
        <div className="space-y-1">
          <p className={`font-semibold ${isDark ? "text-white" : "text-foreground"}`}>
            {this.props.label ?? "Something went wrong"}
          </p>
          <p className={`text-sm ${isDark ? "text-slate-400" : "text-muted-foreground"}`}>
            This section encountered an unexpected error.
          </p>
        </div>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className={`inline-flex items-center gap-2 text-sm px-3 py-1.5 rounded-md border transition-colors ${
            isDark
              ? "border-white/20 text-slate-300 hover:bg-white/10"
              : "border-border text-foreground hover:bg-accent"
          }`}
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Reload page
        </button>
      </div>
    );
  }
}
