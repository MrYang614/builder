import type { Camera, Scene, WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { WebGLTemporalAAPass } from './webgl-taa';
import { runResourceCleanup } from './resource-cleanup';

type OwnedRasterInternals = { _fsQuad: { dispose(): void } };
type GtaoInternals = OwnedRasterInternals & { normalRenderTarget: { dispose(): void } };

export interface PostProcessingOptions {
  gtao: boolean;
  taa: boolean;
}

export interface PostProcessingState extends PostProcessingOptions {
  available: boolean;
  history: 'invalid' | 'accumulating' | 'stable';
}

export interface RasterPostProcessor {
  readonly state: PostProcessingState;
  update(options: PostProcessingOptions): void;
  setSize(width: number, height: number): void;
  invalidateHistory(): void;
  render(): boolean;
  dispose(): void;
}

/** Owns the WebGL-only raster post chain and its temporal history. */
export class RasterPostProcessing implements RasterPostProcessor {
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly taaPass: WebGLTemporalAAPass;
  private readonly gtaoPass: GTAOPass;
  private readonly outputPass: OutputPass;
  private options: PostProcessingOptions;
  private history: PostProcessingState['history'] = 'invalid';
  private disposed = false;

  constructor(
    private readonly renderer: WebGLRenderer,
    scene: Scene,
    camera: Camera,
    options: PostProcessingOptions,
  ) {
    this.options = options;
    this.composer = new EffectComposer(renderer);
    this.renderPass = new RenderPass(scene, camera);
    this.taaPass = new WebGLTemporalAAPass(renderer, scene, camera);
    this.gtaoPass = new GTAOPass(scene, camera, 1, 1);
    // Default blends the denoised AO into the previous color buffer. Denoise alone would
    // display the grayscale occlusion texture as the final image.
    this.gtaoPass.output = GTAOPass.OUTPUT.Default;
    this.gtaoPass.enabled = options.gtao;
    this.gtaoPass.blendIntensity = 0.72;
    this.gtaoPass.updateGtaoMaterial({
      radius: 0.65,
      distanceExponent: 2,
      thickness: 1,
      distanceFallOff: 1,
      scale: 1.2,
      samples: 16,
      screenSpaceRadius: false,
    });
    this.gtaoPass.updatePdMaterial({
      lumaPhi: 4,
      depthPhi: 2,
      normalPhi: 3,
      radius: 4,
      radiusExponent: 2,
      rings: 2,
      samples: 16,
    });
    this.outputPass = new OutputPass();
    this.composer.addPass(options.taa ? this.taaPass : this.renderPass);
    this.composer.addPass(this.gtaoPass);
    this.composer.addPass(this.outputPass);
    this.setSize(1, 1);
  }

  get state(): PostProcessingState {
    return {
      ...this.options,
      available: true,
      history: this.history,
    };
  }

  update(options: PostProcessingOptions): void {
    if (options.taa !== this.options.taa || options.gtao !== this.options.gtao) {
      const previousTaa = this.options.taa;
      this.options = options;
      this.gtaoPass.enabled = options.gtao;
      this.composer.removePass(previousTaa ? this.taaPass : this.renderPass);
      this.composer.insertPass(options.taa ? this.taaPass : this.renderPass, 0);
      this.invalidateHistory();
    }
  }

  setSize(width: number, height: number): void {
    const pixelRatio = this.renderer.getPixelRatio();
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(Math.max(1, width), Math.max(1, height));
    this.invalidateHistory();
  }

  invalidateHistory(): void {
    this.taaPass.invalidateHistory();
    this.history = 'invalid';
  }

  /** Renders one temporal step and reports whether another frame is required. */
  render(): boolean {
    this.composer.render();
    const accumulating = this.options.taa && this.taaPass.accumulating;
    this.history = accumulating ? 'accumulating' : 'stable';
    return accumulating;
  }

  /** Releases every buffer and shader once, including resources omitted by pinned upstream passes. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    // Three 0.186's chain disposers stop on a native dispose event exception; release leaf owners.
    const gtao = this.gtaoPass as GTAOPass & GtaoInternals;
    const resources = [
      this.composer.renderTarget1,
      this.composer.renderTarget2,
      this.composer.copyPass.material,
      (this.composer.copyPass as unknown as OwnedRasterInternals)._fsQuad,
      gtao.gtaoNoiseTexture,
      gtao.pdNoiseTexture,
      gtao.normalRenderTarget,
      gtao.gtaoRenderTarget,
      gtao.pdRenderTarget,
      gtao.normalMaterial,
      gtao.gtaoMaterial,
      gtao.pdMaterial,
      gtao.copyMaterial,
      gtao.depthRenderMaterial,
      gtao.blendMaterial,
      gtao._fsQuad,
      this.taaPass,
      this.outputPass.material,
      (this.outputPass as unknown as OwnedRasterInternals)._fsQuad,
      this.renderPass,
    ];
    runResourceCleanup(resources.map((resource) => () => resource.dispose()));
  }
}

/** Creates the WebGL post chain with GTAO and optional temporal accumulation. */
export function createRasterPostProcessing(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: Camera,
  options: PostProcessingOptions = { gtao: true, taa: true },
): RasterPostProcessing {
  return new RasterPostProcessing(renderer, scene, camera, options);
}
