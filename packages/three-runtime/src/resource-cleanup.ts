/** Releases every owned allocation before reporting failures; reentrant owners detach state first. */
export function runResourceCleanup(steps: Iterable<() => void>): void {
  const failures: unknown[] = [];
  for (const release of steps) {
    try {
      release();
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) {
    throw new AggregateError(failures, 'runtime.cleanupFailed');
  }
}

/** Preserves an existing construction/export failure while making rollback failures observable. */
export function cleanupAfterFailure(release: () => void): void {
  try {
    release();
  } catch (error) {
    console.warn('Resource cleanup failed after an earlier operation failure.', error);
  }
}
