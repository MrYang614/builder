# Building UI workshop

This workspace is a real React/Vite Storybook. It consumes the same public `@building/ui` implementation as the desktop editor. Storybook and the Sucrase browser compiler are development dependencies of this workspace; they are absent from the desktop entry graph.

Controls changes are temporary. The official [`controls.disableSaveFromUI`](https://storybook.js.org/docs/essentials/controls#disablesavefromui) setting disables its Update story / Create new story actions, keeping configuration edits in preview memory. Browser tests verify both actions remain absent after args changes.

## Install, run and build

Run these commands from the repository root with the pinned Node/npm toolchain described in `docs/CODE-QUALITY.md`:

```powershell
npm ci
npm run storybook
```

Open [http://127.0.0.1:6006](http://127.0.0.1:6006). The port is fixed and independent of the editor's 1420 and regression-test ports. The server does not open a native editor window.

```powershell
npm run build:storybook
npm run test:storybook
```

The static result is `apps/storybook/dist`. A static web server can serve that directory independently of the desktop application. Root `npm run typecheck`, format, lint and architecture checks include Storybook source and its configuration. The browser test command uses `playwright.storybook.config.ts`; its artifacts live in the independent evidence directory documented in the delivery report.

## Directory

| Area                            | Purpose                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `.storybook/main.ts`            | Real Storybook React/Vite framework, docs addon, source discovery               |
| `.storybook/preview.tsx`        | Shared UI CSS, light/dark and narrow-container globals                          |
| `vite.config.ts`                | React/Tailwind integration and isolated dependency cache                        |
| `src/stories`                   | Static CSF component directory and per-family state stories                     |
| `src/examples/*.example.tsx`    | Actual, typechecked TSX examples; also imported as editable raw source          |
| `src/examples/*-definitions.ts` | Example baselines, explicit props documentation and keyboard guidance           |
| `src/config/*.json`             | Repository baseline of serializable configuration                               |
| `src/config/common.ts`          | Reusable, explicit schema fields                                                |
| `src/playground`                | In-memory editors, schema validation, TSX compiler and contained preview errors |

The directory exposes Input, Input.TextArea, Input.Password, Input.Search, InputNumber, Select, Checkbox, Checkbox.Group, Radio, Radio.Group, Switch, Slider, Button, Button.Icon, Button.Group, Form, Tooltip, Popover, DropdownMenu, ContextMenu, Dialog, ConfirmDialog, Tabs, Segmented, Toggle, ToggleGroup, Accordion, Alert, Badge, Card, Separator, Empty, Skeleton, Spinner and Progress.

Each entry offers a working editable baseline, source copy, a props table, keyboard guidance, dark and narrow previews. Applicable families add small/large sizes, disabled, readonly, pending, error, semantic variants and controlled/uncontrolled stories. A stateless display component does not invent controlled or keyboard states. Bilingual labels and longer content exercise real wrapping.

## Browser editing

Edit **Example code** to compile TSX immediately. An example must export a default React function component; its props receive the currently applied Storybook args. Multiple UI components, namespace members, React hooks and event callbacks work normally:

```tsx
import { useState } from 'react';
import { Button, Form, Input } from '@building/ui';
import { Save } from 'lucide-react';
import type { ComponentProps } from 'react';

export default function Example(args: ComponentProps<typeof Input>) {
  const [name, setName] = useState('Courtyard / 庭院');
  return (
    <Form.Group>
      <Form.Item label="Name">
        <Input {...args} value={name} onValueChange={setName} allowClear />
      </Form.Item>
      <Button
        icon={Save}
        onClick={() => {
          setName('Saved');
        }}
      >
        Save
      </Button>
    </Form.Group>
  );
}
```

Supported imports are `react`, `@building/ui`, and these `lucide-react` icons: `Check`, `Search`, `Save`, `Plus`, `X`, `Settings`, `Moon`, `Sun`, `Eye`, `Copy`. Type-only imports are erased. The automatic React JSX runtime is supplied internally. Relative paths, packages outside this list and file access are not supplied. Sucrase parses/transforms TypeScript, JSX and ES imports; it does not provide semantic TypeScript typechecking inside the browser. Repository example files do pass strict TypeScript checking.

The compiler creates a transient Blob module containing an evaluation factory, supplies the documented modules, and revokes its URL after evaluation. Superseded compilations cannot publish or evaluate stale examples. Render failures are contained by a boundary scoped to the current code/config revision. Correcting an error recovers the preview. This is a trusted local code workshop, not an isolation sandbox for untrusted JavaScript; browser APIs remain JavaScript capabilities.

Edit **Temporary configuration** as JSON. The same schema generates Storybook Controls and validates the JSON editor, including enum values, primitive types, nested option objects, required option identifiers/labels and numeric bounds. Applied values have one owner: Storybook args. Code consumes those args. Editing JSON updates Controls; editing Controls updates the JSON text. Invalid JSON leaves the last valid configuration applied and shows a **Configuration error**. Nodes, icons and callbacks belong in TSX, not JSON.

**Code compilation error**, **Configuration error** and **Runtime error** have separate messages. Pending or invalid source/configuration marks any retained preview as the last valid result. **Reset example** restores the latest repository source and JSON baseline. **Copy code** copies the currently visible source to the clipboard.

Browser edits have no persistence or file-write endpoint. They exist only in page memory; refresh, leaving the story and reset discard drafts. The UI does not write them to localStorage, sessionStorage or IndexedDB. Storybook itself may maintain its own interface preferences; those are separate from example drafts.

Manager refresh, real story re-entry and explicit reset use Storybook's public `resetArgs` and the selected CSF story's `initialArgs`. Each variant keeps its own repository baseline: the Disabled story resets to disabled, rather than inheriting Default's enabled state. Ordinary Controls updates and HMR restoration keep their current temporary args.

Storybook 10.6.2's optional review UI was observed writing a return URL containing temporary args to sessionStorage under `storybook/review/pre-review-return`. This workspace explicitly disables that optional UI with [`features.experimentalReview: false`](https://storybook.js.org/docs/api/main-config/main-config-features#experimentalreview). The real manager regression tests compare all browser storage before and after code/config edits, then verify both full reload and sidebar navigation discard drafts. Storybook can encode current Controls in the live URL; those values are discarded on a fresh story entry and are never treated as the repository baseline.

## Local files and HMR

Change a public component source under `packages/ui/src`: Vite refreshes the current preview using the shared module, including a browser-authored example. Change an example TSX or JSON file: its latest contents become the reset baseline. With no draft the playground adopts the new baseline; with an active browser draft it preserves the text/configuration and announces **Local baseline updated**. **Reset example** then loads the new files. Controls and the editor continue to share args after that reset.

No component colors are duplicated here. Shared semantic tokens and high-level component props own appearance; workshop CSS controls page arrangement. `Input.TextArea font="code"` supplies code typography through the public semantic API. Theme globals update the preview document so portal overlays follow the same light/dark tokens.

## Add a family or example

1. Implement/export the typed shared component in `@building/ui`; internal primitives stay under `packages/ui/src/primitives`.
2. Add a focused `src/examples/name.example.tsx` using public imports and explicit event/value conventions. Keep component appearance in semantic props.
3. Add `src/config/name.json` with serializable props only.
4. Import the raw TSX and JSON in the appropriate definition module. Use `defineExample` with an explicit schema, props/default documentation and real keyboard guidance. Baseline JSON is validated when the definition loads.
5. Add a CSF file with a stable `id`, `controls(example.schema)` and `renderExample(example)`. Export applicable semantic variants/states plus dark/narrow stories; update the overview directory.
6. Run `npm run format`, `npm run lint:fix`, `npm run check`, `npm run typecheck`, `npm test`, `npm run build`, `npm run build:storybook` and relevant browser/Rust checks. Exercise actual code/config editing, recovery, HMR and focus before recording verification.

## Compatibility references

Pinned Storybook 10.6.2 package metadata declares Vite `^5 || ^6 || ^7 || ^8`, React/ReactDOM through `^19`, and TypeScript `>=4.9`; it is compatible with this repository's Vite 8.0.16, React 19.3.0 and TypeScript 6.0.3. Sucrase is pinned to 3.35.1. Existing editor dependencies were retained.

Implementation references: [Storybook React/Vite framework](https://storybook.js.org/docs/get-started/frameworks/react-vite), [single-source args and useArgs](https://storybook.js.org/docs/writing-stories/args), [Sucrase transforms and automatic JSX runtime](https://github.com/alangpierce/sucrase). Keep React state inside the Playground component; Storybook's `useArgs` hook lives only in the story render function, following the documented separation.
