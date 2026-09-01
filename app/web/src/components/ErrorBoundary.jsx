import { Component } from "react";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    // Log for diagnostics — not a crash
    console.error("ErrorBoundary caught", error, info);
  }
  render() {
    if (this.state.error) {
      const reset = () => this.setState({ error: null });
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="text-[14px] font-semibold text-fg">Something went wrong displaying this view.</div>
          <div className="max-w-md break-words text-[12px] leading-relaxed text-fg-muted">
            {String(this.state.error?.message ?? this.state.error)}
          </div>
          <div className="flex gap-2">
            <button onClick={reset} className="rounded-lg border border-line bg-panel px-3 py-1.5 text-[12px] text-fg transition hover:bg-hover">
              Try again
            </button>
            <button
              onClick={() => { this.setState({ error: null }); window.location.hash = "#/chat"; }}
              className="rounded-lg bg-accent px-3 py-1.5 text-[12px] font-medium text-on-accent transition hover:bg-accent-hi"
            >
              Go to chats
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
