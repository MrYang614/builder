//! Strict formal document validation prevents lossy saves of unsupported data.
use crate::{
    environment_assets::decode_environment_resource,
    image_assets::decode_resource,
    storage::{AppError, Resource, Result, MAX_ENTITIES},
};
use serde::Deserialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ProjectSchema {
    schema_version: u64,
    id: String,
    name: String,
    revision: u64,
    levels: Vec<Level>,
    walls: Vec<Wall>,
    slabs: Vec<Slab>,
    openings: Vec<Opening>,
    resources: Vec<Resource>,
    continuity: Vec<Continuity>,
    environment: Option<EnvironmentSettings>,
    environment_resources: Option<Vec<Resource>>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct EnvironmentSettings {
    resource_id: Option<String>,
    intensity: f64,
    rotation: f64,
    background: bool,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub(crate) struct Point {
    pub(crate) x: f64,
    pub(crate) z: f64,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Level {
    id: String,
    name: String,
    elevation: f64,
    height: f64,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Surface {
    color: String,
    resource_id: Option<String>,
    tile_width: f64,
    tile_height: f64,
    rotation: f64,
    offset_x: f64,
    offset_y: f64,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct WallMaterials {
    #[serde(rename = "A")]
    a: Surface,
    #[serde(rename = "B")]
    b: Surface,
    edge: Surface,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SlabMaterials {
    top: Surface,
    bottom: Surface,
    edge: Surface,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct Wall {
    id: String,
    pub(crate) level_id: String,
    pub(crate) start: Point,
    pub(crate) end: Point,
    height: f64,
    pub(crate) thickness: f64,
    surface_orientation: Option<i8>,
    materials: WallMaterials,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Slab {
    id: String,
    level_id: String,
    polygon: Vec<Point>,
    elevation: f64,
    thickness: f64,
    purpose: String,
    materials: SlabMaterials,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Opening {
    id: String,
    level_id: String,
    wall_id: String,
    kind: String,
    offset: f64,
    width: f64,
    height: f64,
    sill: f64,
    hinge: String,
    direction: i8,
    angle: f64,
    closed_angle: Option<f64>,
    open_angle: f64,
    duration: f64,
    materials: Option<WallMaterials>,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Member {
    wall_id: String,
    side: String,
    direction: i8,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Anchor {
    wall_id: String,
    side: String,
    endpoint: String,
}
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Continuity {
    id: String,
    members: Vec<Member>,
    anchor: Anchor,
    vertical_origin: f64,
    seam: Option<Anchor>,
}

fn invalid(details: impl Into<String>) -> AppError {
    AppError::new("invalid_project", details)
}
fn identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 128
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}
fn bounded(value: f64) -> bool {
    value.is_finite() && value.abs() <= 100_000.0
}
fn positive(value: f64) -> bool {
    bounded(value) && value > 1e-7 && value <= 10_000.0
}
fn point(value: &Point) -> bool {
    bounded(value.x) && bounded(value.z)
}
fn same_point(a: &Point, b: &Point) -> bool {
    (a.x - b.x).abs() < 1e-7 && (a.z - b.z).abs() < 1e-7
}
fn rectangle_polygon(polygon: &[Point]) -> bool {
    polygon.iter().enumerate().all(|(index, point)| {
        let next = &polygon[(index + 1) % polygon.len()];
        !same_point(point, next)
            && ((point.x - next.x).abs() <= 1e-7 || (point.z - next.z).abs() <= 1e-7)
    }) && (polygon[0].x - polygon[2].x).abs() >= 0.05
        && (polygon[0].z - polygon[2].z).abs() >= 0.05
}
fn direction(value: i8) -> bool {
    value == 1 || value == -1
}
fn side(value: &str) -> bool {
    value == "A" || value == "B"
}
fn surface(value: &Surface, resources: &HashSet<&str>, allow_image: bool) -> Result<()> {
    if value.color.len() != 7
        || !value.color.starts_with('#')
        || !value.color[1..].bytes().all(|c| c.is_ascii_hexdigit())
    {
        return Err(invalid(
            "Material color must be a six-digit hexadecimal value",
        ));
    }
    if !positive(value.tile_width)
        || !positive(value.tile_height)
        || !bounded(value.rotation)
        || !bounded(value.offset_x)
        || !bounded(value.offset_y)
    {
        return Err(invalid("Invalid physical texture parameters"));
    }
    if let Some(id) = &value.resource_id {
        if !allow_image {
            return Err(invalid("Thickness surfaces must use solid colors"));
        }
        if !resources.contains(id.as_str()) {
            return Err(AppError::new("missing_resource", id));
        }
    }
    Ok(())
}
fn wall_materials(value: &WallMaterials, resources: &HashSet<&str>) -> Result<()> {
    surface(&value.a, resources, true)?;
    surface(&value.b, resources, true)?;
    surface(&value.edge, resources, false)
}

/// Strict schema check keeps unknown future fields from being discarded and overwritten.
pub fn validate_document(doc: &Value) -> Result<()> {
    if ["environment", "environmentResources"]
        .iter()
        .any(|key| doc.get(key).is_some_and(Value::is_null))
    {
        return Err(AppError::new(
            "environment.invalid",
            "Environment fields cannot be null",
        ));
    }
    if doc.get("schemaVersion").and_then(Value::as_u64) != Some(1) {
        return Err(AppError::new(
            "unsupported_version",
            "Only project schema version 1 is supported",
        ));
    }
    let schema: ProjectSchema = serde_json::from_value(doc.clone()).map_err(|e| {
        AppError::new(
            if e.to_string().contains("unknown field") {
                "unknown_fields"
            } else {
                "invalid_project"
            },
            e.to_string(),
        )
    })?;
    if schema.schema_version != 1
        || !identifier(&schema.id)
        || schema.name.len() > 4096
        || schema.revision > 9_007_199_254_740_991
    {
        return Err(invalid("Invalid project identity or revision"));
    }
    let entity_count = schema.levels.len()
        + schema.walls.len()
        + schema.slabs.len()
        + schema.openings.len()
        + schema.resources.len()
        + schema.environment_resources.as_ref().map_or(0, Vec::len)
        + schema.continuity.len();
    if schema.levels.is_empty() || entity_count > MAX_ENTITIES {
        return Err(invalid("Project object count exceeds supported bounds"));
    }
    let mut ids = HashSet::new();
    for id in schema
        .levels
        .iter()
        .map(|v| &v.id)
        .chain(schema.walls.iter().map(|v| &v.id))
        .chain(schema.slabs.iter().map(|v| &v.id))
        .chain(schema.openings.iter().map(|v| &v.id))
        .chain(schema.resources.iter().map(|v| &v.id))
        .chain(schema.continuity.iter().map(|v| &v.id))
        .chain(schema.environment_resources.iter().flatten().map(|v| &v.id))
    {
        if !identifier(id) || !ids.insert(id.as_str()) {
            return Err(invalid("Missing or duplicate stable object ID"));
        }
    }
    let levels: HashSet<&str> = schema.levels.iter().map(|v| v.id.as_str()).collect();
    let resources: HashSet<&str> = schema.resources.iter().map(|v| v.id.as_str()).collect();
    if schema
        .environment_resources
        .as_ref()
        .is_some_and(|resources| resources.len() > 128)
    {
        return Err(AppError::new(
            "environment.invalid",
            "Too many environment resources",
        ));
    }
    if let Some(environment) = &schema.environment {
        if !environment.intensity.is_finite()
            || !(0.0..=10.0).contains(&environment.intensity)
            || !environment.rotation.is_finite()
            || !(0.0..=360.0).contains(&environment.rotation)
        {
            return Err(AppError::new(
                "environment.invalid",
                "Invalid environment intensity or rotation",
            ));
        }
        // Reading this formal field verifies its type without applying display settings.
        let _background = environment.background;
        if let Some(id) = &environment.resource_id {
            if !schema
                .environment_resources
                .iter()
                .flatten()
                .any(|resource| &resource.id == id)
            {
                return Err(AppError::new("environment.resourceMissing", id));
            }
        }
    }
    let walls: HashMap<&str, &Wall> = schema.walls.iter().map(|v| (v.id.as_str(), v)).collect();
    if !crate::project_topology::validate_wall_pairs(&schema.walls) {
        return Err(invalid("Invalid wall topology"));
    }
    for level in &schema.levels {
        if level.name.len() > 4096 || !bounded(level.elevation) || !positive(level.height) {
            return Err(invalid("Invalid level parameters"));
        }
    }
    for wall in &schema.walls {
        let dx = wall.end.x - wall.start.x;
        let dz = wall.end.z - wall.start.z;
        if !levels.contains(wall.level_id.as_str())
            || !point(&wall.start)
            || !point(&wall.end)
            || dx.hypot(dz) < 0.05
            || (dx.abs() > 0.000001 && dz.abs() > 0.000001)
            || !positive(wall.height)
            || !positive(wall.thickness)
            || wall.surface_orientation.is_some_and(|v| !direction(v))
        {
            return Err(invalid(format!("Invalid wall {}", wall.id)));
        }
        wall_materials(&wall.materials, &resources)?;
    }
    for slab in &schema.slabs {
        if !levels.contains(slab.level_id.as_str())
            || slab.polygon.len() != 4
            || !slab.polygon.iter().all(point)
            || !rectangle_polygon(&slab.polygon)
            || !bounded(slab.elevation)
            || !positive(slab.thickness)
            || !matches!(slab.purpose.as_str(), "floor" | "roof")
        {
            return Err(invalid(format!("Invalid slab {}", slab.id)));
        }
        surface(&slab.materials.top, &resources, true)?;
        surface(&slab.materials.bottom, &resources, true)?;
        surface(&slab.materials.edge, &resources, false)?;
    }
    for opening in &schema.openings {
        let Some(wall) = walls.get(opening.wall_id.as_str()) else {
            return Err(invalid(format!("Missing host for {}", opening.id)));
        };
        let length = (wall.end.x - wall.start.x).hypot(wall.end.z - wall.start.z);
        if opening.level_id != wall.level_id
            || !matches!(opening.kind.as_str(), "door" | "window")
            || !matches!(opening.hinge.as_str(), "left" | "right")
            || !direction(opening.direction)
            || !bounded(opening.offset)
            || opening.offset < 1e-7
            || !positive(opening.width)
            || !positive(opening.height)
            || !bounded(opening.sill)
            || opening.sill < 0.0
            || opening.offset + opening.width > length - 1e-7
            || opening.sill + opening.height > wall.height + 1e-7
            || (opening.kind == "door" && opening.sill != 0.0)
            || !bounded(opening.angle)
            || opening.angle.abs() > 180.0
            || !bounded(opening.open_angle)
            || opening.open_angle.abs() > 180.0
            || opening
                .closed_angle
                .is_some_and(|v| !bounded(v) || v.abs() > 180.0)
            || !positive(opening.duration)
        {
            return Err(invalid(format!("Invalid opening {}", opening.id)));
        }
        let dx = (wall.end.x - wall.start.x) / length;
        let dz = (wall.end.z - wall.start.z) / length;
        for neighbor in schema
            .walls
            .iter()
            .filter(|candidate| candidate.id != wall.id && candidate.level_id == wall.level_id)
        {
            if opening.sill >= neighbor.height - 1e-7
                || (dx * (neighbor.end.x - neighbor.start.x)
                    + dz * (neighbor.end.z - neighbor.start.z))
                    .abs()
                    > 1e-7
            {
                continue;
            }
            let junction = if dx.abs() > 0.9 {
                Point {
                    x: neighbor.start.x,
                    z: wall.start.z,
                }
            } else {
                Point {
                    x: wall.start.x,
                    z: neighbor.start.z,
                }
            };
            if !crate::project_topology::point_on_segment(&junction, wall)
                || !crate::project_topology::point_on_segment(&junction, neighbor)
            {
                continue;
            }
            let offset = (junction.x - wall.start.x) * dx + (junction.z - wall.start.z) * dz;
            let clearance = neighbor.thickness / 2.0 + 0.01;
            if opening.offset < offset + clearance - 1e-7
                && opening.offset + opening.width > offset - clearance + 1e-7
            {
                return Err(invalid(format!(
                    "Opening {} conflicts with wall junction",
                    opening.id
                )));
            }
        }
        if let Some(materials) = &opening.materials {
            wall_materials(materials, &resources)?;
        }
    }
    for (index, opening) in schema.openings.iter().enumerate() {
        for other in schema
            .openings
            .iter()
            .skip(index + 1)
            .filter(|other| other.wall_id == opening.wall_id)
        {
            let horizontal_gap = (opening.offset + opening.width).min(other.offset + other.width)
                - opening.offset.max(other.offset);
            let vertical_gap = (opening.sill + opening.height).min(other.sill + other.height)
                - opening.sill.max(other.sill);
            if horizontal_gap > -0.08 && vertical_gap > -0.08 {
                return Err(invalid("Wall openings overlap"));
            }
        }
    }
    for group in &schema.continuity {
        if group.members.is_empty()
            || group.members.len() > MAX_ENTITIES
            || !bounded(group.vertical_origin)
        {
            return Err(invalid("Invalid continuity group"));
        }
        let mut members = HashSet::new();
        for member in &group.members {
            if !walls.contains_key(member.wall_id.as_str())
                || !side(&member.side)
                || !direction(member.direction)
                || !members.insert((member.wall_id.as_str(), member.side.as_str()))
            {
                return Err(invalid("Invalid continuity member"));
            }
        }
        for anchor in std::iter::once(&group.anchor).chain(group.seam.iter()) {
            if !members.contains(&(anchor.wall_id.as_str(), anchor.side.as_str()))
                || !matches!(anchor.endpoint.as_str(), "start" | "end")
            {
                return Err(invalid("Invalid continuity anchor or seam"));
            }
        }
    }
    for resource in &schema.resources {
        decode_resource(resource)?;
    }
    for resource in schema.environment_resources.iter().flatten() {
        decode_environment_resource(resource)?;
    }
    Ok(())
}
