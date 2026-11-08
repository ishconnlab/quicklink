import { Component } from 'react';
import { RefreshCw } from 'lucide-react';

export default class AppErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('QuickLink failed to render:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-loader app-error-screen">
          <section className="app-loader-card" role="alert">
            <span className="app-loader-mark" aria-hidden="true">QL</span>
            <p className="app-loader-brand">QuickLink</p>
            <h1 className="app-error-title">We couldn’t open your learning space</h1>
            <p className="app-loader-message">Your work is safe. Reload QuickLink to try again.</p>
            <button type="button" className="btn-primary app-error-reload" onClick={() => window.location.reload()}>
              <RefreshCw size={16} />
              Reload QuickLink
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}
