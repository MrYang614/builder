import { Component } from 'react';
import { Alert } from '@building/ui';
import type { ReactNode, ErrorInfo } from 'react';

/** Keeps healthy preview state across config changes; only failed renders are retried on a new revision. */
export class PreviewBoundary extends Component<
  { children: ReactNode; revision: string },
  { error: string | null; revision: string }
> {
  state = { error: null as string | null, revision: this.props.revision };

  static getDerivedStateFromProps(props: { revision: string }, state: { revision: string }) {
    return props.revision === state.revision ? null : { error: null, revision: props.revision };
  }

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error.message : String(error) };
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // React reports the original stack; the preview presents a recoverable, local error.
  }

  render() {
    if (this.state.error) {
      return (
        <Alert
          variant="destructive"
          title="Runtime error"
          description={`${this.state.error} Correct the code or configuration to recover.`}
        />
      );
    }
    return this.props.children;
  }
}
