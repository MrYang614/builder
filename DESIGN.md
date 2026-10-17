---
name: Builder Nova
description: Compact neutral desktop building editor with a restrained blue accent
colors:
  background: '#171717'
  foreground: '#ededed'
  card: '#252525'
  card-foreground: '#ededed'
  popover: '#252525'
  popover-foreground: '#ededed'
  sidebar: '#202020'
  sidebar-foreground: '#d4d4d4'
  primary: '#86adff'
  primary-foreground: '#17233b'
  secondary: '#303030'
  secondary-foreground: '#ededed'
  accent: '#2c3b58'
  accent-foreground: '#b8ceff'
  muted: '#2b2b2b'
  muted-foreground: '#a1a1a1'
  border: '#353535'
  input: '#797979'
  control: '#2b2b2b'
  ring: '#86adff'
  destructive: '#eb8790'
  success: '#6fcc9d'
  warning: '#e5bd71'
  info: '#86adff'
  viewport-background: '#292929'
  grid: '#454545'
  selection: '#86adff'
  snap: '#6ed4aa'
  preview: '#9bbafa'
  preview-invalid: '#ed8f98'
  light-background: '#f4f4f4'
  light-foreground: '#242424'
  light-card: '#ffffff'
  light-card-foreground: '#242424'
  light-popover: '#ffffff'
  light-popover-foreground: '#242424'
  light-sidebar: '#ededed'
  light-sidebar-foreground: '#333333'
  light-primary: '#245fd4'
  light-primary-foreground: '#ffffff'
  light-secondary: '#e5e5e5'
  light-secondary-foreground: '#333333'
  light-accent: '#e5ebf8'
  light-accent-foreground: '#244a92'
  light-muted: '#eeeeee'
  light-muted-foreground: '#626262'
  light-border: '#d4d4d4'
  light-input: '#838383'
  light-control: '#fafafa'
  light-ring: '#245fd4'
  light-destructive: '#ab343d'
  light-success: '#27754f'
  light-warning: '#875c15'
  light-info: '#245fd4'
  light-viewport-background: '#e2e2e2'
  light-grid: '#b7b7b7'
  light-selection: '#245fd4'
  light-snap: '#168563'
  light-preview: '#4b79cf'
  light-preview-invalid: '#bc3d45'
typography:
  title:
    fontFamily: "'Inter Variable', 'Segoe UI Variable', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif"
    fontSize: '12px'
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "'Inter Variable', 'Segoe UI Variable', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif"
    fontSize: '12px'
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Inter Variable', 'Segoe UI Variable', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif"
    fontSize: '11px'
    fontWeight: 500
    lineHeight: 1.5
  control:
    fontFamily: "'Inter Variable', 'Segoe UI Variable', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif"
    fontSize: '12px'
    fontWeight: 500
    lineHeight: 1.5
  numeric:
    fontFamily: "'JetBrains Mono Variable', 'Cascadia Code', Consolas, 'PingFang SC', 'Microsoft YaHei UI', monospace"
    fontSize: '11px'
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: 'tnum'
  readout:
    fontFamily: "'JetBrains Mono Variable', 'Cascadia Code', Consolas, 'PingFang SC', 'Microsoft YaHei UI', monospace"
    fontSize: '10px'
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: 'tnum'
  empty-state:
    fontFamily: "'Inter Variable', 'Segoe UI Variable', 'Segoe UI', 'PingFang SC', 'Microsoft YaHei UI', 'Microsoft YaHei', sans-serif"
    fontSize: '16px'
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: '4px'
  md: '5px'
  lg: '6px'
  xl: '8px'
spacing:
  compact: '4px'
  item: '6px'
  inset: '8px'
  gutter: '12px'
  content: '16px'
  dialog: '24px'
components:
  button-primary:
    backgroundColor: '{colors.primary}'
    textColor: '{colors.primary-foreground}'
    typography: '{typography.control}'
    rounded: '{rounded.md}'
    padding: '4px 12px'
    height: '32px'
  button-outline:
    backgroundColor: '{colors.control}'
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
    padding: '4px 12px'
    height: '32px'
  button-ghost:
    textColor: '{colors.foreground}'
    rounded: '{rounded.md}'
    padding: '4px 12px'
    height: '32px'
  numeric-field:
    backgroundColor: '{colors.control}'
    textColor: '{colors.foreground}'
    typography: '{typography.numeric}'
    rounded: '{rounded.md}'
    padding: '0 8px'
    height: '28px'
  navigation-selected:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.accent-foreground}'
    rounded: '{rounded.md}'
    size: '34px'
  badge-secondary:
    backgroundColor: '{colors.secondary}'
    textColor: '{colors.secondary-foreground}'
    rounded: '{rounded.md}'
    padding: '2px 8px'
  card-shared:
    backgroundColor: '{colors.card}'
    textColor: '{colors.card-foreground}'
    rounded: '{rounded.lg}'
    padding: '16px'
---

# Design System: Builder Nova

## Overview

**Creative North Star: "The Focused Building Workspace"**

Nova is a compact operating surface for direct building work. Neutral gray planes, a restrained blue interaction accent, and precise typography keep the editable three-dimensional scene at the center. Dark is the default; the complete light palette is authored independently.

The workspace uses continuous surfaces and small, useful controls. Structure comes from alignment, tonal steps, concise disclosure groups, and clear input boundaries. Menus and dialogs gather secondary work without turning the editor into a stack of cards. The user's explicit Nova brief replaces the former paper-and-cyan appearance; the implemented layout and semantic source are the visual authority.

**Key Characteristics:**

- The Canvas is the primary visual artifact.
- Dense, left-aligned controls with distinct action weights.
- Neutral gray surfaces with blue reserved for interaction.
- Local Inter for interface text; JetBrains Mono for precise values.
- Collapsible, adjustable side panels preserve the mounted viewport.

## Colors

The frontmatter records the current source values: unprefixed entries are dark, and matching light-prefixed entries are light. These are a documentation snapshot of the single semantic source, not a second runtime palette.

### Primary

Restrained blue is the primary action, focus, selection, and information voice. Primary foreground is paired explicitly with its background in each theme. Accent is the softer blue surface for selected tools, highlighted rows, and hovered controls; it does not replace neutral workspace planes.

### Neutral

Background carries the header and tool rail. Sidebar carries the scene tree and inspector; card carries workspace controls and shared content surfaces; popover carries floating UI. Foreground and muted foreground distinguish working text from supporting text. Control is the field surface, input its visible boundary, and border a quiet structural separator. The viewport background, grid, and selected-object helpers have their own semantic roles.

### Status and editing feedback

Destructive, success, warning, and info retain their semantic meaning in both themes. Snap, preview, and preview-invalid belong to temporary editing feedback. Pair color with text, icons, or shape when the state needs explanation. Model material colors remain formal project data and are never derived from the interface theme; lighting and exposure also remain independent.

**The Single Source Rule.** All application UI colors come from packages/ui/src/tokens/source.json through public @building/ui exports. This document is an extracted reference; update the source first and regenerate CSS with npm run tokens.

**The Boundary Rule.** Use border for quiet structural separators and input for enabled control outlines. Keep enabled input boundaries at least 3:1 against their adjacent control surface; a panel divider is not a substitute for an input outline.

## Typography

**Interface Font:** Inter Variable, followed by Segoe UI Variable / Segoe UI and the explicit PingFang SC / Microsoft YaHei UI / Microsoft YaHei system fallbacks.

**Numeric Font:** JetBrains Mono Variable, followed by Cascadia Code / Consolas and native Chinese fallbacks.

Both normal Latin variable subsets are bundled locally through @fontsource-variable, with font-display: swap. The Inter WOFF2 is 48,256 bytes; JetBrains Mono is 40,404 bytes (88,660 bytes combined). Both use SIL Open Font License 1.1. Chinese glyphs come from the platform rather than a downloaded CJK font. The complete stacks and @font-face definitions live in packages/ui/src/styles/index.css; font failure still leaves usable local fallbacks.

### Hierarchy

- **Title:** semibold interface text (12px, 600, 1.5) for panel headings and selected-object identity.
- **Body:** regular interface text (12px, 400, 1.5) for controls, menus, dialogs, and ordinary descriptions.
- **Label:** compact interface text (11px, 500, 1.5) for disclosure headings and workspace metadata; supporting labels may use regular weight.
- **Numeric:** compact monospace property values with tabular numerals (11px, 400, 1.5); medium numeric controls use 12px.
- **Readout:** compact monospace values (10px, 400, 1.5) for elevation, coordinates, and technical metadata; render sample readouts use 11px.
- **Empty state:** a brief invitation (16px, 500, 1.4), followed by ordinary 12px instructions. It stays inside the scene rather than becoming a page headline.

**The Numeric Role Rule.** Use JetBrains Mono with tabular numerals for coordinates, dimensions, angles, sample counts, and technical readouts. Keep labels, menus, buttons, help, and prose in Inter.

## Layout

The editor fills the desktop window. It is an operating workspace, not a responsive marketing page: the production window starts at 1600×900 with a 900×600 minimum; the CSS workspace has an 860px minimum width.

- The compact header (44px) places the Project actions icon menu and six direct New / Open / Save / Save as / Undo / Redo actions at the left, followed by saved state. The project name is centered plain text with truncation, no focus target, and no tooltip. Export, appearance, language, rendering backend, settings, and native window commands sit at the right. Noninteractive header areas retain native drag and maximize/restore behavior.
- The workspace control row (34px) exposes Scene and Properties toggles, the active tool name, and an available-space hint.
- The left tool rail (44px) contains the six modeling tools, with the example action anchored low. Tool targets are 34px square and show selected state plus localized hover/focus hints.
- The scene panel starts at 220px and the inspector at 288px. Their minimums are 180px and 248px; each splitter clamps to at most 420px while preserving at least 300px of Canvas width. Splitters are 4px, support pointer capture, arrow keys, Shift for larger steps, Home / End, and double-click reset.
- Scene and Properties can collapse independently. Panel components and the viewport stay mounted, preserving drafts and runtime identity. Width and collapse state are local presentation state, outside the document and undo history.
- Camera, view, and render controls sit directly above the Canvas. Secondary settings and rendering details live in dialogs; real backend, sampling, progress, and error states remain visible.
- Docked panels scroll internally. Native details/summary groups keep property fields mounted when collapsed. Numeric and text field labels sit beside their inputs, with explicit units and inline errors.
- The bottom status bar (26px) carries operation guidance, snap feedback, and current floor / unit context.

The main rhythm is compact: control gaps of 4–6px, 8px insets, 12px panel gutters, and 16–24px dialog separation. Medium controls are 32px high, small controls 28px, and large controls 36px. Below 1200px the header tightens and view options wrap into another row; below 980px header spacing tightens again. Settings content becomes two columns from 720px. These rules preserve task access at the supported desktop sizes.

## Elevation & Depth

Docked workspace regions are flat. Neutral tonal steps, alignment, and quiet single dividers establish the hierarchy. Floating menus use a modest shadow in the semantic shadow color; dialogs use a larger shadow and the semantic overlay backdrop. Tooltips are small, legible floating surfaces. Focus rings communicate keyboard position rather than physical elevation. Reduced-motion preferences disable shared dialog, select, and tooltip animation / transition effects.

**The Flat Workspace Rule.** The viewport and docked panels have no inset card or decorative shadow. Reserve overlay and shadow tokens for floating menus, tooltips, dialogs, and their backdrops.

## Shapes

Controls use restrained corners: small 4px, medium 5px, large 6px, and floating-container 8px where the component uses that scale. Shared cards remain available at 6px with a quiet border, but do not compose the main editor shell. Numeric fields share one outline around the value and any adornments; a focused input does not become a nested collection of boxes. Icons use simple strokes and semantic currentColor.

## Components

### Buttons

Primary is a filled blue action; secondary uses a neutral fill. Outline uses the control surface and input boundary. Ghost is the default for dense chrome and gains a soft accent on hover; destructive actions use the destructive pair. Default buttons are 32px, compact buttons 28px, with 5px corners and medium-weight interface text. Icon buttons keep accessible names and localized hover/focus hints, including disabled actions. Loading preserves the action name, exposes aria-busy, and prevents repeat submission. Focus uses the ring token; disabled actions reduce opacity and block input.

### Inputs and selectors

Fields use control fill, input border, foreground text, and 5px corners. Focus-within changes the boundary to ring and adds its subtle focus halo; invalid and warning states use the corresponding semantic boundary plus a message. The shared numeric draft owner handles intermediate decimal text, IME, Enter/blur de-duplication, Escape cancellation, and rejected values. Desktop adapters commit through existing commands. Numeric selectors opt into the same monospace value role; ordinary selectors remain Inter.

### Navigation and disclosures

The modeling rail uses one selected tool with an accent surface and accent foreground, plus accessible pressed state. Hover and keyboard focus remain distinct. Scene rows provide name and numeric elevation; entity rows retain selection behavior. Property groups use native details/summary with a small directional chevron, compact headings, and clear focus. The document contains only supported objects and actions; visual completeness never justifies a dummy control.

### Menus, dialogs, and feedback

The Project actions menu retains file actions while direct header actions provide fast access. Dropdowns, context menus, selectors, tooltips, dialogs, and confirmations use shared @building/ui behavior and theme tokens. Dialogs own focus and return it to their trigger; Escape and text editing take priority over scene commands. Confirmation copy names the operation and impact. Errors name the cause and retain the current document or draft. Empty scene and inspector states give a useful next action without obstructing the Canvas.

### Shared badges and cards

Badges are compact semantic labels with small corners; they do not become large status banners by default. The shared Card component uses a neutral card surface, quiet border, 6px corners, and 12 / 16 / 24px padding. It is a library primitive for suitable standalone content, not a frame around every workspace section.

## Do's and Don'ts

### Do:

- Do use semantic tokens in both themes and preserve equal theme keys.
- Do keep numeric values and units aligned, with clear labels and validation messages.
- Do retain hover, selected, focus, disabled, loading, error, and success feedback where the control supports those states.
- Do keep pane sizing and collapse state local to UI presentation; retain one mounted Canvas.
- Do route property and pointer edits through the same EditorCore commands; one committed drag is one history item.
- Do preserve project, session, runtime, and local-preference ownership and export an independent revision snapshot.

### Don't:

- Don't restore the discarded paper-and-cyan identity or make light the fallback default.
- Don't stack SaaS-style cards, add decorative gradients, over-round the workspace, or use shadows to divide docked regions.
- Don't make every control primary or use blue as a large decorative surface.
- Don't apply JetBrains Mono to ordinary interface prose or depend on a network font request.
- Don't replace enabled control outlines with quiet divider tokens.
- Don't remount the renderer for pane, theme, language, or dialog changes, duplicate formal document state, or write transient previews into history.
- Don't introduce iframe, R3F, Next.js, a backend service, or a plugin layer into the production editor.
