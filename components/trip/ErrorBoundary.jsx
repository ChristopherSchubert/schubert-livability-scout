"use client";

// ErrorBoundary (issue #51) — error handling + observability for the trip UI.
// A render error in one panel shouldn't blank the whole workspace; this catches
// it, logs it, and shows a recoverable message. (Save-retry + realtime-reconnect
// live in TripProvider's saveState/subscribe; this is the render-side net.)
import { Component } from "react";

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Observability hook — wire to a real sink later; console keeps it honest now.
    console.error("Trip UI error:", error?.message, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="trip-ws">
          <div className="day-flag" role="alert">
            Something went wrong rendering this view: {this.state.error.message}
          </div>
          <button
            type="button"
            className="auth-ghost"
            onClick={() => this.setState({ error: null })}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
