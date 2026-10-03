# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: slab-floor.browser.spec.ts >> A11 actual cross-floor mouse selection, material, opening placement and snap ignore ghost objects
- Location: tests\slab-floor.browser.spec.ts:80:1

# Error details

```
Test timeout of 60000ms exceeded.
```

```
Error: locator.click: Test timeout of 60000ms exceeded.
Call log:
  - waiting for getByRole('button', { name: '楼板 1', exact: true })

```

# Page snapshot

```yaml
- main [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - strong [ref=e6]: 建筑编辑器
      - generic "未命名工程" [ref=e7]
      - generic [ref=e8]: 未保存修改
    - generic [ref=e9]:
      - button "新建" [ref=e10]
      - button "打开" [ref=e11]
      - button "保存" [ref=e12]
      - button "另存为" [ref=e13]
      - button "撤销" [ref=e14]
      - button "重做" [disabled]
      - button "导出 GLB" [ref=e15]
      - button "设置" [ref=e16]
  - navigation "选择" [ref=e17]:
    - radiogroup [ref=e18]:
      - radio "选择" [checked] [ref=e19]
      - radio "墙体" [ref=e20]
      - radio "楼板" [ref=e21]
      - radio "门" [ref=e22]
      - radio "窗" [ref=e23]
      - radio "材质" [ref=e24]
    - button "可编辑示例" [ref=e25]
    - generic [ref=e26]: 支持同厚直线、L 形和 T 形连接；十字交叉会被拒绝。
  - generic [ref=e27]:
    - complementary "楼层" [ref=e28]:
      - generic [ref=e29]:
        - heading "楼层" [level=2] [ref=e30]
        - button "新增楼层" [ref=e31]
      - button "1 0.00 m" [ref=e33]:
        - generic [ref=e34]: "1"
        - generic [ref=e35]: 0.00 m
      - generic [ref=e37]:
        - group [ref=e38]:
          - generic [ref=e39]: 名称
          - textbox "名称" [ref=e40]: "1"
        - group [ref=e41]:
          - generic [ref=e42]: 楼层基准标高（m）
          - textbox "楼层基准标高（m）" [ref=e43]: "0"
        - group [ref=e44]:
          - generic [ref=e45]: 层高（m）
          - textbox "层高（m）" [ref=e46]: "3"
        - paragraph [ref=e47]: 修改层高并移动上方楼层（墙高保持不变）
        - button "删除楼层" [disabled]
      - generic [ref=e48]:
        - heading "对象" [level=3] [ref=e49]
        - paragraph [ref=e50]: 4 个对象
        - button "墙体 1" [ref=e51]
        - button "楼板 2" [ref=e52]
        - button "门 3" [ref=e53]
        - button "窗 4" [ref=e54]
      - generic [ref=e55]: 工程 v1
    - generic [ref=e56]:
      - generic [ref=e57]:
        - generic [ref=e58]:
          - button "聚焦选中" [ref=e59]
          - button "查看当前层" [ref=e60]
          - button "查看整栋" [ref=e61]
          - button "俯视" [ref=e62]
        - radiogroup "编辑" [ref=e63]:
          - radio "编辑" [checked] [ref=e64]
          - radio "旋转" [ref=e65]
          - radio "平移" [ref=e66]
        - generic [ref=e67] [cursor=pointer]:
          - checkbox "整栋预览（只读）" [ref=e68]
          - text: 整栋预览（只读）
      - generic "建筑编辑器" [ref=e69]:
        - generic "三维编辑视口" [active] [ref=e70]
    - complementary "属性" [ref=e71]:
      - heading "属性" [level=2] [ref=e72]
      - generic [ref=e73]:
        - generic [ref=e74]:
          - text: 窗
          - button "删除" [ref=e75]
        - generic [ref=e77]:
          - group [ref=e78]:
            - generic [ref=e79]: 洞口距墙参考端（m）
            - textbox "洞口距墙参考端（m）" [ref=e80]: "2.6"
          - group [ref=e81]:
            - generic [ref=e82]: 洞口宽度（m）
            - textbox "洞口宽度（m）" [ref=e83]: "1.2"
          - group [ref=e84]:
            - generic [ref=e85]: 洞口高度（m）
            - textbox "洞口高度（m）" [ref=e86]: "1.1"
          - group [ref=e87]:
            - generic [ref=e88]: 窗台离地高度（m）
            - textbox "窗台离地高度（m）" [ref=e89]: "0.9"
        - generic [ref=e90]:
          - heading "材质" [level=3] [ref=e91]
          - generic [ref=e92]:
            - group [ref=e93]:
              - generic [ref=e94]: 表面
              - combobox "表面" [ref=e95]:
                - generic: A 面
            - group [ref=e96]:
              - generic [ref=e97]: 建筑材质颜色
              - textbox "建筑材质颜色" [ref=e98] [cursor=pointer]: "#b28a5e"
            - group [ref=e99]:
              - generic [ref=e100]: 图片
              - combobox "图片" [ref=e101]:
                - generic: 纯色
            - button "导入 PNG／JPEG" [ref=e102]
            - group [ref=e103]:
              - generic [ref=e104]: 平铺实际宽度（m）
              - textbox "平铺实际宽度（m）" [ref=e105]: "0.5"
            - group [ref=e106]:
              - generic [ref=e107]: 平铺实际高度（m）
              - textbox "平铺实际高度（m）" [ref=e108]: "0.5"
            - group [ref=e109]:
              - generic [ref=e110]: 纹理旋转（°）
              - textbox "纹理旋转（°）" [ref=e111]: "0"
            - group [ref=e112]:
              - generic [ref=e113]: 纹理 X 偏移（m）
              - textbox "纹理 X 偏移（m）" [ref=e114]: "0"
            - group [ref=e115]:
              - generic [ref=e116]: 纹理 Y 偏移（m）
              - textbox "纹理 Y 偏移（m）" [ref=e117]: "0"
            - button "恢复默认平铺" [ref=e118]
  - status [ref=e119]:
    - generic [ref=e120]: 点击终点。Esc 取消当前草稿。
    - generic [ref=e121]: 1 / 单位：米
```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test';
  2   | import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
  3   | import { readFile } from 'node:fs/promises';
  4   | import { resolve } from 'node:path';
  5   | import { validateBytes } from 'gltf-validator';
  6   | import type { ProjectDocument } from '@building/editor-core';
  7   | import type { ThreeRuntime } from '@building/three-runtime';
  8   | 
  9   | type Diagnostics = ReturnType<ThreeRuntime['diagnostics']>;
  10  | type Probe = { __editor: { document(): ProjectDocument; diagnostics(): Diagnostics; project(point: { x: number; y: number; z: number }): { x: number; y: number } } };
  11  | const documentOf = (page: Page) => page.evaluate(() => (window as unknown as Probe).__editor.document());
  12  | const diagnostics = (page: Page) => page.evaluate(() => (window as unknown as Probe).__editor.diagnostics());
  13  | async function idle(page: Page) { await page.waitForFunction(() => !(window as unknown as Probe).__editor.diagnostics().pendingFrame); }
  14  | async function point(page: Page, x: number, z: number, y = 0) { return page.evaluate(p => (window as unknown as Probe).__editor.project(p), { x, y, z }); }
  15  | async function clickWorld(page: Page, x: number, z: number, y = 0) { const p = await point(page, x, z, y); await page.mouse.click(p.x, p.y); }
  16  | async function choose(page: Page, label: string, option: string) { await page.getByRole('combobox', { name: label, exact: true }).click(); await page.getByRole('option', { name: option, exact: true }).click(); }
  17  | async function number(page: Page, label: string, value: string) { await page.getByLabel(label, { exact: true }).fill(value); await page.getByLabel(label, { exact: true }).press('Enter'); }
  18  | function evidence(name: string, details: unknown) {
  19  |   const path = 'tests/artifacts/slab-floor-validation.json'; mkdirSync('tests/artifacts', { recursive: true });
  20  |   const previous = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : { scope: 'Windows Chromium/SwiftShader browser UI and independent GLTFLoader. No Tauri/native GUI or macOS acceptance.', runs: [] };
  21  |   previous.runs.push({ name, status: 'passed', measuredAt: new Date().toISOString(), details }); writeFileSync(path, JSON.stringify(previous, null, 2));
  22  | }
  23  | test.beforeEach(async ({ page }) => { await page.goto('/'); await page.waitForFunction(() => !!(window as unknown as Probe).__editor); await expect(page.locator('canvas')).toHaveCount(1); });
  24  | 
  25  | test('A08 real thick slab UI assigns different top/bottom images and independently exports one closed solid', async ({ page }, testInfo) => {
  26  |   const pageErrors: string[] = []; page.on('pageerror', error => pageErrors.push(error.message));
  27  |   await page.getByRole('radio', { name: '楼板', exact: true }).click();
  28  |   await clickWorld(page, -2, -1.5); await clickWorld(page, 2, 1.5); await page.keyboard.press('Escape');
  29  |   await expect.poll(async () => (await documentOf(page)).slabs.length).toBe(1);
  30  |   await page.getByRole('button', { name: '楼板 1', exact: true }).click();
  31  |   await number(page, '厚度（m）', '.35'); await number(page, '上表面标高（m）', '1');
  32  |   await choose(page, '表面', '上表面（地板）'); await choose(page, '图片', '木地板');
  33  |   await choose(page, '表面', '下表面（天花板）'); await choose(page, '图片', '墙面');
  34  |   const doc = await documentOf(page), slab = doc.slabs[0]!;
  35  |   expect(slab.materials.top.resourceId).toBe('builtin_wood'); expect(slab.materials.bottom.resourceId).toBe('builtin_plaster'); expect(slab.materials.edge.resourceId).toBeUndefined();
  36  |   expect(doc.walls).toHaveLength(0); expect(doc.openings).toHaveLength(0);
  37  |   const wait = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 GLB', exact: true }).click();
  38  |   const download = await wait, file = resolve(testInfo.outputDir, 'actual-thick-slab.glb'); await download.saveAs(file); const bytes = await readFile(file);
  39  |   const validator = await validateBytes(bytes, { uri: 'actual-thick-slab.glb' }); expect(validator.issues.numErrors).toBe(0); expect(validator.issues.numWarnings).toBe(0);
  40  |   const loader = `/@fs/${resolve('node_modules/three/examples/jsm/loaders/GLTFLoader.js').replaceAll('\\', '/')}`;
  41  |   const loaded = await page.evaluate(async ({ loader, bytes, slabId }) => {
  42  |     const url = performance.getEntriesByType('resource').map(entry => entry.name).find(name => /\/three\.js(?:\?|$)/.test(name));
  43  |     const THREE = await import(url!), { GLTFLoader } = await import(loader);
  44  |     const result = await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer, ''); result.scene.updateMatrixWorld(true);
  45  |     const entities: string[] = []; result.scene.traverse((object: { name: string }) => { if (object.name.startsWith('Slab_')) entities.push(object.name); });
  46  |     const root = result.scene.getObjectByName(`Slab_${slabId}`); if (!root) throw new Error('Slab entity missing from independently loaded file');
  47  |     const triangles: { positions: number[][]; role: string; image: string | null }[] = [], materials: Record<string, { name: string; image: string | null }> = {};
  48  |     let primitiveCount = 0;
  49  |     root.traverse((object: any) => {
  50  |       if (!object.isMesh) return; primitiveCount++;
  51  |       const geometry = object.geometry, index = geometry.getIndex(), positions = geometry.getAttribute('position');
  52  |       const count = index?.count ?? positions.count;
  53  |       for (let i = 0; i < count; i += 3) {
  54  |         const group = geometry.groups.find((group: { start: number; count: number }) => i >= group.start && i < group.start + group.count);
  55  |         const material = Array.isArray(object.material) ? object.material[group?.materialIndex ?? 0] : object.material;
  56  |         const vertices = [0, 1, 2].map(n => new THREE.Vector3().fromBufferAttribute(positions, index ? index.getX(i + n) : i + n).applyMatrix4(object.matrixWorld));
  57  |         const normal = vertices[1].clone().sub(vertices[0]).cross(vertices[2].clone().sub(vertices[0])).normalize();
  58  |         const role = normal.y > .9 ? 'top' : normal.y < -.9 ? 'bottom' : 'edge';
  59  |         const image = material.map ? material.name : null;
  60  |         triangles.push({ positions: vertices.map(vertex => vertex.toArray()), role, image }); materials[role] = { name: material.name, image };
  61  |       }
  62  |     });
  63  |     let volume = 0; const edges = new Map<string, number>(), areas = { top: 0, bottom: 0, edge: 0 };
  64  |     for (const triangle of triangles) {
  65  |       const [a, b, c] = triangle.positions.map(p => new THREE.Vector3(...p)); volume += a.dot(b.clone().cross(c)) / 6;
  66  |       areas[triangle.role as keyof typeof areas] += b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
  67  |       for (const [left, right] of [[a, b], [b, c], [c, a]]) { const pair = [left, right].map(v => v.toArray().map((n: number) => n.toFixed(5)).join(',')).sort().join('|'); edges.set(pair, (edges.get(pair) ?? 0) + 1); }
  68  |     }
  69  |     const bounds = new THREE.Box3().setFromObject(root);
  70  |     return { entities, primitiveCount, triangleCount: triangles.length, materials, areas, volume: Math.abs(volume), closedEdgeCounts: [...new Set(edges.values())], bounds: { min: bounds.min.toArray(), max: bounds.max.toArray() }, animations: result.animations.length };
  71  |   }, { loader, bytes: [...bytes], slabId: slab.id });
  72  |   expect(loaded.entities).toEqual([`Slab_${slab.id}`]); expect(loaded.triangleCount).toBe(12); expect(loaded.closedEdgeCounts).toEqual([2]);
  73  |   expect(loaded.materials.top.image).toBe('Image_builtin_wood'); expect(loaded.materials.bottom.image).toBe('Image_builtin_plaster'); expect(loaded.materials.edge.image).toBeNull();
  74  |   expect(loaded.bounds.max[1]).toBeCloseTo(1, 6); expect(loaded.bounds.min[1]).toBeCloseTo(.65, 6); expect(loaded.volume).toBeCloseTo(4 * 3 * .35, 5);
  75  |   expect(loaded.areas.top).toBeCloseTo(12, 5); expect(loaded.areas.bottom).toBeCloseTo(12, 5); expect(loaded.animations).toBe(0);
  76  |   expect(await documentOf(page)).toEqual(doc); expect(pageErrors).toEqual([]);
  77  |   evidence('A08', { actualMouseCreation: true, uiIndependentMaterialAssignment: true, exportedFile: file, validator: { errors: validator.issues.numErrors, warnings: validator.issues.numWarnings }, independentLoad: loaded, pageErrors });
  78  | });
  79  | 
  80  | test('A11 actual cross-floor mouse selection, material, opening placement and snap ignore ghost objects', async ({ page }) => {
  81  |   const pageErrors: string[] = []; page.on('pageerror', error => pageErrors.push(error.message));
  82  |   // Read-only observation of actual render inputs; no session/document mutations or synthetic pointer dispatch.
  83  |   await page.evaluate(async () => {
  84  |     const url = performance.getEntriesByType('resource').map(entry => entry.name).find(name => /\/three\.js(?:\?|$)/.test(name)), THREE = await import(url!);
  85  |     const original = THREE.Scene.prototype.onBeforeRender;
  86  |     THREE.Scene.prototype.onBeforeRender = function (this: any, ...args: any[]) {
  87  |       const records: { id: string; opacity: number; transparent: boolean }[] = [];
  88  |       this.traverse((object: any) => { if (!object.isMesh || !object.userData.objectId) return; for (const material of Array.isArray(object.material) ? object.material : [object.material]) records.push({ id: object.userData.objectId, opacity: material.opacity, transparent: material.transparent }); });
  89  |       Object.assign(window, { __renderedMaterials: records }); return original.apply(this, args);
  90  |     };
  91  |   });
  92  |   await page.getByRole('radio', { name: '墙体', exact: true }).click(); await clickWorld(page, -3, -1.2); await clickWorld(page, 1, -1.2); await page.keyboard.press('Escape');
  93  |   await page.getByRole('button', { name: '墙体 1', exact: true }).click(); await number(page, '起点 X（m）', '-3.04'); await number(page, '起点 Z（m）', '-1.24');
  94  |   await page.getByRole('button', { name: '俯视', exact: true }).click(); await idle(page);
  95  |   await page.getByRole('radio', { name: '门', exact: true }).click(); await clickWorld(page, -2.19, -1.24, 2.8);
  96  |   await page.getByRole('radio', { name: '窗', exact: true }).click(); await clickWorld(page, .16, -1.24, 2.8);
  97  |   await expect.poll(async () => (await documentOf(page)).openings.length).toBe(2);
  98  |   await page.getByRole('radio', { name: '楼板', exact: true }).click(); await clickWorld(page, -3, -2); await clickWorld(page, 1, 0); await page.keyboard.press('Escape');
> 99  |   await page.getByRole('button', { name: '楼板 1', exact: true }).click(); await number(page, '位置 X（m）', '-3.04'); await number(page, '位置 Z（m）', '-2.04');
      |                                                                 ^ Error: locator.click: Test timeout of 60000ms exceeded.
  100 |   const lower = await documentOf(page); expect(lower.slabs).toHaveLength(1);
  101 |   await page.getByRole('button', { name: '新增楼层', exact: true }).click(); await page.getByRole('button', { name: '查看整栋', exact: true }).click(); await idle(page);
  102 |   const before = await documentOf(page), ghostIds = [...before.walls, ...before.slabs, ...before.openings].map(object => object.id);
  103 |   const ghostDisplay = await page.evaluate(() => (window as unknown as { __renderedMaterials: { id: string; opacity: number; transparent: boolean }[] }).__renderedMaterials);
  104 |   for (const id of ghostIds) { const records = ghostDisplay.filter(record => record.id === id); expect(records.length).toBeGreaterThan(0); expect(records.every(record => record.opacity === .25 && record.transparent)).toBe(true); }
  105 |   const ghostTargets = [{ name: 'wall', x: -1, z: -1.14, y: 1.2 }, { name: 'slab', x: 0, z: -.4, y: 0 }, { name: 'door', x: -2.19, z: -1.215, y: 1 }, { name: 'window', x: .16, z: -1.24, y: 1.5 }];
  106 |   for (const target of ghostTargets) {
  107 |     await page.getByRole('radio', { name: '选择', exact: true }).click(); await clickWorld(page, target.x, target.z, target.y);
  108 |     await expect(page.locator('.inspector-content')).toHaveCount(0); expect(await documentOf(page)).toEqual(before);
  109 |     await page.getByRole('radio', { name: '材质', exact: true }).click(); await clickWorld(page, target.x, target.z, target.y);
  110 |     await expect(page.getByRole('combobox', { name: '图片', exact: true })).toHaveCount(0); expect(await documentOf(page)).toEqual(before);
  111 |   }
  112 |   for (const tool of ['门', '窗']) {
  113 |     await page.getByRole('radio', { name: tool, exact: true }).click(); const p = await point(page, -1, -1.14, 1.2); await page.mouse.move(p.x, p.y);
  114 |     expect((await diagnostics(page)).preview.visible).toBe(false); await page.mouse.click(p.x, p.y); expect(await documentOf(page)).toEqual(before);
  115 |   }
  116 |   // The lower wall endpoint is off-grid. A real click close to it on the active y=3 plane
  117 |   // must round to the grid rather than snap to the ghost endpoint.
  118 |   await page.getByRole('radio', { name: '墙体', exact: true }).click(); await clickWorld(page, .93, -1.22, 3); await clickWorld(page, 2.9, -1.2, 3); await page.keyboard.press('Escape');
  119 |   const after = await documentOf(page), upper = after.walls.find(wall => wall.levelId !== before.levels[0]!.id)!;
  120 |   expect(upper).toBeDefined(); expect(upper.start.x).toBeCloseTo(.9, 6); expect(upper.start.z).toBeCloseTo(-1.2, 6); expect(after.openings).toEqual(before.openings); expect(after.slabs).toEqual(before.slabs);
  121 |   await page.getByRole('radio', { name: '墙体', exact: true }).click(); await clickWorld(page, -3.03, -2.02, 3); await clickWorld(page, -1, -2, 3); await page.keyboard.press('Escape');
  122 |   const withSecondWall = await documentOf(page), fromSlabCorner = withSecondWall.walls.at(-1)!;
  123 |   expect(fromSlabCorner.start.x).toBeCloseTo(-3, 6); expect(fromSlabCorner.start.z).toBeCloseTo(-2, 6);
  124 |   // Positive controls prove active-layer geometry is selectable and can host openings.
  125 |   await page.getByRole('radio', { name: '选择', exact: true }).click(); await clickWorld(page, 1.8, -1.2, 5.8); await expect(page.locator('.inspector-content')).toHaveCount(1);
  126 |   await page.getByRole('radio', { name: '门', exact: true }).click(); await clickWorld(page, 1.8, -1.2, 5.8);
  127 |   await expect.poll(async () => (await documentOf(page)).openings.length).toBe(before.openings.length + 1);
  128 |   const final = await documentOf(page); expect(final.openings.at(-1)!.wallId).toBe(upper.id); expect(final.walls.find(wall => wall.id === before.walls[0]!.id)).toEqual(before.walls[0]);
  129 |   await idle(page); const currentDisplay = await page.evaluate(() => (window as unknown as { __renderedMaterials: { id: string; opacity: number; transparent: boolean }[] }).__renderedMaterials);
  130 |   const activeWallMaterials=currentDisplay.filter(record=>record.id===upper.id);expect(activeWallMaterials.length).toBeGreaterThan(0);expect(activeWallMaterials.every(record=>record.opacity===1&&!record.transparent)).toBe(true);expect(pageErrors).toEqual([]);
  131 |   evidence('A11', { realPointerTargets: ghostTargets, ghostObjects: ghostIds, ghostDisplay, selectionAndMaterialExcluded: true, ghostDoorAndWindowPlacementExcluded: true, offGridGhostEndpoint: before.walls[0]!.end, actualCurrentFloorWallStart: upper.start, offGridGhostSlabCorner: before.slabs[0]!.polygon[0], actualCurrentFloorWallFromSlabCorner: fromSlabCorner.start, activeLayerSelectionAndPlacementPositiveControl: true, activeWallMaterials, pageErrors });
  132 | });
  133 | 
```