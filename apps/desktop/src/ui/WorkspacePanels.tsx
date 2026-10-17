import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useLanguage } from './i18n';

type Panel = 'scene' | 'inspector';
const defaults = { scene: 220, inspector: 288 };
const minimums = { scene: 180, inspector: 248 };

/** Local layout changes keep panel drafts and the single viewport mounted across every toggle. */
export function WorkspacePanels({
  sceneOpen,
  inspectorOpen,
  scene,
  inspector,
  children,
}: {
  sceneOpen: boolean;
  inspectorOpen: boolean;
  scene: ReactNode;
  inspector: ReactNode;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  const container = useRef<HTMLDivElement>(null);
  const drag = useRef<{ panel: Panel; x: number; width: number } | null>(null);
  const [widths, setWidths] = useState(defaults);
  const [available, setAvailable] = useState(1000);
  useLayoutEffect(() => {
    const element = container.current;
    if (!element) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setAvailable(entry.contentRect.width);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // Shrinking a window distributes panel space above each minimum, reserving 300px for Canvas.
  const extra = Math.max(
    0,
    available - 312 - (sceneOpen ? minimums.scene : 0) - (inspectorOpen ? minimums.inspector : 0),
  );
  const desiredExtra =
    (sceneOpen ? widths.scene - minimums.scene : 0) +
    (inspectorOpen ? widths.inspector - minimums.inspector : 0);
  const ratio = desiredExtra > 0 ? Math.min(1, extra / desiredExtra) : 1;
  const effective = {
    scene: Math.round(minimums.scene + (widths.scene - minimums.scene) * ratio),
    inspector: Math.round(minimums.inspector + (widths.inspector - minimums.inspector) * ratio),
  };
  const maximum = (panel: Panel) => {
    const other = panel === 'scene' ? 'inspector' : 'scene';
    const otherOpen = other === 'scene' ? sceneOpen : inspectorOpen;
    const otherWidth = otherOpen ? effective[other] : 0;
    return Math.max(minimums[panel], Math.min(420, available - otherWidth - 312));
  };
  const resize = (panel: Panel, value: number) => {
    const width = Math.round(Math.max(minimums[panel], Math.min(maximum(panel), value)));
    const other = panel === 'scene' ? 'inspector' : 'scene';
    const otherOpen = other === 'scene' ? sceneOpen : inspectorOpen;
    // Freeze the visible sibling allocation so compressed preferences cannot reverse a resize.
    setWidths((current) => ({
      ...current,
      [other]: otherOpen ? effective[other] : current[other],
      [panel]: width,
    }));
  };
  const separator = (panel: Panel, visible: boolean) => (
    <div
      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- A focusable splitter is adjustable; the static hr element does not express this interaction.
      role="separator"
      className="panel-resizer"
      tabIndex={0}
      hidden={!visible}
      aria-label={t(panel === 'scene' ? 'workspace.resizeScene' : 'workspace.resizeProperties')}
      aria-orientation="vertical"
      aria-controls={`${panel}-panel`}
      aria-valuemin={minimums[panel]}
      aria-valuemax={maximum(panel)}
      aria-valuenow={effective[panel]}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return;
        }
        event.preventDefault();
        event.currentTarget.focus();
        drag.current = { panel, x: event.clientX, width: effective[panel] };
        const sibling =
          panel === 'scene'
            ? event.currentTarget.previousElementSibling
            : event.currentTarget.nextElementSibling;
        drag.current.width = sibling?.clientWidth ?? effective[panel];
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        const active = drag.current;
        if (active?.panel === panel) {
          resize(panel, active.width + (event.clientX - active.x) * (panel === 'scene' ? 1 : -1));
        }
      }}
      onPointerUp={(event) => {
        drag.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onDoubleClick={() => resize(panel, defaults[panel])}
      onKeyDown={(event) => {
        const direction = panel === 'scene' ? 1 : -1;
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          resize(
            panel,
            effective[panel] +
              (event.key === 'ArrowRight' ? 1 : -1) * direction * (event.shiftKey ? 40 : 10),
          );
        } else if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault();
          resize(panel, event.key === 'Home' ? minimums[panel] : maximum(panel));
        }
      }}
    />
  );
  return (
    <div
      className="work-area"
      ref={container}
      data-scene-open={sceneOpen}
      data-inspector-open={inspectorOpen}
      style={
        {
          '--scene-width': `${effective.scene}px`,
          '--inspector-width': `${effective.inspector}px`,
        } as CSSProperties
      }
    >
      <div
        className="workspace-panel"
        id="scene-panel"
        data-testid="scene-panel"
        hidden={!sceneOpen}
      >
        {scene}
      </div>
      {separator('scene', sceneOpen)}
      {children}
      {separator('inspector', inspectorOpen)}
      <div
        className="workspace-panel"
        id="inspector-panel"
        data-testid="inspector-panel"
        hidden={!inspectorOpen}
      >
        {inspector}
      </div>
    </div>
  );
}
