import { resolve } from 'node:path';

/** Lets a regression run isolate generated evidence instead of overwriting historical reports. */
export function evidencePath(relativePath: string): string {
  return resolve(process.env.BUILDING_EVIDENCE_ROOT ?? 'test-results', relativePath);
}
