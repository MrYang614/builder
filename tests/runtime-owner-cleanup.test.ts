import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { createEmptyProject, createWall, EditorCore } from '@building/editor-core';
import { viewportTokens } from '@building/ui/tokens';
import { ThreeRuntime, type RuntimeSession } from '@building/three-runtime';
import type { RuntimeBuilding } from '../packages/three-runtime/src/runtime-building';
import type { RuntimeSelection } from '../packages/three-runtime/src/runtime-selection';
import type { RuntimePreview } from '../packages/three-runtime/src/runtime-preview';

class Element extends EventTarget {
  readonly dataset: Record<string, string> = {};
  readonly style = {};
  readonly remove = vi.fn();
  readonly focus = vi.fn();
  readonly setAttribute = vi.fn();
  readonly getAttribute = vi.fn(() => '3D viewport');
  readonly appendChild = vi.fn();
  readonly getBoundingClientRect = () => ({ left: 0, top: 0, width: 640, height: 480 });
}

const releaseRenderer = vi.fn();
const loseContext = vi.fn();
const disconnectObserver = vi.fn();

vi.mock('three/examples/jsm/controls/OrbitControls.js', () => ({
  OrbitControls: class extends THREE.EventDispatcher {
    readonly target = new THREE.Vector3();
    enabled = true;
    update = vi.fn();
    dispose = vi.fn();
    connect = vi.fn();
    disconnect = vi.fn();
  },
}));
vi.mock('../packages/three-runtime/src/postprocessing', () => ({
  createRasterPostProcessing: () => null,
}));
vi.mock('../packages/three-runtime/src/renderer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../packages/three-runtime/src/renderer')>()),
  createWebGLRenderer: () => {
    // The native runtime is constructed; only its GPU allocation boundary uses a CPU fake.
    const renderer = {
      domElement: new Element(),
      info: { memory: { geometries: 0, textures: 0 } },
      render: vi.fn(),
      setPixelRatio: vi.fn(),
      getPixelRatio: () => 1,
      setSize: vi.fn(),
      setClearColor: vi.fn(),
      dispose: releaseRenderer,
      forceContextLoss: loseContext,
      outputColorSpace: THREE.SRGBColorSpace,
      toneMapping: THREE.NoToneMapping,
      toneMappingExposure: 1,
    };
    Object.setPrototypeOf(renderer, THREE.WebGLRenderer.prototype);
    return renderer;
  },
}));

beforeEach(() => {
  releaseRenderer.mockReset();
  loseContext.mockReset();
  disconnectObserver.mockReset();
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('document', { createElement: () => new Element() });
  vi.stubGlobal('devicePixelRatio', 1);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      disconnect = disconnectObserver;
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('complete native runtime owner cleanup with a GPU boundary fake', () => {
  test.each(['formal', 'selection', 'preview', 'snap', 'static'] as const)(
    'a %s geometry disposal event cannot skip input, helper or renderer cleanup',
    async (fault) => {
      const document = createEmptyProject();
      const first = createWall('level_1', { x: 0, z: 0 }, { x: 4, z: 0 });
      first.id = 'first-wall';
      const second = createWall('level_1', { x: 0, z: 2 }, { x: 4, z: 2 });
      second.id = 'second-wall';
      document.walls.push(first, second);
      const core = new EditorCore(document);
      const session: RuntimeSession = {
        levelId: 'level_1',
        tool: 'select',
        selectedId: first.id,
        surface: 'A',
        wholeBuilding: false,
        hiddenIds: [],
        slabPurpose: 'floor',
        roofElevation: 3,
        cameraMode: 'edit',
        snap: { enabled: true, mode: 'points', tolerance: 0.16, gridSize: 0.1 },
      };
      const runtime = new ThreeRuntime(
        new Element() as unknown as HTMLElement,
        {
          getDocument: core.getSnapshot,
          getSession: () => session,
          command: (command) => core.execute(command).ok,
          select: vi.fn(),
          beginPreview: () => core.beginPreview(),
          preview: (token, command) => core.preview(token, command),
          cancelPreview: (token) => core.cancelPreview(token),
          status: vi.fn(),
        },
        viewportTokens('light'),
      );
      const building = Reflect.get(runtime, 'building') as RuntimeBuilding;
      const mesh = building.get(first.id)!.root.children[0] as THREE.Mesh;
      const selection = Reflect.get(runtime, 'selection') as RuntimeSelection;
      const preview = Reflect.get(runtime, 'preview') as RuntimePreview;
      const snapFeedback = Reflect.get(Reflect.get(runtime, 'snapping'), 'feedback');
      const staticGrid = Reflect.get(
        Reflect.get(runtime, 'decorations'),
        'grid',
      ) as THREE.GridHelper;
      const geometry = {
        formal: mesh.geometry,
        selection: (selection.handles.children[0] as THREE.Mesh).geometry,
        preview: preview.mesh.geometry,
        snap: Reflect.get(snapFeedback, 'geometry') as THREE.BufferGeometry,
        static: staticGrid.geometry,
      }[fault];
      const resources = new Set<THREE.BufferGeometry | THREE.Material>();
      runtime.scene.traverse((object) => {
        if (object instanceof THREE.Mesh || object instanceof THREE.Line) {
          resources.add(object.geometry);
          for (const material of Array.isArray(object.material)
            ? object.material
            : [object.material]) {
            resources.add(material);
          }
        }
      });
      const resourceDisposers = [...resources].map((resource) => vi.spyOn(resource, 'dispose'));
      geometry.addEventListener('dispose', () => {
        throw new Error(`injected ${fault} geometry disposal failure`);
      });
      const controlsDispose = vi.spyOn(runtime.controls, 'dispose');
      const canvasRemove = vi.spyOn(runtime.renderer.domElement, 'remove');
      expect(() => runtime.dispose()).toThrow(AggregateError);
      await Promise.resolve();
      expect(disconnectObserver).toHaveBeenCalledOnce();
      expect(controlsDispose).toHaveBeenCalledOnce();
      expect(releaseRenderer).toHaveBeenCalledOnce();
      expect(loseContext).toHaveBeenCalledOnce();
      expect(canvasRemove).toHaveBeenCalledOnce();
      expect(runtime.scene.children).toHaveLength(0);
      for (const release of resourceDisposers) {
        expect(release).toHaveBeenCalledOnce();
      }
      expect(runtime.diagnostics()).toMatchObject({
        objects: 0,
        resources: { materials: 0, textures: 0, references: 0 },
        eventListeners: 0,
        handles: 0,
        surfaceHighlights: 0,
        hingeMarkers: 0,
      });
      expect(() => runtime.dispose()).not.toThrow();
      expect(releaseRenderer).toHaveBeenCalledOnce();
    },
  );
});
