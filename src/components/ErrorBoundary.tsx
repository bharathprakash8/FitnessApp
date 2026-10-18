import { Component, type ErrorInfo, type ReactNode } from 'react';

const RELOAD_KEY = 'fitcoach-reloaded-after-error';

/**
 * Last line of defence: if a screen crashes, show a friendly message with a Reload button
 * instead of a blank page. After a new release an old screen may fail to load its code;
 * that case reloads once by itself.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('FitCoach crashed', error, info.componentStack);
    const staleCode = /dynamically imported module|Importing a module script failed|chunk/i.test(
      error.message,
    );
    try {
      if (staleCode && !sessionStorage.getItem(RELOAD_KEY)) {
        sessionStorage.setItem(RELOAD_KEY, '1');
        window.location.reload();
      }
    } catch {
      /* storage blocked: just show the message */
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash-screen" role="alert">
        <img src="/icon.svg" alt="" width={72} height={72} />
        <h1>Something went wrong</h1>
        <p>Sorry about that. Your saved data is safe. Please reload the app.</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
        <a href="/">Go to the home screen</a>
        <p className="crash-detail">{this.state.error.message}</p>
      </div>
    );
  }
}
