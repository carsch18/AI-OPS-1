/**
 * ErrorBoundary - React Error Boundary for graceful crash handling
 * 
 * Catches JavaScript errors in child component tree and displays
 * a fallback UI instead of crashing the entire application.
 */

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

// Error info to display
interface ErrorBoundaryState {
    hasError: boolean;
    error: Error | null;
    errorInfo: ErrorInfo | null;
}

interface ErrorBoundaryProps {
    children: ReactNode;
    fallback?: ReactNode;
    onError?: (error: Error, errorInfo: ErrorInfo) => void;
    pageName?: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = {
            hasError: false,
            error: null,
            errorInfo: null,
        };
    }

    static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
        // Update state so next render shows fallback UI
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        // Log error to console
        console.error('🚨 ErrorBoundary caught an error:', error);
        console.error('Component stack:', errorInfo.componentStack);

        this.setState({ errorInfo });

        // Call optional error handler
        this.props.onError?.(error, errorInfo);
    }

    handleRetry = () => {
        this.setState({
            hasError: false,
            error: null,
            errorInfo: null,
        });
    };

    render() {
        if (this.state.hasError) {
            // Custom fallback if provided
            if (this.props.fallback) {
                return this.props.fallback;
            }

            // Default fallback UI
            return (
                <div className="error-boundary-fallback">
                    <div className="error-content">
                        <span className="error-icon">⚠️</span>
                        <h2>Something went wrong</h2>
                        <p className="error-page">
                            {this.props.pageName
                                ? `The ${this.props.pageName} page encountered an error.`
                                : 'This section encountered an error.'}
                        </p>
                        {this.state.error && (
                            <p className="error-message">{this.state.error.message}</p>
                        )}
                        <div className="error-actions">
                            <button className="btn-retry" onClick={this.handleRetry}>
                                🔄 Try Again
                            </button>
                            <button
                                className="btn-home"
                                onClick={() => window.location.href = '/'}
                            >
                                🏠 Go Home
                            </button>
                        </div>
                        <details className="error-details">
                            <summary>Error Details</summary>
                            <pre>{this.state.error?.stack}</pre>
                            <pre>{this.state.errorInfo?.componentStack}</pre>
                        </details>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

/**
 * PageErrorBoundary - Wrapper with page-specific styling
 */
export function PageErrorBoundary({
    children,
    pageName,
}: {
    children: ReactNode;
    pageName: string;
}) {
    return (
        <ErrorBoundary pageName={pageName}>
            {children}
        </ErrorBoundary>
    );
}

export default ErrorBoundary;
