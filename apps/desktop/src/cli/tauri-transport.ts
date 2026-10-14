import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen, type Event } from '@tauri-apps/api/event';
import type { Services } from '../app/services';
import { handleControlRequest } from './handler';
import type { ControlRequest } from './protocol';

/** Connects the one Tauri automation event channel to the shared TypeScript command handler. */
export async function startTauriControlBridge(services: Services): Promise<() => void> {
  if (!isTauri()) {
    return () => {};
  }
  let active = true;
  const unlisten = await listen<ControlRequest>(
    'control.request',
    (event: Event<ControlRequest>) => {
      if (!active) {
        return;
      }
      void services.commands
        .enqueue(() => handleControlRequest(event.payload, services))
        .then((response) => {
          if (active) {
            void invoke('control_respond', { response });
          }
        });
    },
  );
  try {
    await invoke('control_ready');
  } catch (error) {
    active = false;
    await unlisten();
    throw error;
  }
  return () => {
    active = false;
    unlisten();
  };
}
