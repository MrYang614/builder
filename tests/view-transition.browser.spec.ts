import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import type { ProjectDocument } from '@building/editor-core';
import { buildPlanWallFootprints } from '@building/building-geometry';
import { choose } from './browser-controls';

type Phase = 'enter-fade' | 'enter-orbit' | 'exit-orbit' | 'exit-fade' | 'idle';
type Transition = { phase: Phase; progress: number; growth: number; scaleY: number };
type Probe = {
  __editor: {
    document(): ProjectDocument;
    history(): { undoCount: number; redoCount: number };
    project(point: { x: number; y: number; z: number }): { x: number; y: number };
    diagnostics(): {
      rendererId: string;
      camera: { position: number[]; target: number[] };
      viewTransition: Transition;
      pendingFrame: boolean;
    };
  };
};
type Frame = Transition & {
  time: number;
  scene: number;
  plan: number;
  alignment: number[];
  position: number[];
  target: number[];
  revision: number;
  undoCount: number;
  bounds: { x: number; y: number; width: number; height: number };
};
const scene = (page: Page) => page.locator('.viewport-stage > .viewport');
const plan = (page: Page) => page.locator('.viewport-stage > .plan-viewport');
const snapshot = (page: Page) =>
  page.evaluate(() => {
    const editor = (window as unknown as Probe).__editor;
    return {
      document: editor.document(),
      history: editor.history(),
      diagnostics: editor.diagnostics(),
    };
  });

/** Waits for the owner to release input, not merely for the first projection fade to finish. */
async function settle(page: Page) {
  await expect(page.locator('.viewport-stage')).toHaveAttribute('data-phase', 'idle');
  await expect(page.locator('.viewport-stage')).toHaveAttribute('aria-busy', 'false');
}

/** Samples the live runtime and SVG projection on RAF; never changes either animation clock. */
function recordJourney(page: Page) {
  return page.evaluate(
    async () =>
      new Promise<Frame[]>((resolve) => {
        const editor = (window as unknown as Probe).__editor;
        const scene = document.querySelector<HTMLElement>('.viewport-stage > .viewport')!;
        const plan = document.querySelector<HTMLElement>('.viewport-stage > .plan-viewport')!;
        const svg = document.querySelector<SVGSVGElement>('svg.plan-canvas')!;
        const wall = editor.document().walls[0];
        const elevation = editor
          .document()
          .levels.find((level) => level.id === wall.levelId)!.elevation;
        const frames: Frame[] = [];
        const deadline = performance.now() + 10000;
        let started: number | undefined;
        const tick = (now: number) => {
          const state = editor.diagnostics();
          const transition = state.viewTransition;
          if (transition.phase !== 'idle' || started !== undefined) {
            started ??= now;
            const rect = plan.getBoundingClientRect();
            frames.push({
              ...transition,
              time: now - started,
              scene: Number(getComputedStyle(scene).opacity),
              plan: Number(getComputedStyle(plan).opacity),
              alignment: [wall.start, wall.end].map((point) => {
                const local = svg.createSVGPoint();
                local.x = point.x;
                local.y = point.z;
                const expected = local.matrixTransform(svg.getScreenCTM()!);
                const actual = editor.project({ ...point, y: elevation });
                return Math.hypot(actual.x - expected.x, actual.y - expected.y);
              }),
              position: state.camera.position,
              target: state.camera.target,
              revision: editor.document().revision,
              undoCount: editor.history().undoCount,
              bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
            });
          }
          if ((started !== undefined && transition.phase === 'idle') || now > deadline) {
            resolve(frames);
          } else {
            requestAnimationFrame(tick);
          }
        };
        requestAnimationFrame(tick);
      }),
  );
}
function phaseOrder(frames: Frame[]) {
  return frames
    .map((frame) => frame.phase)
    .filter((phase, index, values) => phase !== values[index - 1]);
}
function assertFormalUnchanged(frames: Frame[], before: Awaited<ReturnType<typeof snapshot>>) {
  expect(
    frames.every(
      (frame) =>
        frame.revision === before.document.revision && frame.undoCount === before.history.undoCount,
    ),
  ).toBe(true);
  expect(
    frames.every((frame) => JSON.stringify(frame.bounds) === JSON.stringify(frames[0].bounds)),
  ).toBe(true);
}

/** Checks actual rendered footprint corners at full height after Fit floor, without changing zoom. */
async function assertFloorInView(page: Page, document: ProjectDocument) {
  const level = document.levels.find((item) => item.id === document.walls[0].levelId)!;
  const corners = buildPlanWallFootprints(document, level.id).flatMap((footprint) => {
    const wall = document.walls.find((item) => item.id === footprint.wallId)!;
    return footprint.polygon.flatMap((point) =>
      [level.elevation, level.elevation + wall.height].map((y) => ({ ...point, y })),
    );
  });
  const projected = await page.evaluate(
    (points) => points.map((point) => (window as unknown as Probe).__editor.project(point)),
    corners,
  );
  const bounds = (await scene(page).boundingBox())!;
  for (const point of projected) {
    expect(point.x).toBeGreaterThanOrEqual(bounds.x);
    expect(point.x).toBeLessThanOrEqual(bounds.x + bounds.width);
    expect(point.y).toBeGreaterThanOrEqual(bounds.y);
    expect(point.y).toBeLessThanOrEqual(bounds.y + bounds.height);
  }
}

// Use the supported minimum for temporal sampling under SwiftShader; visuals also cover 1600px.
test.use({ viewport: { width: 900, height: 600 } });
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await page.waitForFunction(() => !!(window as unknown as Probe).__editor);
  await page.getByRole('button', { name: '庭院样板', exact: true }).click();
  await page.getByRole('radio', { name: '2D 平面', exact: true }).click();
  await settle(page);
  await page.getByRole('button', { name: '适应当前层', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
});

test('reference journey aligns the plan, orbits and grows walls, then flattens before fading back', async ({
  page,
}, testInfo) => {
  const before = await snapshot(page);
  const canvas = await page.locator('.viewport canvas').elementHandle();
  const viewBox = await page.locator('svg.plan-canvas').getAttribute('viewBox');
  await expect(scene(page)).toHaveCSS('transition-duration', '0.45s, 0s');
  const entering = recordJourney(page);
  await page.getByRole('radio', { name: '3D 场景', exact: true }).click();
  const enterFrames = await entering;
  await testInfo.attach('enter-live-frames', {
    body: JSON.stringify(enterFrames),
    contentType: 'application/json',
  });
  expect(phaseOrder(enterFrames)).toEqual(['enter-fade', 'enter-orbit', 'idle']);
  const hold = enterFrames.filter((frame) => frame.phase === 'enter-fade');
  expect(hold.length).toBeGreaterThan(1);
  expect(hold.every((frame) => frame.growth === 0 && frame.scaleY <= 0.0011)).toBe(true);
  expect(hold.every((frame) => Math.max(...frame.alignment) < 1)).toBe(true);
  expect(
    hold.some((frame) => frame.scene > 0 && frame.scene < 1 && frame.plan > 0 && frame.plan < 1),
  ).toBe(true);
  const orbit = enterFrames.filter((frame) => frame.phase === 'enter-orbit');
  expect(orbit.some((frame) => frame.growth > 0.1 && frame.growth < 0.9)).toBe(true);
  expect(
    orbit.every((frame) =>
      frame.growth > 0.001
        ? Math.abs(frame.scaleY - frame.growth) < 0.00001
        : frame.scaleY > 0 && frame.scaleY <= 0.0011,
    ),
  ).toBe(true);
  expect(
    orbit.some(
      (frame) =>
        Math.hypot(frame.position[0] - frame.target[0], frame.position[2] - frame.target[2]) > 1,
    ),
  ).toBe(true);
  const final = enterFrames.at(-1)!;
  const offset = final.position.map((value, index) => value - final.target[index]);
  const radius = Math.hypot(...offset);
  const length = Math.hypot(0.3, 0.82, 0.49);
  [0.3, 0.82, 0.49].forEach((value, index) =>
    expect(offset[index] / radius).toBeCloseTo(value / length, 4),
  );
  expect(final.growth).toBe(1);
  assertFormalUnchanged(enterFrames, before);
  await settle(page);
  const exiting = recordJourney(page);
  await page.getByRole('radio', { name: '2D 平面', exact: true }).click();
  const exitFrames = await exiting;
  await testInfo.attach('exit-live-frames', {
    body: JSON.stringify(exitFrames),
    contentType: 'application/json',
  });
  expect(phaseOrder(exitFrames)).toEqual(['exit-orbit', 'exit-fade', 'idle']);
  const flatten = exitFrames.filter((frame) => frame.phase === 'exit-orbit');
  expect(flatten.some((frame) => frame.growth > 0.1 && frame.growth < 0.9)).toBe(true);
  expect(flatten.every((frame) => frame.plan === 0)).toBe(true);
  const fade = exitFrames.filter((frame) => frame.phase === 'exit-fade');
  expect(fade.every((frame) => frame.growth === 0 && frame.scaleY <= 0.0011)).toBe(true);
  expect(fade.every((frame) => Math.max(...frame.alignment) < 1)).toBe(true);
  expect(
    fade.some((frame) => frame.scene > 0 && frame.scene < 1 && frame.plan > 0 && frame.plan < 1),
  ).toBe(true);
  expect(exitFrames.at(-1)!.plan).toBeGreaterThan(0.95);
  assertFormalUnchanged(exitFrames, before);
  await settle(page);
  await expect(scene(page)).toHaveCSS('visibility', 'hidden');
  await expect(plan(page)).toHaveCSS('opacity', '1');
  await expect(page.locator('svg.plan-canvas')).toHaveAttribute('viewBox', viewBox!);
  const after = await snapshot(page);
  expect(after.document).toEqual(before.document);
  expect(after.history).toEqual(before.history);
  expect(after.diagnostics.rendererId).toBe(before.diagnostics.rendererId);
  expect(after.diagnostics.viewTransition.scaleY).toBe(1);
  expect(
    await canvas!.evaluate((element) => element === document.querySelector('.viewport canvas')),
  ).toBe(true);
});

test('busy journey rejects repeated switches and editing, then exports full-height geometry', async ({
  page,
}, testInfo) => {
  await page.getByRole('button', { name: '墙体 1', exact: true }).click();
  const before = await snapshot(page);
  const entering = recordJourney(page);
  await page.getByRole('radio', { name: '3D 场景', exact: true }).click();
  await expect(page.locator('.viewport-stage')).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('radio', { name: '2D 平面', exact: true })).toBeDisabled();
  await expect(scene(page)).toHaveAttribute('inert', '');
  await expect(plan(page)).toHaveAttribute('inert', '');
  expect(
    await page
      .locator('#inspector-panel input')
      .first()
      .evaluate((element) => {
        (element as HTMLInputElement).focus();
        return document.activeElement !== element;
      }),
  ).toBe(true);
  await page
    .getByRole('radio', { name: '2D 平面', exact: true })
    .evaluate((element) => (element as HTMLButtonElement).click());
  await page.keyboard.press('Delete');
  const frames = await entering;
  expect(phaseOrder(frames)).toEqual(['enter-fade', 'enter-orbit', 'idle']);
  await settle(page);
  await expect(page.getByRole('radio', { name: '3D 场景', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  expect((await snapshot(page)).document).toEqual(before.document);
  expect((await snapshot(page)).history).toEqual(before.history);
  await page.getByRole('radio', { name: '2D 平面', exact: true }).click();
  await settle(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出 GLB', exact: true }).click();
  const path = testInfo.outputPath('after-reference-transition.glb');
  await (await download).saveAs(path);
  const bytes = await readFile(path);
  const validator = await import('gltf-validator');
  expect(
    (await validator.validateBytes(bytes, { uri: 'after-reference-transition.glb' })).issues
      .numErrors,
  ).toBe(0);
  const json = JSON.parse(bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString()) as {
    nodes: { name?: string; mesh?: number; scale?: number[] }[];
    meshes: { primitives: { attributes: { POSITION: number } }[] }[];
    accessors: { max?: number[] }[];
    animations: unknown[];
  };
  const wall = before.document.walls[0];
  const node = json.nodes.find((item) => item.name === 'Surface_' + wall.id)!;
  const accessor = json.meshes[node.mesh!].primitives[0].attributes.POSITION;
  expect(json.accessors[accessor].max![1]).toBeCloseTo(wall.height, 5);
  expect(json.nodes.every((item) => !item.scale || item.scale[1] === 1)).toBe(true);
  expect(json.animations).toHaveLength(
    before.document.openings.filter((opening) => opening.kind === 'door').length * 2,
  );
});

test('reduced motion uses an 80ms fade without orbiting or flattening', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(scene(page)).toHaveCSS('transition-duration', '0.08s, 0s');
  const before = await snapshot(page);
  const entering = recordJourney(page);
  await page.getByRole('radio', { name: '3D 场景', exact: true }).click();
  const frames = await entering;
  expect(frames.length).toBeGreaterThan(0);
  expect(
    frames.some((frame) => frame.phase === 'enter-orbit' || frame.phase === 'exit-orbit'),
  ).toBe(false);
  expect(frames.every((frame) => frame.growth === 1 && frame.scaleY === 1)).toBe(true);
  await settle(page);
  await expect(plan(page)).toHaveCSS('visibility', 'hidden');
  expect((await snapshot(page)).document).toEqual(before.document);
  expect((await snapshot(page)).history).toEqual(before.history);
});

test('reduced-motion preference change cancels an active orbit and restores plan input', async ({
  page,
}, testInfo) => {
  const before = await snapshot(page);
  const viewBox = await page.locator('svg.plan-canvas').getAttribute('viewBox');
  await page.getByRole('radio', { name: '3D 场景', exact: true }).click();
  await page.waitForFunction(() => {
    const transition = (window as unknown as Probe).__editor.diagnostics().viewTransition;
    return transition.phase === 'enter-orbit' && transition.progress > 0.15;
  });
  const interrupted = (await snapshot(page)).diagnostics.viewTransition;
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await settle(page);
  await expect(page.getByRole('radio', { name: '2D 平面', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(page.getByRole('radio', { name: '3D 场景', exact: true })).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await expect(plan(page)).toHaveAttribute('data-active', 'true');
  await expect(plan(page)).toHaveAttribute('aria-hidden', 'false');
  await expect(plan(page)).not.toHaveAttribute('inert');
  await expect(plan(page)).toHaveCSS('opacity', '1');
  await expect(scene(page)).toHaveAttribute('data-active', 'false');
  await expect(scene(page)).toHaveAttribute('aria-hidden', 'true');
  await expect(scene(page)).toHaveAttribute('inert', '');
  await expect(scene(page)).toHaveCSS('visibility', 'hidden');
  const svg = page.locator('svg.plan-canvas');
  await expect(svg).toHaveAttribute('viewBox', viewBox!);
  await svg.focus();
  await expect(svg).toBeFocused();
  const after = await snapshot(page);
  expect(after.document).toEqual(before.document);
  expect(after.history).toEqual(before.history);
  expect(after.diagnostics.rendererId).toBe(before.diagnostics.rendererId);
  expect(after.diagnostics.viewTransition).toMatchObject({ phase: 'idle', growth: 1, scaleY: 1 });
  await testInfo.attach('preference-cancellation', {
    body: JSON.stringify({ interrupted, settled: after.diagnostics.viewTransition }),
    contentType: 'application/json',
  });
});

for (const language of ['zh-CN', 'en'] as const) {
  for (const theme of ['dark', 'light'] as const) {
    test(
      'reference transition visual frames in ' + language + '/' + theme,
      async ({ page }, testInfo) => {
        if (language === 'en') {
          await choose(page, '语言', 'English');
        }
        const labels =
          language === 'en'
            ? {
                appearance: 'Appearance',
                scene: '3D scene',
                plan: '2D plan',
                slab: 'Slab',
                purpose: 'Type',
                roof: 'Top cap',
                height: 'Cap top (m)',
                resize: 'Resize properties',
                fit: 'Fit floor',
              }
            : {
                appearance: '外观',
                scene: '3D 场景',
                plan: '2D 平面',
                slab: '楼板',
                purpose: '楼板用途',
                roof: '顶层封板',
                height: '封板上表面标高（m）',
                resize: '调整属性宽度',
                fit: '适应当前层',
              };
        await choose(page, labels.appearance, theme === 'dark' ? 'Dark' : 'Light');
        await page.getByRole('radio', { name: labels.slab, exact: true }).click();
        await choose(page, labels.purpose, labels.roof);
        await page.getByRole('separator', { name: labels.resize, exact: true }).press('Home');
        const before = await snapshot(page);
        for (const width of [1600, 900]) {
          await page.setViewportSize({ width, height: width === 900 ? 600 : 900 });
          await page.getByRole('button', { name: labels.fit, exact: true }).click();
          const bounds = await plan(page).boundingBox();
          await expect(page.getByLabel(labels.height, { exact: true })).toHaveCount(1);
          await expect(
            page.getByRole('combobox', { name: labels.purpose, exact: true }),
          ).toContainText(labels.roof);
          const suffix = language + '-' + theme + '-' + width + '.png';
          await page.screenshot({
            path: testInfo.outputPath('plan-' + suffix),
            animations: 'allow',
          });
          await page.getByRole('radio', { name: labels.scene, exact: true }).click();
          await page.waitForFunction(() => {
            const state = (window as unknown as Probe).__editor.diagnostics().viewTransition;
            return state.phase === 'enter-orbit' && state.progress >= 0.3;
          });
          const entering = (await snapshot(page)).diagnostics;
          await page.screenshot({
            path: testInfo.outputPath('growing-' + suffix),
            animations: 'allow',
          });
          await testInfo.attach('growing-state-' + width, {
            body: JSON.stringify(entering),
            contentType: 'application/json',
          });
          await settle(page);
          await expect(scene(page)).toHaveCSS('opacity', '1');
          expect(await scene(page).boundingBox()).toEqual(bounds);
          await assertFloorInView(page, before.document);
          await page.screenshot({
            path: testInfo.outputPath('scene-' + suffix),
            animations: 'allow',
          });
          await page.getByRole('radio', { name: labels.plan, exact: true }).click();
          await page.waitForFunction(() => {
            const state = (window as unknown as Probe).__editor.diagnostics().viewTransition;
            return state.phase === 'exit-fade';
          });
          const flattened = (await snapshot(page)).diagnostics;
          await page.screenshot({
            path: testInfo.outputPath('flat-fade-' + suffix),
            animations: 'allow',
          });
          await testInfo.attach('flat-fade-state-' + width, {
            body: JSON.stringify(flattened),
            contentType: 'application/json',
          });
          await settle(page);
          await expect(plan(page)).toHaveCSS('opacity', '1');
          expect(await plan(page).boundingBox()).toEqual(bounds);
          expect(
            await page.evaluate(() => ({
              width: document.documentElement.scrollWidth,
              height: document.documentElement.scrollHeight,
            })),
          ).toEqual({ width, height: width === 900 ? 600 : 900 });
          expect((await snapshot(page)).document).toEqual(before.document);
          expect((await snapshot(page)).history).toEqual(before.history);
          expect((await snapshot(page)).diagnostics.rendererId).toBe(before.diagnostics.rendererId);
        }
      },
    );
  }
}
