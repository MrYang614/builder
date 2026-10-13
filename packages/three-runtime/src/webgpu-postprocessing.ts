import { Color } from 'three';
import type { Camera, Scene } from 'three';
import { Node, RenderPipeline } from 'three/webgpu';
import { builtinAOContext, mrt, normalView, output, pass, screenUV, velocity } from 'three/tsl';
import { ao } from 'three/examples/jsm/tsl/display/GTAONode.js';
import { traa } from 'three/examples/jsm/tsl/display/TRAANode.js';
import type { WebGPURenderer } from 'three/webgpu';
import { runResourceCleanup } from './resource-cleanup';
import type {
  PostProcessingOptions,
  PostProcessingState,
  RasterPostProcessor,
} from './postprocessing';

type TraaInternals = {
  _historyRenderTarget?: {
    setSize(width: number, height: number): void;
  };
  _jitterIndex?: number;
  _needsPostProcessingSync?: boolean;
};
type OwnedNodeResource = { dispose(): void };
type AoResources = {
  _aoRenderTarget: OwnedNodeResource;
  _noiseTexture: OwnedNodeResource;
  _material: OwnedNodeResource;
};
type TraaResources = {
  _historyRenderTarget: OwnedNodeResource;
  _resolveRenderTarget: OwnedNodeResource;
  _resolveMaterial: OwnedNodeResource;
};

/** Uses Three's WebGPU RenderPipeline with pre-pass GTAO and velocity-aware TRAA. */
export class WebGPURasterPostProcessing implements RasterPostProcessor {
  private readonly pipeline: RenderPipeline;
  private readonly prePass;
  private readonly scenePass;
  private readonly sceneMRT;
  private readonly clearColor = new Color();
  private readonly aoPass;
  private readonly taaPass;
  private options: PostProcessingOptions;
  private history: PostProcessingState['history'] = 'invalid';
  private framesRemaining = 8;
  private disposed = false;

  constructor(
    private readonly renderer: WebGPURenderer,
    private readonly scene: Scene,
    camera: Camera,
    options: PostProcessingOptions,
  ) {
    this.options = options;
    // GTAO needs a dedicated depth/normal producer. Reusing the final scene pass
    // creates a cyclic TSL graph and can leave the pipeline without valid AO data.
    this.prePass = pass(scene, camera);
    this.prePass.setMRT(mrt({ output: normalView, velocity }));
    const prePassDepth = this.prePass.getTextureNode('depth');
    const prePassNormal = this.prePass.getTextureNode('output');

    this.scenePass = pass(scene, camera);
    this.sceneMRT = mrt({ output, normal: normalView, velocity });
    this.scenePass.setMRT(this.sceneMRT);
    this.aoPass = ao(prePassDepth, prePassNormal, camera);
    this.aoPass.resolutionScale = 0.75;
    this.aoPass.radius.value = 0.65;
    this.aoPass.thickness.value = 1;
    this.aoPass.scale.value = 1;
    this.aoPass.samples.value = 16;
    this.aoPass.useTemporalFiltering = false;
    this.scenePass.contextNode = options.gtao
      ? builtinAOContext(this.aoPass.getTextureNode().sample(screenUV).r)
      : null;
    this.taaPass = traa(
      this.scenePass.getTextureNode('output'),
      prePassDepth,
      this.prePass.getTextureNode('velocity'),
      camera,
    );
    this.taaPass.depthThreshold = 0.0005;
    this.taaPass.edgeDepthDiff = 0.001;
    this.taaPass.maxVelocityLength = 64;
    this.taaPass.useSubpixelCorrection = true;
    this.pipeline = new RenderPipeline(renderer);
    this.pipeline.outputNode = options.taa ? this.taaPass : this.scenePass;
    this.pipeline.needsUpdate = true;
  }

  get state(): PostProcessingState {
    return { ...this.options, available: true, history: this.history };
  }

  update(options: PostProcessingOptions): void {
    if (options.gtao !== this.options.gtao) {
      this.scenePass.contextNode = options.gtao
        ? builtinAOContext(this.aoPass.getTextureNode().sample(screenUV).r)
        : null;
      this.pipeline.needsUpdate = true;
    }
    if (options.taa !== this.options.taa) {
      this.pipeline.outputNode = options.taa ? this.taaPass : this.scenePass;
      this.pipeline.needsUpdate = true;
    }
    this.options = options;
    this.invalidateHistory();
  }

  setSize(width: number, height: number): void {
    this.aoPass.setSize(width, height);
    this.invalidateHistory();
  }

  invalidateHistory(): void {
    const internals = this.taaPass as unknown as TraaInternals;
    internals._jitterIndex = 0;
    internals._needsPostProcessingSync = true;
    if (internals._historyRenderTarget) {
      internals._historyRenderTarget.setSize(1, 1);
    }
    this.framesRemaining = 8;
    this.history = 'invalid';
  }

  /** Pins the beauty clear before nested effects reset renderer state; scene backgrounds stay borrowed. */
  render(): boolean {
    const background = this.scene.background;
    // TRAA resets renderer clear to black before lazily evaluating scenePass. The beauty
    // attachment must retain the viewport color independently of normal/velocity clears.
    this.sceneMRT.setClearColor(
      'output',
      background instanceof Color ? background : this.renderer.getClearColor(this.clearColor),
      background instanceof Color ? 1 : this.renderer.getClearAlpha(),
    );
    this.pipeline.render();
    if (this.options.taa && this.framesRemaining > 0) {
      this.framesRemaining -= 1;
      this.history = this.framesRemaining > 0 ? 'accumulating' : 'stable';
    } else {
      this.history = 'stable';
    }
    return this.options.taa && this.framesRemaining > 0;
  }

  /** Releases the pinned TSL nodes and all private targets even when native dispose callbacks fail. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const aoResources = this.aoPass as unknown as AoResources;
    const taaResources = this.taaPass as unknown as TraaResources;
    // Preserve Node's cache invalidation event independently of its chained resource disposers.
    const nodes = [this.prePass, this.scenePass, this.aoPass, this.taaPass];
    const resources = [
      this.pipeline,
      this.prePass.renderTarget,
      this.scenePass.renderTarget,
      aoResources._aoRenderTarget,
      aoResources._noiseTexture,
      aoResources._material,
      taaResources._historyRenderTarget,
      taaResources._resolveRenderTarget,
      taaResources._resolveMaterial,
    ];
    runResourceCleanup([
      ...nodes.map((node) => () => Node.prototype.dispose.call(node)),
      ...resources.map((resource) => () => resource.dispose()),
    ]);
  }
}

/** Creates the WebGPU TSL post chain with independent AO and TRAA inputs. */
export function createWebGPURasterPostProcessing(
  renderer: WebGPURenderer,
  scene: Scene,
  camera: Camera,
  options: PostProcessingOptions,
): WebGPURasterPostProcessing {
  return new WebGPURasterPostProcessing(renderer, scene, camera, options);
}
