import { memo, useMemo } from 'react';
import type { ProjectDocument, Vec2 } from '@building/editor-core';
import { buildPlanWallFootprints, derivePlanOpening } from '@building/building-geometry';

export const points = (polygon: readonly Vec2[]) => polygon.map((p) => `${p.x},${p.z}`).join(' ');

/** Formal SVG objects retain stable IDs; pointer previews never rerender this memoized layer. */
export const PlanScene = memo(function PlanScene({
  document,
  levelId,
  hiddenIds,
  selectedId,
}: {
  document: ProjectDocument;
  levelId: string;
  hiddenIds: string[];
  selectedId?: string;
}) {
  const walls = useMemo(() => buildPlanWallFootprints(document, levelId), [document, levelId]);
  return (
    <g className="plan-scene">
      {document.slabs
        .filter((s) => s.levelId === levelId && !hiddenIds.includes(s.id))
        .map((slab) => (
          <polygon
            key={slab.id}
            data-object-id={slab.id}
            points={points(slab.polygon)}
            className="plan-slab"
            data-selected={slab.id === selectedId}
          />
        ))}
      {walls
        .filter((w) => !hiddenIds.includes(w.wallId))
        .map((wall) => (
          <g
            key={wall.wallId}
            data-object-id={wall.wallId}
            data-selected={wall.wallId === selectedId}
            className="plan-wall"
          >
            <polygon points={points(wall.polygon)} />
            {(() => {
              const axis = document.walls.find((item) => item.id === wall.wallId)!;
              return (
                <line
                  className="plan-hit"
                  x1={axis.start.x}
                  y1={axis.start.z}
                  x2={axis.end.x}
                  y2={axis.end.z}
                />
              );
            })()}
            {wall.edges.map((edge, index) => (
              <line
                key={index}
                x1={edge.start.x}
                y1={edge.start.z}
                x2={edge.end.x}
                y2={edge.end.z}
              />
            ))}
          </g>
        ))}
      {document.openings
        .filter(
          (o) =>
            o.levelId === levelId && !hiddenIds.includes(o.id) && !hiddenIds.includes(o.wallId),
        )
        .map((opening) => {
          const host = document.walls.find((wall) => wall.id === opening.wallId);
          if (!host) {
            return null;
          }
          const symbol = derivePlanOpening(host, opening);
          return (
            <g
              key={opening.id}
              data-object-id={opening.id}
              data-selected={opening.id === selectedId}
              className="plan-opening"
            >
              <polygon className="plan-opening-gap" points={points(symbol.polygon)} />
              {opening.kind === 'door' ? (
                <>
                  <polyline className="plan-swing" points={points(symbol.swing)} />
                  <line
                    x1={symbol.hinge.x}
                    y1={symbol.hinge.z}
                    x2={symbol.leafEnd.x}
                    y2={symbol.leafEnd.z}
                  />
                  <line
                    className="plan-swing"
                    x1={symbol.hinge.x}
                    y1={symbol.hinge.z}
                    x2={symbol.swing.at(-1)!.x}
                    y2={symbol.swing.at(-1)!.z}
                  />
                </>
              ) : (
                <line x1={symbol.start.x} y1={symbol.start.z} x2={symbol.end.x} y2={symbol.end.z} />
              )}
            </g>
          );
        })}
    </g>
  );
});

const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2, useGrouping: false });
export const dimension = (value: number) => `${number.format(value)} m`;

/** Handles use screen-equivalent radii while dimension values always come from physical geometry. */
export function PlanSelection({
  document,
  selectedId,
  scale,
  editable,
}: {
  document: ProjectDocument;
  selectedId?: string;
  scale: number;
  editable: boolean;
}) {
  const wall = document.walls.find((w) => w.id === selectedId);
  const slab = document.slabs.find((s) => s.id === selectedId);
  const opening = document.openings.find((o) => o.id === selectedId);
  const handles = wall ? [wall.start, wall.end] : (slab?.polygon ?? []);
  const labels = wall
    ? [{ a: wall.start, b: wall.end }]
    : slab
      ? [
          { a: slab.polygon[0]!, b: slab.polygon[1]! },
          { a: slab.polygon[1]!, b: slab.polygon[2]! },
        ]
      : [];
  return (
    <g className="plan-selection">
      {labels.map(({ a, b }, i) => (
        <g key={i}>
          <line x1={a.x} y1={a.z} x2={b.x} y2={b.z} />
          <text x={(a.x + b.x) / 2} y={(a.z + b.z) / 2 - 12 / scale} fontSize={12 / scale}>
            {dimension(Math.hypot(b.x - a.x, b.z - a.z))}
          </text>
        </g>
      ))}
      {editable &&
        handles.map((p, i) => (
          <circle
            key={i}
            data-object-id={selectedId}
            data-handle={wall ? (i === 0 ? 'start' : 'end') : i}
            cx={p.x}
            cy={p.z}
            r={6 / scale}
          />
        ))}
      {opening &&
        (() => {
          const host = document.walls.find((w) => w.id === opening.wallId);
          if (!host) {
            return null;
          }
          const shape = derivePlanOpening(host, opening);
          return (
            <text
              x={(shape.start.x + shape.end.x) / 2}
              y={(shape.start.z + shape.end.z) / 2 - 14 / scale}
              fontSize={12 / scale}
            >
              {dimension(opening.width)}
            </text>
          );
        })()}
    </g>
  );
}
