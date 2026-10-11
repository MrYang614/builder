import {
  DepthTexture,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  NoBlending,
  RGBAFormat,
  ShaderMaterial,
  UnsignedIntType,
  Vector2,
  WebGLRenderTarget,
  type Camera,
  type Scene,
  type WebGLRenderer,
} from 'three';
import { FullScreenQuad, Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { runResourceCleanup } from './resource-cleanup';

const SAMPLE_COUNT = 8;

const vertexShader = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const temporalShader = /* glsl */ `
  precision highp float;
  uniform sampler2D tCurrent;
  uniform sampler2D tCurrentDepth;
  uniform sampler2D tHistory;
  uniform vec2 resolution;
  uniform mat4 inverseProjection;
  uniform mat4 inverseView;
  uniform mat4 previousViewProjection;
  uniform float historyValid;
  varying vec2 vUv;

  vec3 toYCoCg(vec3 rgb) {
    return vec3(dot(rgb, vec3(0.25, 0.5, 0.25)),
      dot(rgb, vec3(0.5, 0.0, -0.5)),
      dot(rgb, vec3(-0.25, 0.5, -0.25)));
  }

  vec3 fromYCoCg(vec3 value) {
    return vec3(value.x + value.y - value.z,
      value.x + value.z, value.x - value.y - value.z);
  }

  void main() {
    vec4 current = texture2D(tCurrent, vUv);
    float depth = texture2D(tCurrentDepth, vUv).x;
    if (historyValid < 0.5 || depth >= 0.999999) {
      gl_FragColor = vec4(current.rgb, depth);
      return;
    }

    vec4 viewPosition = inverseProjection * vec4(vUv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    viewPosition /= max(abs(viewPosition.w), 0.000001);
    vec4 worldPosition = inverseView * viewPosition;
    vec4 previousClip = previousViewProjection * worldPosition;
    vec3 previousNdc = previousClip.xyz / max(abs(previousClip.w), 0.000001);
    vec2 historyUv = previousNdc.xy * 0.5 + 0.5;
    float expectedDepth = previousNdc.z * 0.5 + 0.5;
    bool inside = all(greaterThanEqual(historyUv, vec2(0.0))) &&
      all(lessThanEqual(historyUv, vec2(1.0))) && previousClip.w > 0.0;
    vec4 history = texture2D(tHistory, historyUv);
    float depthTolerance = max(0.0015, expectedDepth * 0.008);
    if (!inside || abs(history.a - expectedDepth) > depthTolerance) {
      gl_FragColor = vec4(current.rgb, depth);
      return;
    }

    vec3 low = vec3(1e6);
    vec3 high = vec3(-1e6);
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 offset = vec2(float(x), float(y)) / resolution;
        vec3 sampleColor = toYCoCg(texture2D(tCurrent, vUv + offset).rgb);
        low = min(low, sampleColor);
        high = max(high, sampleColor);
      }
    }
    vec3 clippedHistory = fromYCoCg(clamp(toYCoCg(history.rgb), low, high));
    gl_FragColor = vec4(mix(current.rgb, clippedHistory, 0.88), depth);
  }
`;

const copyShader = /* glsl */ `
  precision highp float;
  uniform sampler2D tDiffuse;
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0);
  }
`;

function halton(index: number, base: number): number {
  let result = 0;
  let fraction = 1 / base;
  while (index > 0) {
    result += (index % base) * fraction;
    index = Math.floor(index / base);
    fraction /= base;
  }
  return result;
}

/** Accumulates jittered static-scene frames with camera reprojection and disocclusion rejection. */
export class WebGLTemporalAAPass extends Pass {
  private readonly sceneTarget: WebGLRenderTarget;
  private readonly historyTargets: [WebGLRenderTarget, WebGLRenderTarget];
  private readonly temporalMaterial: ShaderMaterial;
  private readonly copyMaterial: ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private readonly previousViewProjection = new Matrix4();
  private frameIndex = 0;
  private historyIndex = 0;
  private historyValid = false;
  private width = 1;
  private height = 1;
  private disposed = false;

  constructor(
    _renderer: WebGLRenderer,
    private readonly scene: Scene,
    private readonly camera: Camera,
  ) {
    super();
    this.sceneTarget = this.createSceneTarget();
    this.historyTargets = [this.createHistoryTarget(), this.createHistoryTarget()];
    this.temporalMaterial = new ShaderMaterial({
      uniforms: {
        tCurrent: { value: this.sceneTarget.texture },
        tCurrentDepth: { value: this.sceneTarget.depthTexture },
        tHistory: { value: this.historyTargets[0].texture },
        resolution: { value: new Vector2(1, 1) },
        inverseProjection: { value: new Matrix4() },
        inverseView: { value: new Matrix4() },
        previousViewProjection: { value: this.previousViewProjection },
        historyValid: { value: 0 },
      },
      vertexShader,
      fragmentShader: temporalShader,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
      toneMapped: false,
    });
    this.copyMaterial = new ShaderMaterial({
      uniforms: { tDiffuse: { value: this.historyTargets[0].texture } },
      vertexShader,
      fragmentShader: copyShader,
      depthTest: false,
      depthWrite: false,
      blending: NoBlending,
      toneMapped: false,
    });
    this.quad = new FullScreenQuad(this.copyMaterial);
  }

  private createSceneTarget(): WebGLRenderTarget {
    const target = new WebGLRenderTarget(1, 1, {
      format: RGBAFormat,
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });
    target.depthTexture = new DepthTexture(1, 1, UnsignedIntType);
    return target;
  }

  private createHistoryTarget(): WebGLRenderTarget {
    return new WebGLRenderTarget(1, 1, {
      format: RGBAFormat,
      type: HalfFloatType,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
  }

  /** Resizes owned buffers in physical pixels and discards history from the old projection. */
  setSize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    this.sceneTarget.setSize(this.width, this.height);
    this.sceneTarget.depthTexture!.image.width = this.width;
    this.sceneTarget.depthTexture!.image.height = this.height;
    this.historyTargets.forEach((target) => target.setSize(this.width, this.height));
    this.temporalMaterial.uniforms.resolution.value.set(this.width, this.height);
    this.invalidateHistory();
  }

  /** Invalidates accumulated frames after scene, camera-cut, or render-mode changes. */
  invalidateHistory(): void {
    this.frameIndex = 0;
    this.historyIndex = 0;
    this.historyValid = false;
  }

  /** Renders one jittered sample and reprojects valid history into the composer buffer. */
  render(
    renderer: WebGLRenderer,
    writeBuffer: WebGLRenderTarget,
    _readBuffer: WebGLRenderTarget,
  ): void {
    if (this.disposed) {
      return;
    }
    const savedProjection = this.camera.projectionMatrix.clone();
    const savedInverseProjection = this.camera.projectionMatrixInverse.clone();
    const savedTarget = renderer.getRenderTarget();
    const jitterX = (halton((this.frameIndex % SAMPLE_COUNT) + 1, 2) - 0.5) * 2;
    const jitterY = (halton((this.frameIndex % SAMPLE_COUNT) + 1, 3) - 0.5) * 2;
    this.camera.projectionMatrix.elements[8] += jitterX / this.width;
    this.camera.projectionMatrix.elements[9] += jitterY / this.height;
    this.camera.projectionMatrixInverse.copy(this.camera.projectionMatrix).invert();
    try {
      renderer.setRenderTarget(this.sceneTarget);
      renderer.clear(true, true, true);
      renderer.render(this.scene, this.camera);
      const viewProjection = new Matrix4().multiplyMatrices(
        this.camera.projectionMatrix,
        this.camera.matrixWorldInverse,
      );
      const historyWriteIndex = 1 - this.historyIndex;
      this.temporalMaterial.uniforms.tCurrent.value = this.sceneTarget.texture;
      this.temporalMaterial.uniforms.tCurrentDepth.value = this.sceneTarget.depthTexture;
      this.temporalMaterial.uniforms.tHistory.value =
        this.historyTargets[this.historyIndex].texture;
      this.temporalMaterial.uniforms.inverseProjection.value.copy(
        this.camera.projectionMatrixInverse,
      );
      this.temporalMaterial.uniforms.inverseView.value.copy(this.camera.matrixWorld);
      this.temporalMaterial.uniforms.previousViewProjection.value.copy(this.previousViewProjection);
      this.temporalMaterial.uniforms.historyValid.value = this.historyValid ? 1 : 0;
      renderer.setRenderTarget(this.historyTargets[historyWriteIndex]);
      this.quad.material = this.temporalMaterial;
      this.quad.render(renderer);

      this.copyMaterial.uniforms.tDiffuse.value = this.historyTargets[historyWriteIndex].texture;
      renderer.setRenderTarget(writeBuffer);
      this.quad.material = this.copyMaterial;
      this.quad.render(renderer);
      this.previousViewProjection.copy(viewProjection);
      this.historyIndex = historyWriteIndex;
      this.historyValid = true;
      this.frameIndex++;
    } finally {
      this.camera.projectionMatrix.copy(savedProjection);
      this.camera.projectionMatrixInverse.copy(savedInverseProjection);
      renderer.setRenderTarget(savedTarget);
    }
  }

  get accumulating(): boolean {
    return this.frameIndex < SAMPLE_COUNT;
  }

  /** Releases all render targets and shader resources owned by this pass. */
  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    const resources = [
      this.sceneTarget,
      ...this.historyTargets,
      this.temporalMaterial,
      this.copyMaterial,
      this.quad,
    ];
    runResourceCleanup(resources.map((resource) => () => resource.dispose()));
  }
}
