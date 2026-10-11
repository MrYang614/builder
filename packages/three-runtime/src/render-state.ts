import type { RenderState } from './renderer';
import type {
  PostProcessingOptions,
  PostProcessingState,
  RasterPostProcessor,
} from './postprocessing';

/** Converts public render state into the small option object consumed by post processors. */
export function postProcessingOptions(
  state: Pick<RenderState, 'postProcessing'>,
): PostProcessingOptions {
  return { gtao: state.postProcessing.gtao, taa: state.postProcessing.taa };
}

/** Publishes post-processing state only when it changes, avoiding render-state churn. */
export function syncPostProcessingState(
  processor: RasterPostProcessor | null,
  fallback: PostProcessingState,
  previousKey: string,
  publish: (state: PostProcessingState) => void,
): string {
  const state = processor?.state ?? fallback;
  const key = JSON.stringify(state);
  if (key !== previousKey) {
    publish(state);
    return key;
  }
  return previousKey;
}
