"use client";

import React from "react";
import { MapPinOff, RotateCw } from "lucide-react";

/**
 * Map error boundary: catches render-time failures in either map engine
 * and offers a plain-language recovery path instead of a blank panel.
 */
interface Props {
  children: React.ReactNode;
  onRetry: () => void;
}
interface State {
  error: Error | null;
}

export class MapErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidUpdate(prev: Props) {
    if (prev.onRetry !== this.props.onRetry && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="size-full grid place-items-center bg-ink-850 p-6">
          <div className="panel rounded-xl p-6 max-w-sm text-center">
            <div className="mx-auto size-10 grid place-items-center rounded-lg bg-red-50 text-sev-critical">
              <MapPinOff className="size-5" aria-hidden />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-slate-900">The Map Could Not Load</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
              Something went wrong while drawing the map. Your data is safe. Tap Retry to
              reload the map, or use the event list below to keep working.
            </p>
            <p className="mt-2 data-mono text-[0.6rem] text-slate-400 break-words">{this.state.error.message}</p>
            <button
              onClick={() => this.setState({ error: null }, this.props.onRetry)}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-water px-4 py-2.5 text-xs font-semibold text-white hover:bg-water-dim transition-colors"
            >
              <RotateCw className="size-3.5" aria-hidden />
              Retry Loading Map
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
