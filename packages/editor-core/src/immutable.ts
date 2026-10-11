import type { ProjectDocument } from './model';

const frozenValues = new WeakSet<object>();
/** Deep-freezes owned snapshots while skipping descendants already frozen by this owner. */
export function freezeDocument<T>(value: T): T {
  if (value && typeof value === 'object' && !frozenValues.has(value)) {
    for (const member of Object.values(value)) {
      freezeDocument(member);
    }
    Object.freeze(value);
    frozenValues.add(value);
  }
  return value;
}
/** Isolates JSON domain inputs; immutable resources already in the document retain their references. */
export function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
/** Detects semantic no-ops while avoiding serialization of shared embedded resource strings. */
export function equivalentDocuments(a: ProjectDocument, b: ProjectDocument): boolean {
  if (a.id !== b.id || a.schemaVersion !== b.schemaVersion || a.name !== b.name) {
    return false;
  }
  if (
    a.environment !== b.environment &&
    JSON.stringify(a.environment) !== JSON.stringify(b.environment)
  ) {
    return false;
  }
  if (
    a.environmentResources !== b.environmentResources &&
    JSON.stringify(a.environmentResources) !== JSON.stringify(b.environmentResources)
  ) {
    return false;
  }
  for (const key of ['levels', 'walls', 'slabs', 'openings', 'resources', 'continuity'] as const) {
    const before = a[key],
      after = b[key];
    if (before === after) {
      continue;
    }
    if (before.length !== after.length) {
      return false;
    }
    for (let i = 0; i < before.length; i += 1) {
      // Shared immutable image resources and unchanged objects are never serialized on a pointer commit.
      if (before[i] !== after[i] && JSON.stringify(before[i]) !== JSON.stringify(after[i])) {
        return false;
      }
    }
  }
  return true;
}
