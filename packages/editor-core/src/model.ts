/** All distances are metres, all editable angles are degrees. No display state belongs here. */
export interface Vec2 {
  x: number;
  z: number;
}
export interface SurfaceBinding {
  color: string;
  resourceId?: string;
  tileWidth: number;
  tileHeight: number;
  rotation: number;
  offsetX: number;
  offsetY: number;
}
export interface Level {
  id: string;
  name: string;
  elevation: number;
  height: number;
}
export interface Wall {
  id: string;
  levelId: string;
  start: Vec2;
  end: Vec2;
  height: number;
  thickness: number;
  /** A is the left side viewed from start towards end; reversal preserves this sign. */
  surfaceOrientation?: 1 | -1;
  materials: { A: SurfaceBinding; B: SurfaceBinding; edge: SurfaceBinding };
}
export interface Slab {
  id: string;
  levelId: string;
  polygon: Vec2[];
  elevation: number;
  thickness: number;
  purpose: 'floor' | 'roof';
  materials: { top: SurfaceBinding; bottom: SurfaceBinding; edge: SurfaceBinding };
}
export interface Opening {
  id: string;
  levelId: string;
  wallId: string;
  kind: 'door' | 'window';
  /** offset is the near edge measured from the host's stable reference start. */
  offset: number;
  width: number;
  height: number;
  sill: number;
  hinge: 'left' | 'right';
  direction: 1 | -1;
  angle: number;
  closedAngle?: number;
  openAngle: number;
  duration: number;
  materials?: { A: SurfaceBinding; B: SurfaceBinding; edge: SurfaceBinding };
}
export interface Resource {
  id: string;
  name: string;
  mime: string;
  dataUrl: string;
}
/** Environment assets are isolated from surface images: HDR/EXR never become wall textures. */
export interface EnvironmentResource {
  id: string;
  name: string;
  mime: 'image/vnd.radiance' | 'image/x-exr' | 'image/png' | 'image/jpeg';
  dataUrl: string;
}
export interface EnvironmentSettings {
  resourceId?: string;
  intensity: number;
  /** Y-axis panorama rotation in degrees. */
  rotation: number;
  background: boolean;
}
export interface ContinuityMember {
  wallId: string;
  side: 'A' | 'B';
  direction: 1 | -1;
}
export interface ContinuityAnchor {
  wallId: string;
  side: 'A' | 'B';
  endpoint: 'start' | 'end';
}
export interface TextureContinuity {
  id: string;
  members: ContinuityMember[];
  anchor: ContinuityAnchor;
  verticalOrigin: number;
  /** A designated closure seam preserves physical tile size for a nonintegral loop. */
  seam?: ContinuityAnchor;
}
export interface ProjectDocument {
  schemaVersion: 1;
  id: string;
  name: string;
  revision: number;
  levels: Level[];
  walls: Wall[];
  slabs: Slab[];
  openings: Opening[];
  resources: Resource[];
  continuity: TextureContinuity[];
  /** Absent in existing v1 projects; loading does not silently install lighting. */
  environment?: EnvironmentSettings;
  environmentResources?: EnvironmentResource[];
}
export function defaultEnvironmentSettings(): EnvironmentSettings {
  return { intensity: 1, rotation: 0, background: false };
}
/** Reads compatibility defaults for legacy v1 files without installing lighting into the document. */
export function getEnvironmentSettings(document: ProjectDocument): EnvironmentSettings {
  return document.environment ?? defaultEnvironmentSettings();
}
export const DEFAULTS = Object.freeze({
  levelHeight: 3,
  wallHeight: 2.8,
  wallThickness: 0.2,
  slabThickness: 0.2,
  grid: 0.1,
  doorWidth: 0.9,
  doorHeight: 2.1,
  windowWidth: 1.2,
  windowHeight: 1.1,
  windowSill: 0.9,
  openAngle: 90,
  animationDuration: 1,
});
let nextId = 0;
/** Creates process-local domain IDs without depending on browser or host APIs. */
export function createId(prefix = 'object'): string {
  nextId += 1;
  return `${prefix}_${Date.now().toString(36)}_${nextId.toString(36)}`;
}
/** Creates an independent material binding with physical tile sizes in metres. */
export function defaultSurface(color = '#ded8cd'): SurfaceBinding {
  return { color, tileWidth: 0.5, tileHeight: 0.5, rotation: 0, offsetX: 0, offsetY: 0 };
}
export function defaultWallMaterials(): Wall['materials'] {
  return { A: defaultSurface(), B: defaultSurface('#eee9df'), edge: defaultSurface('#d3cbbc') };
}
export function defaultSlabMaterials(): Slab['materials'] {
  return {
    top: defaultSurface('#9c8262'),
    bottom: defaultSurface('#eee9df'),
    edge: defaultSurface('#a89981'),
  };
}
export function defaultOpeningMaterials(): NonNullable<Opening['materials']> {
  return {
    A: defaultSurface('#b28a5e'),
    B: defaultSurface('#b28a5e'),
    edge: defaultSurface('#8a6a49'),
  };
}
export function wallLength(wall: Pick<Wall, 'start' | 'end'>): number {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z);
}
/** Normalizes either diagonal order into the formal rectangular footprint. */
export function rectanglePolygon(a: Vec2, b: Vec2): Vec2[] {
  const minX = Math.min(a.x, b.x),
    maxX = Math.max(a.x, b.x);
  const minZ = Math.min(a.z, b.z),
    maxZ = Math.max(a.z, b.z);
  return [
    { x: minX, z: minZ },
    { x: maxX, z: minZ },
    { x: maxX, z: maxZ },
    { x: minX, z: maxZ },
  ];
}
/** Creates editable parameters with one floor; no walls, slabs or automatic roof are inferred. */
export function createEmptyProject(name = 'Untitled'): ProjectDocument {
  return {
    schemaVersion: 1,
    id: createId('project'),
    name,
    revision: 0,
    levels: [{ id: 'level_1', name: '1', elevation: 0, height: DEFAULTS.levelHeight }],
    walls: [],
    slabs: [],
    openings: [],
    resources: [],
    continuity: [],
  };
}
/** Creates caller-owned wall parameters; committing them through Core validates orthogonal topology. */
export function createWall(levelId: string, start: Vec2, end: Vec2): Wall {
  return {
    id: createId('wall'),
    levelId,
    start: { ...start },
    end: { ...end },
    height: DEFAULTS.wallHeight,
    thickness: DEFAULTS.wallThickness,
    surfaceOrientation: 1,
    materials: defaultWallMaterials(),
  };
}
/** Creates a thick rectangular slab whose explicit elevation and purpose survive project loading. */
export function createSlab(
  levelId: string,
  a: Vec2,
  b: Vec2,
  elevation = 0,
  purpose: Slab['purpose'] = 'floor',
): Slab {
  return {
    id: createId('slab'),
    levelId,
    polygon: rectanglePolygon(a, b),
    elevation,
    thickness: DEFAULTS.slabThickness,
    purpose,
    materials: defaultSlabMaterials(),
  };
}
/** Creates hosted opening/animation parameters; host clearance is validated when Core installs them. */
export function createOpening(wall: Wall, kind: Opening['kind'], offset: number): Opening {
  return {
    id: createId(kind),
    levelId: wall.levelId,
    wallId: wall.id,
    kind,
    offset,
    width: kind === 'door' ? DEFAULTS.doorWidth : DEFAULTS.windowWidth,
    height: kind === 'door' ? DEFAULTS.doorHeight : DEFAULTS.windowHeight,
    sill: kind === 'door' ? 0 : DEFAULTS.windowSill,
    hinge: 'left',
    direction: 1,
    angle: 0,
    closedAngle: 0,
    openAngle: DEFAULTS.openAngle,
    duration: DEFAULTS.animationDuration,
    materials: defaultOpeningMaterials(),
  };
}
/** Editable example; every mesh is generated from these parameters by the runtime. */
export function createExampleProject(): ProjectDocument {
  const doc = createEmptyProject('Courtyard');
  doc.levels.push({ id: 'level_2', name: '2', elevation: 3, height: 3 });
  for (const level of doc.levels) {
    const points = [
      { x: -3, z: -2 },
      { x: 3, z: -2 },
      { x: 3, z: 2 },
      { x: -3, z: 2 },
    ];
    const walls = points.map((p, index) =>
      createWall(level.id, p, points[(index + 1) % points.length]!),
    );
    doc.walls.push(...walls);
    doc.slabs.push(createSlab(level.id, points[0]!, points[2]!, level.elevation));
    const door = createOpening(walls[0]!, 'door', 1.2);
    if (level.id === 'level_2') {
      door.hinge = 'right';
      door.direction = -1;
      door.angle = 45;
    }
    doc.openings.push(door, createOpening(walls[1]!, 'window', 1.2));
  }
  doc.slabs.push(createSlab('level_2', { x: -3, z: -2 }, { x: 3, z: 2 }, 6, 'roof'));
  return doc;
}

/** Builds a closed two-storey courtyard house with a real roof ring and open sky court. */
export function createCourtyardProject(name = 'Courtyard House'): ProjectDocument {
  const doc = createEmptyProject(name);
  doc.levels.push({ id: 'level_2', name: '2', elevation: 3, height: 3 });
  const outer = [
    ['rear', { x: -7, z: -6 }, { x: 7, z: -6 }],
    ['right', { x: 7, z: -6 }, { x: 7, z: 6 }],
    ['front', { x: 7, z: 6 }, { x: -7, z: 6 }],
    ['left', { x: -7, z: 6 }, { x: -7, z: -6 }],
  ] as const;
  const inner = [
    ['south', { x: -3, z: -2.5 }, { x: 3, z: -2.5 }],
    ['east', { x: 3, z: -2.5 }, { x: 3, z: 2.5 }],
    ['north', { x: 3, z: 2.5 }, { x: -3, z: 2.5 }],
    ['west', { x: -3, z: 2.5 }, { x: -3, z: -2.5 }],
  ] as const;
  const wings = [
    [
      { x: -7, z: -6 },
      { x: 7, z: -2.5 },
    ],
    [
      { x: -7, z: 2.5 },
      { x: 7, z: 6 },
    ],
    [
      { x: -7, z: -2.5 },
      { x: -3, z: 2.5 },
    ],
    [
      { x: 3, z: -2.5 },
      { x: 7, z: 2.5 },
    ],
  ] as const;
  const addWall = (levelId: string, prefix: string, name: string, start: Vec2, end: Vec2) => {
    const wall = createWall(levelId, start, end);
    wall.id = `${levelId}_${prefix}_${name}`;
    wall.materials = {
      A: defaultSurface('#e9dfd2'),
      B: defaultSurface('#a95f47'),
      edge: defaultSurface('#4c3d38'),
    };
    doc.walls.push(wall);
    return wall;
  };
  const addOpening = (wall: Wall, id: string, kind: Opening['kind'], offset: number, angle = 0) => {
    const opening = createOpening(wall, kind, offset);
    opening.id = id;
    opening.width = kind === 'door' ? 1.5 : 1.2;
    opening.height = kind === 'door' ? 2.2 : 1.1;
    opening.sill = kind === 'door' ? 0 : 0.9;
    opening.angle = angle;
    opening.materials = {
      A: defaultSurface(kind === 'door' ? '#b8794f' : '#9fc4cb'),
      B: defaultSurface(kind === 'door' ? '#7b4d38' : '#9fc4cb'),
      edge: defaultSurface(kind === 'door' ? '#3d2b25' : '#556b73'),
    };
    doc.openings.push(opening);
  };
  const addSlabs = (levelId: string, elevation: number, prefix: string) => {
    wings.forEach(([a, b], index) => {
      const slab = createSlab(levelId, a, b, elevation);
      slab.id = `${levelId}_${prefix}_wing_${index + 1}`;
      slab.materials.top = defaultSurface('#b8875a');
      slab.materials.bottom = defaultSurface('#f1eee7');
      slab.materials.edge = defaultSurface('#5c4a42');
      doc.slabs.push(slab);
    });
  };
  for (const level of doc.levels) {
    const outerWalls = new Map(
      outer.map(([name, start, end]) => [name, addWall(level.id, 'outer', name, start, end)]),
    );
    const innerWalls = new Map(
      inner.map(([name, start, end]) => [name, addWall(level.id, 'inner', name, start, end)]),
    );
    addSlabs(level.id, level.elevation, 'floor');
    addOpening(
      outerWalls.get('front')!,
      `${level.id}_front_door`,
      'door',
      6.25,
      level.id === 'level_2' ? 30 : 0,
    );
    addOpening(
      innerWalls.get('south')!,
      `${level.id}_court_door`,
      'door',
      2.25,
      level.id === 'level_2' ? 20 : 0,
    );
    addOpening(outerWalls.get('rear')!, `${level.id}_rear_window_l`, 'window', 2.2);
    addOpening(outerWalls.get('rear')!, `${level.id}_rear_window_r`, 'window', 10.4);
    addOpening(outerWalls.get('right')!, `${level.id}_right_window`, 'window', 5.2);
    addOpening(outerWalls.get('left')!, `${level.id}_left_window`, 'window', 5.2);
    addOpening(innerWalls.get('east')!, `${level.id}_court_window_e`, 'window', 1.8);
    addOpening(innerWalls.get('west')!, `${level.id}_court_window_w`, 'window', 1.8);
  }
  const courtyard = createSlab('level_1', { x: -3, z: -2.5 }, { x: 3, z: 2.5 }, 0);
  courtyard.id = 'level_1_courtyard_paving';
  courtyard.materials.top = defaultSurface('#b8a58a');
  courtyard.materials.bottom = defaultSurface('#b8a58a');
  courtyard.materials.edge = defaultSurface('#6e5b4b');
  doc.slabs.push(courtyard);
  addSlabs('level_2', 6, 'roof');
  for (const slab of doc.slabs.filter((item) => item.id.startsWith('level_2_roof_'))) {
    slab.purpose = 'roof';
    slab.materials.top = defaultSurface('#b46c4f');
  }
  return doc;
}
