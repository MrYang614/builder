import { resolve } from 'node:path';

/** Keeps generated evidence local; an optional root isolates concurrent test runs. */
export function evidencePath(relativePath: string): string {
  return resolve(process.env.BUILDING_EVIDENCE_ROOT ?? '.test-artifacts', relativePath);
}
