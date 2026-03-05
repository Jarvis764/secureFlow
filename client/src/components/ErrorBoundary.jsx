import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  handleReset() {
    this.setState({ hasError: false, error: null });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div style={{
        minHeight:      '100vh',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        padding:        '2rem',
        background:     'var(--bg-primary)',
      }}>
        <div
          className="glass-card"
          style={{ textAlign: 'center', maxWidth: '460px', width: '100%' }}
        >
          <div style={{ fontSize: '3.5rem', marginBottom: '1rem' }}>💥</div>
          <h2 style={{ color: 'var(--severity-critical)', marginBottom: '0.5rem', fontFamily: 'var(--font-mono)' }}>
            Something went wrong
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '1.5rem' }}>
            {this.state.error?.message || 'An unexpected error occurred. Please try again.'}
          </p>
          <button
            className="btn-primary"
            onClick={() => this.handleReset()}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }
}
