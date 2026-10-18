import { Button, Result } from 'antd';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import i18n from '../i18n/index.ts';

interface State {
  error: Error | null;
  path: string;
}

/** Shows a recoverable error page instead of a blank screen when a page crashes. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null, path: location.pathname };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('page crashed', error, info.componentStack);
  }

  override componentDidUpdate(): void {
    // navigating away resets the boundary
    if (this.state.error && location.pathname !== this.state.path)
      this.setState({ error: null, path: location.pathname });
  }

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <Result
        status="error"
        title={i18n.t('errors.pageCrashed')}
        subTitle={this.state.error.message}
        extra={
          <Button type="primary" onClick={() => location.reload()}>
            {i18n.t('errors.reload')}
          </Button>
        }
      />
    );
  }
}
