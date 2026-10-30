import { DEFAULTS, rectanglePolygon } from '@building/editor-core';
import type { ProjectDocument } from '@building/editor-core';
import { derivePlanOpening } from '@building/building-geometry';
import { points, dimension } from './PlanScene';
import type { PlanPreview } from './interaction';

/** A small transient overlay avoids rendering or validating the formal scene on pointer frames. */
export function PlanDraft({
  preview,
  document,
  scale,
}: {
  preview: PlanPreview | null;
  document: ProjectDocument;
  scale: number;
}) {
  if (!preview) {
    return null;
  }
  const object = preview.object;
  let polygon;
  if (object && 'start' in object) {
    const h = object.thickness / 2;
    polygon =
      Math.abs(object.end.x - object.start.x) >= Math.abs(object.end.z - object.start.z)
        ? rectanglePolygon(
            { x: object.start.x, z: object.start.z - h },
            { x: object.end.x, z: object.end.z + h },
          )
        : rectanglePolygon(
            { x: object.start.x - h, z: object.start.z },
            { x: object.end.x + h, z: object.end.z },
          );
  } else if (object && 'polygon' in object) {
    polygon = object.polygon;
  } else if (object && 'wallId' in object) {
    const host = document.walls.find((wall) => wall.id === object.wallId);
    if (host) {
      polygon = derivePlanOpening(host, object).polygon;
    }
  }
  return (
    <g className="plan-draft">
      {polygon && <polygon points={points(polygon)} />}
      {preview.start && preview.point && (
        <>
          <line
            x1={preview.start.x}
            y1={preview.start.z}
            x2={preview.point.x}
            y2={preview.point.z}
          />
          <text
            x={(preview.start.x + preview.point.x) / 2}
            y={(preview.start.z + preview.point.z) / 2 - 16 / scale}
            fontSize={12 / scale}
          >
            {dimension(
              Math.hypot(preview.point.x - preview.start.x, preview.point.z - preview.start.z),
            )}
          </text>
        </>
      )}
      {preview.point && (
        <circle className="plan-snap" cx={preview.point.x} cy={preview.point.z} r={4 / scale} />
      )}
      {!object && preview.start && (
        <circle cx={preview.start.x} cy={preview.start.z} r={DEFAULTS.wallThickness / 2} />
      )}
    </g>
  );
}
