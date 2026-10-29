# `@building/ez-tree-adapter`

This package is the only builder integration boundary for [`ez-tree`](https://github.com/dgreenheck/ez-tree). Future vegetation code should depend on this package instead of importing the upstream `Tree`, `TreeOptions`, geometry fields, or material implementation. It does not add vegetation to the editor model or runtime.

The adapter uses `@dgreenheck/ez-tree@1.1.0` and the workspace's `three@0.186.1`. The upstream package declares `three >=0.167` as a peer dependency, so npm resolves the existing workspace Three.js copy. The upstream module initializes its built-in textures through `TextureLoader`; tree creation therefore runs in the browser/WebView runtime. The request normalizer and type definitions are otherwise independent of the DOM.

## Public API

```ts
import {
  createEzTree,
  createEzTreeGeometry,
  getEzTreeCapabilities,
} from '@building/ez-tree-adapter';

const capabilities = getEzTreeCapabilities();
const tree = createEzTree({
  seed: 12345,
  preset: 'oak',
  detail: 'medium',
  wind: { enabled: false },
});

scene.add(tree.object);

const geometry = createEzTreeGeometry({ seed: 12345, preset: 'oak' });
// geometry.branches and geometry.leaves are owned snapshots.
geometry.dispose();

// Remove the tree when its owner is finished with it.
tree.dispose();
```

`normalizeEzTreeRequest` makes a new JSON-safe request, converts `seed` to uint32, defaults to the `Oak Medium` preset, applies detail aliases (`low`, `medium`, `high`), clamps wind and alpha-test values, and rejects non-finite or unsafe option values. A seed is never generated implicitly, so the same request is reproducible for the same upstream version.

`createEzTree` returns the generated object, branch and leaf meshes when available, bounds, the normalized seed and preset name. `createEzTreeGeometry` clones the generated mesh geometries, releases its temporary tree, and returns counts plus an independent `dispose` method. The adapter owns those geometry snapshots and the generated tree materials; callers own the returned object lifetime.

## Capability boundary

For `@dgreenheck/ez-tree@1.1.0`, `getEzTreeCapabilities()` reports:

| Capability         | Status                 | Detail                                                                                                                                                     |
| ------------------ | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Presets            | Supported              | Uses the upstream `TreePreset` and `Tree.loadPreset`.                                                                                                      |
| Geometry output    | Supported by adapter   | Snapshots `branchesMesh.geometry` and `leavesMesh.geometry`; upstream has no separate `createGeometry` function.                                           |
| LODs               | Unsupported upstream   | `createEzTreeLods` returns one level with `fallback: true` and an `unsupported-lod` warning.                                                               |
| Wind               | Unsupported by adapter | Upstream contains an internal wind shader and time update hook, but no stable parameter injection API; requested wind settings are ignored with a warning. |
| Material injection | Unsupported upstream   | Basic bark/leaf colors, leaf alpha test and leaf side are mapped to upstream options.                                                                      |

Texture IDs are intentionally not loaded or resolved here. The pinned upstream build owns shared built-in bark and leaf textures, so `barkTextureId`, normal/roughness/AO IDs and `leafTextureId` produce warnings and remain unchanged. A later vegetation/runtime layer may resolve project resource IDs before a future adapter extension.

## Resource ownership

Call `dispose()` once the returned tree or geometry is no longer used; repeated calls are safe. Disposal releases generated geometries and materials and detaches the object. Shared upstream textures are never disposed by default. `disposeEzTreeObject` can opt into owned texture disposal, but only textures marked by the adapter as owned are eligible, which prevents deleting the upstream module's shared texture cache.

The adapter deliberately does not change `editor-core`, `three-runtime`, project schema, selection, history, export, path tracing, or UI object-tree code. A future vegetation integration should translate editor data to `EzTreeCreateRequest`, add the returned object through the runtime's ownership APIs, and keep project persistence separate from this renderer-facing boundary.

## Local verification

```text
npm run build --workspace @building/ez-tree-adapter
npm test -- --run packages/ez-tree-adapter/adapter.test.ts
```

The unit test installs a minimal DOM image-element stub because the upstream package initializes `TextureLoader` at module evaluation time. Desktop/WebView verification must still run in the actual renderer environment.
