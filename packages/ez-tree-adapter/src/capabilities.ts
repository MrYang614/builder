import { Tree, TreePreset } from '@dgreenheck/ez-tree';
import type { EzTreeCapabilities } from './types';

/** Reports only capabilities observed on the pinned upstream package. */
export function getEzTreeCapabilities(): EzTreeCapabilities {
  const prototype = Tree.prototype as unknown as Record<string, unknown>;
  const hasPresets =
    typeof prototype.loadPreset === 'function' && Object.keys(TreePreset).length > 0;
  const hasGeometry = typeof prototype.generate === 'function';
  return {
    supportsPresets: hasPresets,
    supportsGeometryOutput: hasGeometry,
    supportsLods: false,
    supportsWind: false,
    supportsMaterialInjection: false,
  };
}
