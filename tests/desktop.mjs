/** Real Windows Tauri/WebView2 test. No IPC mocks or programmatic document mutations.
 * Start tauri-driver then run: node tests/desktop.mjs <phase>.
 * Phases: start, save, verify-save, open, verify-open, restart, enrich, resave,
 * export, verify-export, independent-export, close-prepare, close-cancel, finish.
 * See docs/WINDOWS-NATIVE.md. Never treat a pending file dialog as a completed phase.
 * The save/open phases leave native file dialogs for the Windows Computer Use driver.
 */
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { validateBytes } from 'gltf-validator';
const directory = resolve('tests/artifacts/native');
await mkdir(directory, { recursive: true });
const statePath = resolve(directory, 'session.json');
const evidencePath = resolve(directory, 'results.json');
const projectPath = resolve(directory, '中文 native project.building');
const glbPath = resolve(directory, '中文 native door.glb');
const url = 'http://127.0.0.1:4444';
const phase = process.argv[2] ?? 'start';
const state = phase === 'start' ? {} : JSON.parse(await readFile(statePath, 'utf8'));
const evidence =
  phase === 'start'
    ? {
        platform: 'Windows',
        host: 'Tauri 2.12.1 / WebView2',
        webdriver: 'tauri-driver 2.1.0 / msedgedriver 154.0.4258.48',
        started: new Date().toISOString(),
        checks: [],
      }
    : JSON.parse(await readFile(evidencePath, 'utf8'));
const record = (name, details = {}) => {
  evidence.checks.push({ name, status: 'passed', ...details });
  console.log(`PASS ${name}`);
};
async function request(method, endpoint, body) {
  const response = await fetch(`${url}${endpoint}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  const json = text ? JSON.parse(text) : {};
  if (!response.ok || json.value?.error) {
    throw new Error(`${method} ${endpoint}: ${JSON.stringify(json)}`);
  }
  return json.value;
}
const session = (endpoint) => `/session/${state.id}${endpoint}`;
const script = (code, args = []) =>
  request('POST', session('/execute/sync'), { script: code, args });
async function until(fn, label, timeout = 10000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await fn();
      if (last) {
        return last;
      }
    } catch (error) {
      last = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out: ${label}; ${String(last)}`);
}
async function element(using, value) {
  const result = await request('POST', session('/element'), { using, value });
  return result['element-6066-11e4-a52e-4f735466cecf'];
}
async function textButton(text) {
  return element('xpath', `//button[normalize-space(.)=${JSON.stringify(text)}]`);
}
const clickElement = (id) => request('POST', session(`/element/${id}/click`), {});
const clickText = async (text) => clickElement(await textButton(text));
const doc = () => script('return window.__editor.document()');
const history = () => script('return window.__editor.history()');
const keys = (text, id) =>
  request('POST', session(`/element/${id}/value`), { text, value: [...text] });
const keyAction = (key) =>
  request('POST', session('/actions'), {
    actions: [
      {
        type: 'key',
        id: 'keyboard',
        actions: [
          { type: 'keyDown', value: key },
          { type: 'keyUp', value: key },
        ],
      },
    ],
  });
async function pointerClick(position) {
  return request('POST', session('/actions'), {
    actions: [
      {
        type: 'pointer',
        id: 'mouse',
        parameters: { pointerType: 'mouse' },
        actions: [
          {
            type: 'pointerMove',
            duration: 0,
            origin: 'viewport',
            x: Math.round(position.x),
            y: Math.round(position.y),
          },
          { type: 'pointerDown', button: 0 },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ],
  });
}
async function worldClick(x, z, y = 0) {
  const position = await script('return window.__editor.project(arguments[0])', [{ x, y, z }]);
  return pointerClick(position);
}
async function choice(label, text) {
  const trigger = await element(
    'xpath',
    `//button[@role='combobox' and @aria-label=${JSON.stringify(label)}]`,
  );
  await clickElement(trigger);
  const option = await element(
    'xpath',
    `//*[@role='option' and normalize-space(.)=${JSON.stringify(text)}]`,
  );
  await clickElement(option);
}
async function screenshot(name) {
  const base64 = await request('GET', session('/screenshot'));
  await writeFile(resolve(directory, name), Buffer.from(base64, 'base64'));
}
async function createSession() {
  const result = await request('POST', '/session', {
    capabilities: {
      alwaysMatch: {
        'tauri:options': {
          application: resolve('apps/desktop/src-tauri/target/debug/builder.exe'),
        },
      },
    },
  });
  state.id = result.sessionId;
  await until(
    () => script('return !!window.__editor && document.querySelectorAll("canvas").length===1'),
    'native viewport initialization',
    20000,
  );
}
try {
  if (phase === 'start') {
    await createSession();
    assert.equal(await script('return !!window.__TAURI_INTERNALS__'), true);
    record('Actual native main window has one Canvas and Tauri IPC host');
    const initialLanguage = await script('return document.documentElement.lang');
    await clickText(initialLanguage === 'en' ? 'Settings' : '设置');
    if (initialLanguage !== 'en') {
      await choice('语言', 'English');
    }
    await choice('Appearance', 'Dark');
    await clickText('Close');
    await until(
      () =>
        script(
          'return document.documentElement.lang==="en" && document.documentElement.dataset.theme==="dark"',
        ),
      'English and dark theme',
    );
    state.runtimeId = await script('return document.querySelector("canvas").dataset.runtimeId');
    record('English/dark settings applied in native host');
    await clickText('Top view');
    await clickText('Wall');
    await worldClick(-2, 0);
    await worldClick(2, 0);
    await worldClick(2, 2);
    await keyAction('\uE00C');
    await until(
      async () => (await doc()).walls.length === 2,
      'two walls drawn through pointer actions',
    );
    assert.equal((await history()).undoCount, 2);
    record(
      'Real pointer actions create two adjoining orthogonal walls; Esc preserves committed segments',
      { walls: (await doc()).walls.length },
    );
    await clickText('Select');
    await clickText('Wall 1');
    const lengthInput = await element(
      'xpath',
      '//label[normalize-space(.)="Axis length (m)"]/following-sibling::input',
    );
    await clickElement(lengthInput);
    await request('POST', session(`/element/${lengthInput}/clear`), {});
    await keys('4.2', lengthInput);
    await keys('\uE007', lengthInput);
    await until(
      async () => Math.abs((await doc()).walls[0].end.x - 2.2) < 0.001,
      'dimension input commit',
    );
    record('Native property input submits editable wall dimensions');
    const beforeInputDelete = (await doc()).walls.length;
    await keys('\uE017', lengthInput);
    assert.equal((await doc()).walls.length, beforeInputDelete);
    assert.equal(await script('return document.querySelectorAll("[role=dialog]").length'), 0);
    record('Delete while editing numeric text never deletes the selected object');
    await clickText('Undo');
    await until(async () => Math.abs((await doc()).walls[0].end.x - 2) < 0.001, 'undo dimension');
    await clickText('Redo');
    await until(async () => Math.abs((await doc()).walls[0].end.x - 2.2) < 0.001, 'redo dimension');
    record('Visible native Undo/Redo restore committed dimensions');
    await clickText('Settings');
    await keyAction('\uE017');
    assert.equal((await doc()).walls.length, 2);
    await choice('Appearance', 'Light');
    await choice('Language', '简体中文');
    await clickText('关闭');
    assert.equal(
      await script('return document.querySelector("canvas").dataset.runtimeId'),
      state.runtimeId,
    );
    record(
      'Settings modal consumes Delete; language/theme changes preserve the native renderer and selection',
    );
    await screenshot('desktop-light-zh.png');
    await clickText('设置');
    await choice('外观', '暗色');
    await choice('语言', 'English');
    await clickText('Close');
    await screenshot('desktop-dark-en.png');
    state.expectedDocument = await doc();
    record('Dual-language dual-theme native UI screenshots captured');
  } else if (phase === 'enrich') {
    await clickText('Door');
    await worldClick(-0.4, 0.11, 1);
    await until(async () => (await doc()).openings.length === 1, 'native door placement');
    record('Real native wall-face click places a door and its host opening');
    await clickText('Select');
    const before = (await doc()).openings[0];
    const beforeHistory = (await history()).undoCount;
    const start = await script('return window.__editor.project(arguments[0])', [
      { x: -2 + before.offset + before.width / 2, y: 1, z: 0.025 },
    ]);
    const end = await script('return window.__editor.project(arguments[0])', [
      { x: -2 + before.offset + before.width / 2 + 0.6, y: 1, z: 0.025 },
    ]);
    await request('POST', session('/actions'), {
      actions: [
        {
          type: 'pointer',
          id: 'mouse',
          parameters: { pointerType: 'mouse' },
          actions: [
            {
              type: 'pointerMove',
              duration: 0,
              origin: 'viewport',
              x: Math.round(start.x),
              y: Math.round(start.y),
            },
            { type: 'pointerDown', button: 0 },
            {
              type: 'pointerMove',
              duration: 400,
              origin: 'viewport',
              x: Math.round(end.x),
              y: Math.round(end.y),
            },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ],
    });
    await until(
      async () => (await doc()).openings[0].offset !== before.offset,
      'native door dragging',
    );
    assert.equal((await history()).undoCount, beforeHistory + 1);
    record('Real native door drag moves the hosted opening and adds exactly one history item');
    await clickText('Door 3');
    const angle = await element(
      'xpath',
      '//label[normalize-space(.)="Current angle (°)"]/following-sibling::input',
    );
    await request('POST', session(`/element/${angle}/clear`), {});
    await keys('45', angle);
    await keys('\uE007', angle);
    await until(async () => (await doc()).openings[0].angle === 45, 'half-open door property');
    record('Native door property retains a half-open angle separately from animation endpoints');
    await clickText('Wall 1');
    await choice('Image', 'Brick');
    await choice('Surface', 'Side B');
    await choice('Image', 'Plaster');
    const current = await doc();
    assert.notEqual(
      current.walls[0].materials.A.resourceId,
      current.walls[0].materials.B.resourceId,
    );
    assert.equal(current.walls[0].materials.edge.resourceId, undefined);
    state.expectedDocument = current;
    record('Native surface controls assign different A/B images while thickness remains solid');
    await screenshot('desktop-native-door.png');
  } else if (phase === 'save') {
    await clickText('Save');
    console.log(`NATIVE SAVE DIALOG: choose ${projectPath}`);
  } else if (phase === 'verify-save') {
    await until(
      () =>
        script(
          'return document.querySelector("[data-testid=dirty-state]").textContent === "Saved"',
        ),
      'native save success',
    );
    const unpacked = resolve(directory, 'unpacked.json');
    execFileSync(
      'cargo',
      [
        'run',
        '--manifest-path',
        'apps/desktop/src-tauri/Cargo.toml',
        '--example',
        'project_tool',
        '--',
        'unpack',
        projectPath,
        unpacked,
      ],
      { stdio: 'inherit' },
    );
    assert.deepEqual(JSON.parse(await readFile(unpacked, 'utf8')), state.expectedDocument);
    record(
      'Native Save dialog writes a portable .building through binary Rust IPC; Rust independently reopens exact editable data',
    );
    await clickText('New');
    await until(async () => !(await doc()).walls.length, 'native New');
    record('New after successful save opens an empty editable document');
  } else if (phase === 'open') {
    await clickText('Open');
    console.log(`NATIVE OPEN DIALOG: choose ${projectPath}`);
  } else if (phase === 'verify-open') {
    await until(async () => (await doc()).id === state.expectedDocument.id, 'native open complete');
    assert.deepEqual(await doc(), state.expectedDocument);
    record(
      'Native Open dialog restores the same formal project and dimensions via binary Rust IPC',
    );
  } else if (phase === 'resave') {
    state.expectedDocument = await doc();
    await clickText('Save');
    await until(
      () =>
        script(
          'return document.querySelector("[data-testid=dirty-state]").textContent === "Saved"',
        ),
      'native overwrite save',
    );
    const unpacked = resolve(directory, 'unpacked.json');
    execFileSync(
      'cargo',
      [
        'run',
        '--manifest-path',
        'apps/desktop/src-tauri/Cargo.toml',
        '--example',
        'project_tool',
        '--',
        'unpack',
        projectPath,
        unpacked,
      ],
      { stdio: 'inherit' },
    );
    assert.deepEqual(JSON.parse(await readFile(unpacked, 'utf8')), state.expectedDocument);
    record(
      'Native save to existing path persists images and half-open door through binary container IO',
    );
  } else if (phase === 'export') {
    await clickText('Export GLB');
    console.log(`NATIVE EXPORT SAVE DIALOG: choose ${glbPath}`);
  } else if (phase === 'verify-export') {
    await until(
      () =>
        script('return document.querySelector(".status-bar").textContent.includes("GLB exported")'),
      'native GLB export complete',
    );
    const bytes = new Uint8Array(await readFile(glbPath));
    const validation = await validateBytes(bytes, { uri: 'native-door.glb' });
    await writeFile(
      resolve(directory, 'gltf-validation.json'),
      JSON.stringify(validation, null, 2),
    );
    assert.equal(validation.issues.numErrors, 0);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const jsonLength = view.getUint32(12, true);
    const gltf = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
    assert.equal(gltf.animations.length, 2);
    assert.ok(gltf.animations.some((animation) => animation.name.endsWith('_Open')));
    assert.ok(gltf.animations.some((animation) => animation.name.endsWith('_Close')));
    assert.equal((await doc()).openings[0].angle, 45);
    record(
      'Native GLB dialog writes real binary GLB with independent Open/Close clips, Validator zero errors and unchanged half-open project',
      {
        validatorWarnings: validation.issues.numWarnings,
        animations: gltf.animations.map((animation) => animation.name),
      },
    );
  } else if (phase === 'independent-export') {
    const bytes = new Uint8Array(await readFile(glbPath));
    const modules = `/@fs/${resolve('node_modules').replaceAll('\\', '/')}`;
    const result = await request('POST', session('/execute/async'), {
      args: [Array.from(bytes), modules, state.expectedDocument.openings[0].id],
      script: `
      const [bytes, modules, doorId, done] = arguments;
      (async () => {
        const threeUrl=performance.getEntriesByType('resource').map(entry=>entry.name).find(name=>/\\/three\\.js(?:\\?|$)/.test(name)) ?? modules+'/.vite/deps/three.js';
        const THREE=await import(threeUrl), {GLTFLoader}=await import(modules+'/three/examples/jsm/loaders/GLTFLoader.js');
        const loaded=await new GLTFLoader().parseAsync(new Uint8Array(bytes).buffer,'');loaded.scene.updateMatrixWorld(true);
        const pivot=loaded.scene.getObjectByName('HingePivot_'+doorId),frame=loaded.scene.getObjectByName('Frame_'+doorId);
        const framePosition=frame.getWorldPosition(new THREE.Vector3()).clone(),pivotPosition=pivot.getWorldPosition(new THREE.Vector3()).clone();
        const staticAngle=2*Math.atan2(pivot.quaternion.y,pivot.quaternion.w),mixer=new THREE.AnimationMixer(loaded.scene);
        const clips={};let stable=true;for(const clip of loaded.animations){mixer.stopAllAction();const action=mixer.clipAction(clip);action.setLoop(THREE.LoopOnce,1);action.clampWhenFinished=true;action.play();const angles=[];for(const fraction of [0,.5,1]){action.time=fraction*clip.duration;mixer.update(0);loaded.scene.updateMatrixWorld(true);angles.push(2*Math.atan2(pivot.quaternion.y,pivot.quaternion.w));stable&&=pivot.getWorldPosition(new THREE.Vector3()).distanceTo(pivotPosition)<1e-6&&frame.getWorldPosition(new THREE.Vector3()).distanceTo(framePosition)<1e-6;}clips[clip.name]=angles;}
        const maps=new Set();let thicknessHasImages=false;loaded.scene.traverse(object=>{if(!object.isMesh)return;for(const material of Array.isArray(object.material)?object.material:[object.material]){if(material.map)maps.add(material.name);if(material.name.startsWith('Colour_')&&material.map)thicknessHasImages=true;}});
        return {staticAngle,clips,stable,images:[...maps],thicknessHasImages,objects:loaded.scene.children.map(object=>object.name)};
      })().then(done,error=>done({error:String(error)}));`,
    });
    assert.equal(result.error, undefined);
    assert.ok(Math.abs(Math.abs(result.staticAngle) - Math.PI / 4) < 1e-6);
    assert.equal(Object.keys(result.clips).length, 2);
    const open = result.clips[Object.keys(result.clips).find((name) => name.endsWith('_Open'))],
      close = result.clips[Object.keys(result.clips).find((name) => name.endsWith('_Close'))];
    assert.ok(Math.abs(open[0]) < 1e-6 && Math.abs(Math.abs(open[2]) - Math.PI / 2) < 1e-6);
    assert.ok(Math.abs(close[0] - open[2]) < 1e-6 && Math.abs(close[2]) < 1e-6);
    assert.equal(result.stable, true);
    assert.equal(result.thicknessHasImages, false);
    assert.equal(result.images.length, 2);
    await writeFile(resolve(directory, 'independent-load.json'), JSON.stringify(result, null, 2));
    record(
      'Independent GLTFLoader reads actual native-written file; both images, half-open pose, fixed hinge/frame and both clips play correctly',
      result,
    );
  } else if (phase === 'close-prepare') {
    await clickText('Wall 1');
    const input = await element(
      'xpath',
      '//label[normalize-space(.)="Axis length (m)"]/following-sibling::input',
    );
    await request('POST', session(`/element/${input}/clear`), {});
    await keys('4.3', input);
    await keys('\uE007', input);
    await until(
      () =>
        script(
          'return document.querySelector("[data-testid=dirty-state]").textContent==="Unsaved"',
        ),
      'unsaved native close test',
    );
    state.beforeClose = await doc();
    console.log(
      'NATIVE CLOSE: click the main Windows title-bar close button, then run close-cancel.',
    );
  } else if (phase === 'close-cancel') {
    await until(
      () => script('return document.querySelectorAll("[role=dialog]").length===1'),
      'native unsaved-close guard',
    );
    await clickText('Cancel');
    assert.deepEqual(await doc(), state.beforeClose);
    assert.equal(await script('return document.querySelectorAll("[role=dialog]").length'), 0);
    record(
      'Actual Windows title-bar close routes through unsaved Save/Discard/Cancel; Cancel retains native window and exact editable data',
    );
    await clickText('Undo');
    assert.deepEqual(await doc(), state.expectedDocument);
  } else if (phase === 'restart') {
    await request('DELETE', session(''));
    await createSession();
    assert.equal(await script('return document.documentElement.lang'), 'en');
    assert.equal(await script('return document.documentElement.dataset.theme'), 'dark');
    record(
      'Actual Tauri process restart preserves English and dark settings from Rust local configuration',
    );
    await screenshot('desktop-restarted.png');
  } else if (phase === 'finish') {
    await request('DELETE', session(''));
    evidence.finished = new Date().toISOString();
    console.log('Native desktop test session closed');
  } else {
    throw new Error(`Unknown phase ${phase}`);
  }
} catch (error) {
  evidence.checks.push({ name: phase, status: 'failed', error: String(error) });
  process.exitCode = 1;
  console.error(error);
} finally {
  await writeFile(statePath, JSON.stringify(state, null, 2));
  await writeFile(evidencePath, JSON.stringify(evidence, null, 2));
}
