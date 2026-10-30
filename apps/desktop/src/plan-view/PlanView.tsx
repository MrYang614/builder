import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Vec2 } from '@building/editor-core';
import { useDocument, useEditor, useSession, useSignal } from '../app/services';
import { useLanguage } from '../ui/i18n';
import { PlanScene, PlanSelection, dimension } from './PlanScene';
import { PlanDraft } from './PlanDraft';
import { PlanInteraction } from './interaction';
import type { PlanPreview, PlanTarget } from './interaction';
import { fitPlanCamera, screenToPlan, zoomPlanCamera } from './coordinates';
import type { PlanCamera } from './coordinates';
import './plan.css';

/** Owns only the SVG camera and pointer drafts; Core remains the sole owner of committed objects. */
export function PlanView() {
  const services = useEditor(),
    document = useDocument(),
    session = useSession(),
    { t } = useLanguage();
  const panning = useSignal(services.planPan);
  const transition = useSignal(services.viewTransition);
  const active = transition.phase === 'idle' && transition.visible === 'plan';
  const documentEpoch = services.commands.getSnapshot().documentEpoch;
  const host = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const controller = useRef<PlanInteraction | null>(null);
  const gesture = useRef<{ id: number; pan?: { x: number; y: number; camera: PlanCamera } } | null>(
    null,
  );
  const [size, setSize] = useState({ width: 800, height: 600 });
  const [camera, setCamera] = useState<PlanCamera>({ center: { x: 0, z: 0 }, pixelsPerMeter: 50 });
  const [preview, setPreview] = useState<PlanPreview | null>(null);
  const cameraRef = useRef(camera);
  const fitKey = useRef('');
  useLayoutEffect(() => {
    cameraRef.current = camera;
  }, [camera]);

  useEffect(() => {
    const interaction = new PlanInteraction({
      getDocument: services.core.getSnapshot,
      getSession: services.session.getSnapshot,
      submit: services.submit,
      select: services.select,
      activateTool: (tool) => services.session.set({ tool }),
      status: (key) => {
        if (key.startsWith('snap.')) {
          return;
        }
        if (!services.notice.get().error && services.notice.get().key !== key) {
          services.notice.set({ key, error: false });
        }
      },
      onPreview: setPreview,
    });
    controller.current = interaction;
    const unsubscribe = services.core.subscribe(() => interaction.reconcile());
    const unsubscribeSession = services.session.subscribe(() => interaction.reconcile());
    const cancel = () => {
      interaction.cancel();
      gesture.current = null;
    };
    window.addEventListener('blur', cancel);
    return () => {
      unsubscribe();
      unsubscribeSession();
      window.removeEventListener('blur', cancel);
      interaction.cancel();
      controller.current = null;
    };
  }, [services]);

  useLayoutEffect(() => {
    if (!active) {
      controller.current?.cancel();
      gesture.current = null;
    }
  }, [active]);

  useLayoutEffect(() => {
    const element = host.current;
    if (!element) {
      return;
    }
    const resize = () => {
      const rect = element.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return;
      }
      const nextSize = { width: rect.width, height: rect.height };
      setSize(nextSize);
      const key = `${document.id}/${documentEpoch}/${session.currentLevelId}`;
      if (fitKey.current !== key) {
        fitKey.current = key;
        setCamera(fitPlanCamera(services.core.getSnapshot(), session.currentLevelId, nextSize));
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    return () => observer.disconnect();
  }, [document.id, documentEpoch, session.currentLevelId, services]);

  useLayoutEffect(() => {
    // Read the retained SVG camera on demand; no scene-animation frames enter this local React state.
    const readFraming = () => {
      const level = services.core
        .getSnapshot()
        .levels.find((item) => item.id === services.session.getSnapshot().currentLevelId);
      return { ...cameraRef.current, elevation: level?.elevation ?? 0 };
    };
    return services.attachPlanFraming(readFraming);
  }, [services]);

  useEffect(
    () =>
      services.planFocus.subscribe(() => {
        if (!active) {
          return;
        }
        const action = services.planFocus.get();
        if (action === 'duplicate') {
          controller.current?.duplicateSelection();
          return;
        }
        if (action === 'origin') {
          setCamera({ center: { x: 0, z: 0 }, pixelsPerMeter: 50 });
          return;
        }
        const doc = services.core.getSnapshot(),
          s = services.session.getSnapshot();
        const selected = action === 'selected' ? s.selectedId : undefined;
        const opening = doc.openings.find((item) => item.id === selected);
        const target = selected
          ? {
              ...doc,
              walls: doc.walls.filter(
                (item) => item.id === selected || item.id === opening?.wallId,
              ),
              slabs: doc.slabs.filter((item) => item.id === selected),
            }
          : doc;
        setCamera(fitPlanCamera(target, s.currentLevelId, size));
      }),
    [services, active, size],
  );

  useEffect(() => {
    const element = svg.current;
    if (!element || !active) {
      return;
    }
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      // A captured drag retains its camera/anchor until release; click-based drafts can still zoom.
      if (gesture.current) {
        return;
      }
      const rect = element.getBoundingClientRect();
      setCamera((current) =>
        zoomPlanCamera(
          current,
          screenToPlan({ x: event.clientX, y: event.clientY }, rect, current),
          event.deltaY,
        ),
      );
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [active, size]);

  const world = (event: ReactPointerEvent<SVGSVGElement>): Vec2 =>
    screenToPlan(
      { x: event.clientX, y: event.clientY },
      event.currentTarget.getBoundingClientRect(),
      cameraRef.current,
    );
  const target = (event: ReactPointerEvent<SVGSVGElement>): PlanTarget | undefined => {
    // Pointer capture retargets moves to the SVG, so resolve the physical hit for host previews.
    const hit = window.document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest('[data-object-id]');
    const id = hit?.getAttribute('data-object-id');
    const handle = hit?.getAttribute('data-handle');
    return id
      ? {
          id,
          handle:
            handle === 'start' || handle === 'end'
              ? handle
              : handle !== null && handle !== undefined
                ? Number(handle)
                : undefined,
        }
      : undefined;
  };
  const cancel = () => {
    controller.current?.cancel();
    gesture.current = null;
  };
  const scale = camera.pixelsPerMeter;
  const width = size.width / scale,
    height = size.height / scale;
  const left = camera.center.x - width / 2,
    top = camera.center.z - height / 2;
  const grid = 10 ** Math.ceil(Math.log10(35 / scale));
  const gridX = Math.floor(left / grid) * grid,
    gridZ = Math.floor(top / grid) * grid;
  const canEdit =
    !session.wholeBuildingPreview && !session.hiddenIds.includes(session.selectedId ?? '');
  return (
    <div
      className="plan-viewport"
      ref={host}
      data-active={transition.visible === 'plan'}
      aria-hidden={!active}
      inert={!active}
      data-testid="plan-view"
    >
      {/* oxlint-disable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex -- The focusable SVG is an application drawing surface; pointer and keyboard edits have equivalent inspector controls. */}
      <svg
        ref={svg}
        className="plan-canvas"
        role="application"
        aria-label={t('plan.label')}
        tabIndex={0}
        data-panning={panning}
        viewBox={`${left} ${top} ${width} ${height}`}
        onContextMenu={(event) => event.preventDefault()}
        onBlur={(event) => {
          delete event.currentTarget.dataset.focusOrigin;
          cancel();
        }}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing) {
            return;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            controller.current?.cancel(true);
            gesture.current = null;
          } else {
            event.currentTarget.dataset.focusOrigin = 'keyboard';
          }
          if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
            event.preventDefault();
            controller.current?.duplicateSelection();
          }
        }}
        onPointerDown={(event) => {
          if (gesture.current || (event.button !== 0 && event.button !== 1 && event.button !== 2)) {
            return;
          }
          event.preventDefault();
          // Preserve pointer focus through cancellation; Tab navigation restores its ring on refocus.
          event.currentTarget.dataset.focusOrigin = 'pointer';
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          const pan = panning || event.button !== 0;
          gesture.current = {
            id: event.pointerId,
            ...(pan ? { pan: { x: event.clientX, y: event.clientY, camera } } : {}),
          };
          if (!pan) {
            controller.current?.pointerDown(world(event), target(event), { altKey: event.altKey });
          }
        }}
        onPointerMove={(event) => {
          const current = gesture.current;
          if (current && current.id !== event.pointerId) {
            return;
          }
          if (current?.pan) {
            const start = current.pan;
            setCamera({
              ...start.camera,
              center: {
                x: start.camera.center.x - (event.clientX - start.x) / start.camera.pixelsPerMeter,
                z: start.camera.center.z - (event.clientY - start.y) / start.camera.pixelsPerMeter,
              },
            });
          } else if (!panning) {
            controller.current?.pointerMove(world(event), target(event), { altKey: event.altKey });
          }
        }}
        onPointerUp={(event) => {
          if (gesture.current?.id !== event.pointerId) {
            return;
          }
          const pan = gesture.current.pan;
          gesture.current = null;
          if (!pan) {
            controller.current?.pointerUp(world(event), { altKey: event.altKey });
          }
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={cancel}
        onLostPointerCapture={() => {
          if (gesture.current) {
            cancel();
          }
        }}
      >
        <g className="plan-grid" pointerEvents="none">
          {Array.from({ length: Math.ceil(width / grid) + 1 }, (_, i) => (
            <line
              key={`x${i}`}
              x1={gridX + i * grid}
              y1={top}
              x2={gridX + i * grid}
              y2={top + height}
            />
          ))}
          {Array.from({ length: Math.ceil(height / grid) + 1 }, (_, i) => (
            <line
              key={`z${i}`}
              x1={left}
              y1={gridZ + i * grid}
              x2={left + width}
              y2={gridZ + i * grid}
            />
          ))}
          <line className="plan-axis" x1={0} y1={top} x2={0} y2={top + height} />
          <line className="plan-axis" x1={left} y1={0} x2={left + width} y2={0} />
        </g>
        <PlanScene
          document={document}
          levelId={session.currentLevelId}
          hiddenIds={session.hiddenIds}
          selectedId={session.selectedId}
        />
        {canEdit && (
          <PlanSelection
            document={document}
            selectedId={session.selectedId}
            scale={scale}
            editable={session.tool === 'select'}
          />
        )}
        <PlanDraft preview={preview} document={document} scale={scale} />
      </svg>
      {/* oxlint-enable jsx-a11y/no-noninteractive-element-interactions, jsx-a11y/no-noninteractive-tabindex */}
      {!document.walls.some((w) => w.levelId === session.currentLevelId) &&
        !document.slabs.some((s) => s.levelId === session.currentLevelId) &&
        !preview?.object &&
        !preview?.start && (
          <div className="viewport-empty">
            <strong>{t('plan.start')}</strong>
            <p>{t('plan.empty')}</p>
          </div>
        )}
      {preview?.point && (
        <div className="viewport-snap-coordinate plan-readout">
          X {dimension(preview.point.x)} · Z {dimension(preview.point.z)}
          {preview.snap &&
            preview.snap.kind !== 'raw' &&
            ` · ${t(`snap.${preview.snap.targetKind ?? preview.snap.kind}`)}`}
        </div>
      )}
      <div className="plan-help">{t('plan.hint')}</div>
    </div>
  );
}
