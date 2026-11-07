import React from 'react';
import Button from './Button';
import { clearFleetFlowStorage } from '../../api/client';
import './ErrorBoundary.css';

/**
 * Robust ErrorBoundary component for FleetFlow
 * Can be wrapped around the entire application or around individual layout page outlets.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    if (error && typeof error === 'object') {
      try {
        error._caughtByBoundary = true;
      } catch {}
    }
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    const componentName = this.props.componentName || this.props.name || 'Component';
    console.error(`[ErrorBoundary] Component "${componentName}" crashed:`, error, errorInfo);

    const isChunkError =
      error?.name === 'ChunkLoadError' ||
      error?.message?.includes('Loading chunk') ||
      error?.message?.includes('Loading CSS chunk');

    if (isChunkError) {
      try {
        const lastRetry = sessionStorage.getItem('ff_chunk_reload_retry');
        const now = Date.now();
        if (!lastRetry || now - Number(lastRetry) > 15000) {
          sessionStorage.setItem('ff_chunk_reload_retry', String(now));
          window.location.reload();
        }
      } catch {}
    }
  }

  handleTryAgain = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (typeof this.props.onReset === 'function') {
      this.props.onReset();
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoDashboard = () => {
    window.location.href = '/';
  };

  handleLogout = () => {
    clearFleetFlowStorage();
    window.location.href = '/login';
  };

  render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback({
          error: this.state.error,
          resetError: this.handleTryAgain,
        });
      }

      const isDev = process.env.NODE_ENV === 'development';
      const componentName = this.props.componentName || this.props.name || 'this page';

      return (
        <div className="error-boundary-wrapper" role="alert">
          <div className="error-boundary-card">
            {/* FleetFlow Logo Icon */}
            <div className="error-boundary-logo" aria-hidden="true">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1 .4-1 1v7c0 .6.4 1 1 1h2" />
                <circle cx="7" cy="17" r="2" />
                <path d="M9 17h6" />
                <circle cx="17" cy="17" r="2" />
              </svg>
            </div>

            <h2 className="error-boundary-title">Something went wrong on {componentName}</h2>
            <p className="error-boundary-subtitle">
              An unexpected error occurred while rendering this section. You can try refreshing or returning to your dashboard.
            </p>

            <div className="error-boundary-actions">
              <Button
                type="button"
                variant="primary"
                size="small"
                onClick={this.handleTryAgain}
              >
                Try again
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="small"
                onClick={this.handleReload}
              >
                Reload page
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="small"
                onClick={this.handleGoDashboard}
              >
                Go to dashboard
              </Button>
              <Button
                type="button"
                variant="danger"
                size="small"
                onClick={this.handleLogout}
              >
                Logout
              </Button>
            </div>

            {/* Development-only Technical Error Details */}
            {isDev && this.state.error && (
              <details className="error-boundary-details">
                <summary>Technical Details (Development Only)</summary>
                <div className="error-boundary-stack">
                  <strong>{this.state.error.toString()}</strong>
                  <br />
                  {this.state.errorInfo?.componentStack || this.state.error.stack}
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
