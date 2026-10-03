import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const json = async (file) => JSON.parse(await readFile(file, 'utf8'));
const [browser, acceptance, release, production, native] = await Promise.all([
  json('test-results/e2e-results.json'),
  json('docs/acceptance-status.json'),
  json('docs/release-artifacts.json'),
  json('docs/production-smoke.json'),
  json('tests/artifacts/native/results.json'),
]);
if (
  browser.stats.unexpected ||
  browser.stats.skipped ||
  browser.stats.flaky ||
  browser.stats.expected !== 33
) {
  throw new Error('Final browser suite is incomplete');
}
if (!acceptance.originalConditionsUnchanged || acceptance.count !== 42) {
  throw new Error('Original acceptance conditions must be preserved');
}
for (const artifact of [release.executable, release.installer]) {
  const bytes = await readFile(artifact.path);
  const hash = createHash('sha256').update(bytes).digest('hex').toUpperCase();
  if (bytes.length !== artifact.bytes || hash !== artifact.sha256) {
    throw new Error(`Artifact mismatch: ${artifact.path}`);
  }
}
const samples = await Promise.all(
  [
    'examples/two-storeys.building',
    'examples/two-storeys.glb',
    'examples/two-storeys-open-roof.building',
    'examples/two-storeys-open-roof.glb',
  ].map(async (path) => ({ path, bytes: (await stat(path)).size })),
);
const report = {
  measuredAt: new Date().toISOString(),
  scope:
    'Verified local delivery artifacts; platform and incomplete acceptance limitations remain explicit',
  browser: {
    ...browser.stats,
    report: 'test-results/e2e-results.json',
    source: 'actual final Playwright result',
  },
  production: production.results,
  release,
  samples,
  native: {
    passed: native.finalCases.filter((test) => test.status === '验证通过').length,
    recordedRetries: native.retries.length,
    scope:
      'Actual Windows debug Tauri/WebView2 before final runtime revisions; not final release regression',
    report: 'tests/artifacts/native/results.json',
  },
  acceptance: { count: acceptance.count, counts: acceptance.counts },
  observedCommands: [
    {
      command: 'npm test',
      result: '71/71 passed',
      source:
        'observed terminal output 2026-10-03 14:46 after Tooltip/Dialog changes; TEST-RESULTS.md',
    },
    {
      command: 'npm run test:rust',
      result: '14/14 passed',
      source: 'observed terminal output; Rust source unchanged since run',
    },
    {
      command: 'npx tsx tests/native-container.ts',
      result: 'passed',
      source: 'observed final TS/Rust container interoperability output',
    },
    {
      command: 'npm run check; strict workspace/core/geometry/node typechecks',
      result: 'passed',
      source: 'observed final terminal output',
    },
  ],
  limitations: acceptance.remaining,
};
await writeFile('docs/final-verification.json', JSON.stringify(report, null, 2) + '\n');
console.log(
  JSON.stringify(
    {
      browserPassed: browser.stats.expected,
      nativePassed: report.native.passed,
      artifactsMatchRecordedHashes: true,
      samples: samples.length,
      acceptance: report.acceptance,
    },
    null,
    2,
  ),
);
