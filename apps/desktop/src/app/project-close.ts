import { guardPreferenceClose } from './preferences';

/** Only closes the exact immutable project snapshot approved before the final settings write. */
export async function guardProjectClose<T extends object>({
  flushPreferences,
  settlePreferences,
  getSnapshot,
  guard,
  onError,
}: {
  flushPreferences: () => Promise<void>;
  settlePreferences: () => Promise<void>;
  getSnapshot: () => T;
  guard: () => Promise<boolean>;
  onError: (error: unknown) => void;
}): Promise<boolean> {
  for (;;) {
    let approved: T | undefined;
    const allowed = await guardPreferenceClose(
      flushPreferences,
      async () => {
        const accepted = await guard();
        if (accepted) {
          approved = getSnapshot();
        }
        return accepted;
      },
      onError,
      settlePreferences,
    );
    if (!allowed) {
      return false;
    }
    if (getSnapshot() === approved) {
      return true;
    }
  }
}
