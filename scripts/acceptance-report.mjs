import { mkdir, readFile, writeFile } from 'node:fs/promises';

const rows = (text) =>
  text
    .split(/\r?\n/)
    .filter((line) => /^\| A\d{2} \|/.test(line))
    .map((line) =>
      line
        .split('|')
        .slice(1, -1)
        .map((cell) => cell.trim()),
    );
const [requirements, acceptance] = await Promise.all([
  readFile('docs/PRD-v0.3.md', 'utf8'),
  readFile('docs/ACCEPTANCE.md', 'utf8'),
]);
const original = rows(requirements),
  current = rows(acceptance);
const states = ['未实现', '已实现未验证', '验证通过', '验证失败', '环境阻塞', '需求待确认'];
const counts = Object.fromEntries(states.map((state) => [state, 0]));
if (original.length !== 42 || current.length !== 42) {
  throw new Error('Acceptance must retain all A01–A42');
}
for (let index = 0; index < 42; index++) {
  const expectedId = `A${String(index + 1).padStart(2, '0')}`;
  const required = original[index],
    actual = current[index];
  if (
    required[0] !== expectedId ||
    actual[0] !== expectedId ||
    required[1] !== actual[1] ||
    required[2] !== actual[2]
  ) {
    throw new Error(`${expectedId}: original scenario or passing condition changed`);
  }
  if (
    actual.length !== 7 ||
    !actual[3] ||
    !actual[4] ||
    !actual[6] ||
    !states.includes(actual[5])
  ) {
    throw new Error(`${expectedId}: missing code/evidence/scope or invalid state`);
  }
  counts[actual[5]]++;
}
const report = {
  measuredAt: new Date().toISOString(),
  originalConditionsUnchanged: true,
  count: 42,
  counts,
  platformRule:
    'Browser or Windows-only object conditions do not establish macOS/Tauri/installation acceptance',
  pendingProductDecision: 'Q5 supported OS versions, CPU architectures and reference hardware',
  remaining: current
    .filter((row) => row[5] !== '验证通过')
    .map(([id, scenario, , , , status, scope]) => ({ id, scenario, status, scope })),
};
await mkdir('.test-artifacts/acceptance', { recursive: true });
await writeFile('.test-artifacts/acceptance/status.json', JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ originalConditionsUnchanged: true, count: 42, counts }, null, 2));
