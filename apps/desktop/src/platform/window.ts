import { isTauri } from '@tauri-apps/api/core';

export interface WindowControls {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  startDragging(): Promise<void>;
  subscribeMaximized(
    onChange: (maximized: boolean) => void,
    onError: (error: unknown) => void,
  ): Promise<() => void>;
}

/** Native operations remain at the platform boundary; browser previews have no window controls. */
export async function createWindowControls(): Promise<WindowControls | null> {
  if (!isTauri()) {
    return null;
  }
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  const window = getCurrentWindow();
  return {
    minimize: () => window.minimize(),
    toggleMaximize: () => window.toggleMaximize(),
    // close emits closeRequested, preserving the existing preference flush and project guard.
    close: () => window.close(),
    startDragging: () => window.startDragging(),
    async subscribeMaximized(onChange, onError) {
      let active = true;
      let revision = 0;
      let lastValue: boolean | undefined;
      const refresh = async () => {
        if (!active) {
          return;
        }
        const requestedRevision = ++revision;
        const maximized = await window.isMaximized();
        if (active && revision === requestedRevision && maximized !== lastValue) {
          lastValue = maximized;
          onChange(maximized);
        }
      };
      // Listen first so a maximize between registration and the initial query cannot be missed.
      const unlisten = await window.onResized(() => {
        void refresh().catch((error: unknown) => {
          if (active) {
            onError(error);
          }
        });
      });
      try {
        await refresh();
      } catch (error) {
        active = false;
        unlisten();
        throw error;
      }
      return () => {
        if (active) {
          active = false;
          unlisten();
        }
      };
    },
  };
}
