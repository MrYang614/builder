//! Portable project IO. Runtime geometry and application settings never enter a project.
use crate::environment_assets::{
    decode_environment_resource, environment_extension, validate_environment,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use image::{ImageFormat, ImageReader};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs::{self, File},
    io::{Cursor, Read, Seek, Write},
    path::{Path, PathBuf},
};
use tempfile::NamedTempFile;
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

pub const MAX_PROJECT_BYTES: u64 = 256 * 1024 * 1024;
pub const MAX_IMAGE_BYTES: usize = 32 * 1024 * 1024;
pub const MAX_ENVIRONMENT_BYTES: usize = 64 * 1024 * 1024;
const MAX_JSON_BYTES: u64 = 32 * 1024 * 1024;
const MAX_ENTITIES: usize = 20_000;

#[derive(Debug, Clone, Serialize)]
pub struct AppError {
    pub code: String,
    pub details: String,
}
impl AppError {
    pub fn new(code: &str, details: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            details: details.into(),
        }
    }
    pub(crate) fn io(error: std::io::Error, operation: &str) -> Self {
        let code = match error.kind() {
            std::io::ErrorKind::PermissionDenied => "permission_denied",
            std::io::ErrorKind::NotFound => "file_not_found",
            _ if matches!(error.raw_os_error(), Some(28 | 112)) => "disk_full",
            _ => operation,
        };
        Self::new(code, error.to_string())
    }
}
type Result<T> = std::result::Result<T, AppError>;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Resource {
    pub id: String,
    pub name: String,
    pub mime: String,
    #[serde(rename = "dataUrl")]
    pub data_url: String,
}
#[derive(Debug, Clone, Serialize)]
pub struct ResourceMetadata {
    pub id: String,
    pub name: String,
    pub mime: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct StoredResource {
    id: String,
    name: String,
    mime: String,
    path: String,
    sha256: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Settings {
    pub theme_mode: String,
    pub language: String,
    #[serde(default = "default_renderer_backend")]
    pub renderer_backend: String,
}
fn default_renderer_backend() -> String {
    "webgl".into()
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            theme_mode: "light".into(),
            language: "zh-CN".into(),
            renderer_backend: default_renderer_backend(),
        }
    }
}

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
struct Point {
    x: f64,
    z: f64,
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
struct Wall {
    id: String,
    level_id: String,
    start: Point,
    end: Point,
    height: f64,
    thickness: f64,
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
    !value.is_empty() && value.len() <= 512 && !value.contains('\0')
}
fn bounded(value: f64) -> bool {
    value.is_finite() && value.abs() <= 100_000.0
}
fn positive(value: f64) -> bool {
    bounded(value) && value > 0.0
}
fn point(value: &Point) -> bool {
    bounded(value.x) && bounded(value.z)
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
            || dx.hypot(dz) < 0.001
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
            || opening.offset < 0.0
            || !positive(opening.width)
            || !positive(opening.height)
            || !bounded(opening.sill)
            || opening.sill < 0.0
            || opening.offset + opening.width > length + 0.000001
            || opening.sill + opening.height > wall.height + 0.000001
            || (opening.kind == "door" && opening.sill != 0.0)
            || !bounded(opening.angle)
            || !bounded(opening.open_angle)
            || opening.closed_angle.is_some_and(|v| !bounded(v))
            || !positive(opening.duration)
        {
            return Err(invalid(format!("Invalid opening {}", opening.id)));
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
            if opening.offset < other.offset + other.width
                && other.offset < opening.offset + opening.width
                && opening.sill < other.sill + other.height
                && other.sill < opening.sill + opening.height
            {
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

fn image_format(mime: &str) -> Result<ImageFormat> {
    match mime {
        "image/png" => Ok(ImageFormat::Png),
        "image/jpeg" => Ok(ImageFormat::Jpeg),
        _ => Err(AppError::new(
            "invalid_image",
            "Only PNG and JPEG images are supported",
        )),
    }
}
fn validate_image(bytes: &[u8], mime: &str) -> Result<()> {
    if bytes.is_empty() || bytes.len() > MAX_IMAGE_BYTES {
        return Err(AppError::new("resource_too_large", "Image limit is 32 MiB"));
    }
    let format = image_format(mime)?;
    if image::guess_format(bytes).map_err(|e| AppError::new("invalid_image", e.to_string()))?
        != format
    {
        return Err(AppError::new(
            "invalid_image",
            "Image MIME type does not match its contents",
        ));
    }
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(256 * 1024 * 1024);
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    reader.limits(limits);
    reader
        .decode()
        .map_err(|e| AppError::new("invalid_image", e.to_string()))?;
    Ok(())
}
fn decode_resource(resource: &Resource) -> Result<Vec<u8>> {
    if !identifier(&resource.id)
        || resource.name.len() > 4096
        || resource.data_url.len() > MAX_IMAGE_BYTES * 4 / 3 + 256
    {
        return Err(AppError::new(
            "resource_too_large",
            "Image metadata or content exceeds supported bounds",
        ));
    }
    let prefix = format!("data:{};base64,", resource.mime);
    let encoded = resource.data_url.strip_prefix(&prefix).ok_or_else(|| {
        AppError::new(
            "invalid_image",
            "Project images must contain their own bytes",
        )
    })?;
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|e| AppError::new("invalid_image", e.to_string()))?;
    validate_image(&bytes, &resource.mime)?;
    Ok(bytes)
}
pub fn resource_from_bytes(name: String, mime: String, bytes: &[u8]) -> Result<Resource> {
    let metadata = resource_metadata(name, mime, bytes)?;
    Ok(Resource {
        id: metadata.id,
        name: metadata.name,
        data_url: format!("data:{};base64,{}", metadata.mime, STANDARD.encode(bytes)),
        mime: metadata.mime,
    })
}
pub fn resource_metadata(name: String, mime: String, bytes: &[u8]) -> Result<ResourceMetadata> {
    validate_image(bytes, &mime)?;
    if name.len() > 4096 {
        return Err(AppError::new("invalid_image", "Image filename is too long"));
    }
    Ok(ResourceMetadata {
        id: format!("image_{:x}", Sha256::digest(bytes)),
        name,
        mime,
    })
}
pub fn read_image_bytes(path: &Path) -> Result<Vec<u8>> {
    if !path.is_absolute() {
        return Err(AppError::new("invalid_path", "Image path must be absolute"));
    }
    let meta = fs::metadata(path).map_err(|e| AppError::io(e, "read_failed"))?;
    if !meta.is_file() || meta.len() > MAX_IMAGE_BYTES as u64 {
        return Err(AppError::new("resource_too_large", "Image limit is 32 MiB"));
    }
    let file = File::open(path).map_err(|e| AppError::io(e, "read_failed"))?;
    let mut bytes = Vec::new();
    file.take(MAX_IMAGE_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| AppError::io(e, "read_failed"))?;
    let mime = match image::guess_format(&bytes)
        .map_err(|e| AppError::new("invalid_image", e.to_string()))?
    {
        ImageFormat::Png => "image/png",
        ImageFormat::Jpeg => "image/jpeg",
        _ => {
            return Err(AppError::new(
                "invalid_image",
                "Only PNG and JPEG images are supported",
            ))
        }
    };
    validate_image(&bytes, mime)?;
    Ok(bytes)
}
pub fn import_image(path: &Path) -> Result<Resource> {
    let bytes = read_image_bytes(path)?;
    let mime = if image::guess_format(&bytes)
        .map_err(|e| AppError::new("invalid_image", e.to_string()))?
        == ImageFormat::Png
    {
        "image/png"
    } else {
        "image/jpeg"
    };
    resource_from_bytes(
        path.file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into(),
        mime.into(),
        &bytes,
    )
}

fn verify_path(path: &Path, extension: &str) -> Result<()> {
    if !path.is_absolute()
        || path
            .extension()
            .and_then(|v| v.to_str())
            .is_none_or(|v| !v.eq_ignore_ascii_case(extension))
    {
        return Err(AppError::new(
            "invalid_path",
            format!("Choose an absolute .{extension} file path"),
        ));
    }
    if let Ok(meta) = fs::symlink_metadata(path) {
        if meta.file_type().is_symlink() || !meta.is_file() {
            return Err(AppError::new(
                "invalid_path",
                "Target must be a regular file",
            ));
        }
    }
    let parent = path
        .parent()
        .ok_or_else(|| AppError::new("invalid_path", "File needs a parent directory"))?;
    if !parent.is_dir() {
        return Err(AppError::new(
            "invalid_path",
            "Parent directory does not exist",
        ));
    }
    Ok(())
}

fn write_archive<W: Write + Seek>(writer: W, document: &Value) -> Result<()> {
    validate_document(document)?;
    let resources: Vec<Resource> = serde_json::from_value(document["resources"].clone())
        .map_err(|e| invalid(e.to_string()))?;
    let environments: Vec<Resource> = document
        .get("environmentResources")
        .map(|value| serde_json::from_value(value.clone()))
        .transpose()
        .map_err(|e| invalid(e.to_string()))?
        .unwrap_or_default();
    let mut stored = Vec::with_capacity(resources.len());
    let mut stored_environments = Vec::with_capacity(environments.len());
    let mut unique = HashMap::new();
    let mut total = 0u64;
    for (environment, resource) in resources
        .into_iter()
        .map(|resource| (false, resource))
        .chain(environments.into_iter().map(|resource| (true, resource)))
    {
        let bytes = if environment {
            decode_environment_resource(&resource)?
        } else {
            decode_resource(&resource)?
        };
        let hash = format!("{:x}", Sha256::digest(&bytes));
        let extension = if environment {
            environment_extension(&resource.mime)?
        } else if resource.mime == "image/png" {
            "png"
        } else {
            "jpg"
        };
        let prefix = if environment {
            "environment-resources"
        } else {
            "resources"
        };
        let path = format!("{prefix}/{hash}.{extension}");
        if !unique.contains_key(&path) {
            total += bytes.len() as u64;
            if total > MAX_PROJECT_BYTES {
                return Err(AppError::new(
                    "file_too_large",
                    "Project resource limit is 256 MiB",
                ));
            }
        }
        let entry = StoredResource {
            id: resource.id,
            name: resource.name,
            mime: resource.mime,
            path: path.clone(),
            sha256: hash,
        };
        if environment {
            stored_environments.push(entry);
        } else {
            stored.push(entry);
        }
        unique.entry(path).or_insert(bytes);
    }
    let mut stored_doc = document.clone();
    stored_doc["resources"] = serde_json::to_value(stored).map_err(|e| invalid(e.to_string()))?;
    if document.get("environmentResources").is_some() {
        stored_doc["environmentResources"] =
            serde_json::to_value(stored_environments).map_err(|e| invalid(e.to_string()))?;
    }
    let json = serde_json::to_vec(&stored_doc).map_err(|e| invalid(e.to_string()))?;
    if json.len() as u64 > MAX_JSON_BYTES {
        return Err(AppError::new(
            "file_too_large",
            "Project data limit is 32 MiB",
        ));
    }
    let mut zip = ZipWriter::new(writer);
    let options = SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o600);
    zip.start_file("project.json", options)
        .map_err(|e| AppError::new("write_failed", e.to_string()))?;
    zip.write_all(&json)
        .map_err(|e| AppError::io(e, "write_failed"))?;
    for (path, bytes) in unique {
        zip.start_file(path, options)
            .map_err(|e| AppError::new("write_failed", e.to_string()))?;
        zip.write_all(&bytes)
            .map_err(|e| AppError::io(e, "write_failed"))?;
    }
    zip.finish()
        .map_err(|e| AppError::new("write_failed", e.to_string()))?;
    Ok(())
}

fn read_archive<R: Read + Seek>(reader: R) -> Result<Value> {
    let mut zip =
        ZipArchive::new(reader).map_err(|e| AppError::new("corrupt_project", e.to_string()))?;
    if zip.len() > MAX_ENTITIES + 1 {
        return Err(AppError::new("file_too_large", "Too many archive entries"));
    }
    let mut names = HashSet::new();
    let mut total = 0u64;
    for index in 0..zip.len() {
        let entry = zip
            .by_index(index)
            .map_err(|e| AppError::new("corrupt_project", e.to_string()))?;
        total = total
            .checked_add(entry.size())
            .ok_or_else(|| AppError::new("file_too_large", "Archive size overflow"))?;
        if total > MAX_PROJECT_BYTES + MAX_JSON_BYTES
            || entry.enclosed_name().is_none()
            || entry.name().contains('\\')
            || !names.insert(entry.name().to_owned())
            || entry.is_dir()
            || entry.is_symlink()
        {
            return Err(AppError::new(
                "corrupt_project",
                "Unsafe or duplicated archive entry",
            ));
        }
    }
    let json = {
        let mut entry = zip
            .by_name("project.json")
            .map_err(|e| AppError::new("corrupt_project", e.to_string()))?;
        if entry.size() > MAX_JSON_BYTES {
            return Err(AppError::new(
                "file_too_large",
                "Project JSON exceeds 32 MiB",
            ));
        }
        let mut bytes = Vec::new();
        entry
            .by_ref()
            .take(MAX_JSON_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|e| AppError::new("corrupt_project", e.to_string()))?;
        bytes
    };
    let mut doc: Value = serde_json::from_slice(&json)
        .map_err(|e| AppError::new("corrupt_project", e.to_string()))?;
    if doc.get("schemaVersion").and_then(Value::as_u64) != Some(1) {
        return Err(AppError::new(
            "unsupported_version",
            "Only project schema version 1 is supported",
        ));
    }
    let entries: Vec<StoredResource> = serde_json::from_value(
        doc.get("resources")
            .cloned()
            .ok_or_else(|| invalid("Missing resource list"))?,
    )
    .map_err(|e| invalid(e.to_string()))?;
    let environment_entries: Vec<StoredResource> = doc
        .get("environmentResources")
        .map(|value| serde_json::from_value(value.clone()))
        .transpose()
        .map_err(|e| invalid(e.to_string()))?
        .unwrap_or_default();
    let mut resources = Vec::with_capacity(entries.len());
    let mut environments = Vec::with_capacity(environment_entries.len());
    let mut expected = HashSet::from(["project.json".to_owned()]);
    let mut cache: HashMap<String, Vec<u8>> = HashMap::new();
    for (environment, entry) in entries
        .into_iter()
        .map(|entry| (false, entry))
        .chain(environment_entries.into_iter().map(|entry| (true, entry)))
    {
        let extension = if environment {
            environment_extension(&entry.mime)?
        } else {
            match entry.mime.as_str() {
                "image/png" => "png",
                "image/jpeg" => "jpg",
                _ => {
                    return Err(AppError::new(
                        "invalid_image",
                        "Unsupported archived image format",
                    ))
                }
            }
        };
        let prefix = if environment {
            "environment-resources"
        } else {
            "resources"
        };
        if entry.sha256.len() != 64
            || !entry.sha256.bytes().all(|v| v.is_ascii_hexdigit())
            || entry.path != format!("{prefix}/{}.{extension}", entry.sha256)
        {
            return Err(AppError::new(
                "corrupt_project",
                "Invalid content-addressed resource path",
            ));
        }
        expected.insert(entry.path.clone());
        if !cache.contains_key(&entry.path) {
            let mut file = zip
                .by_name(&entry.path)
                .map_err(|_| AppError::new("missing_resource", &entry.id))?;
            let limit = if environment {
                MAX_ENVIRONMENT_BYTES
            } else {
                MAX_IMAGE_BYTES
            };
            if file.size() > limit as u64 {
                return Err(AppError::new("resource_too_large", "Image exceeds 32 MiB"));
            }
            let mut bytes = Vec::new();
            file.by_ref()
                .take(limit as u64 + 1)
                .read_to_end(&mut bytes)
                .map_err(|e| AppError::new("corrupt_project", e.to_string()))?;
            if format!("{:x}", Sha256::digest(&bytes)) != entry.sha256 {
                return Err(AppError::new(
                    "corrupt_project",
                    "Resource checksum does not match",
                ));
            }
            if environment {
                validate_environment(&bytes, Some(&entry.mime))?;
            } else {
                validate_image(&bytes, &entry.mime)?;
            }
            cache.insert(entry.path.clone(), bytes);
        }
        let resource = Resource {
            id: entry.id,
            name: entry.name,
            data_url: format!(
                "data:{};base64,{}",
                entry.mime,
                STANDARD.encode(&cache[&entry.path])
            ),
            mime: entry.mime,
        };
        if environment {
            environments.push(resource);
        } else {
            resources.push(resource);
        }
    }
    if names != expected {
        return Err(AppError::new(
            "unknown_fields",
            "Archive contains unrecognized files",
        ));
    }
    doc["resources"] = serde_json::to_value(resources).map_err(|e| invalid(e.to_string()))?;
    if doc.get("environmentResources").is_some() {
        doc["environmentResources"] =
            serde_json::to_value(environments).map_err(|e| invalid(e.to_string()))?;
    }
    validate_document(&doc)?;
    Ok(doc)
}

pub fn open_project(path: &Path) -> Result<Value> {
    verify_path(path, "building")?;
    let file = File::open(path).map_err(|e| AppError::io(e, "read_failed"))?;
    if file
        .metadata()
        .map_err(|e| AppError::io(e, "read_failed"))?
        .len()
        > MAX_PROJECT_BYTES
    {
        return Err(AppError::new("file_too_large", "Project exceeds 256 MiB"));
    }
    read_archive(file)
}
pub fn open_project_bytes(path: &Path) -> Result<Vec<u8>> {
    verify_path(path, "building")?;
    let file = File::open(path).map_err(|e| AppError::io(e, "read_failed"))?;
    if file
        .metadata()
        .map_err(|e| AppError::io(e, "read_failed"))?
        .len()
        > MAX_PROJECT_BYTES
    {
        return Err(AppError::new("file_too_large", "Project exceeds 256 MiB"));
    }
    let mut bytes = Vec::new();
    file.take(MAX_PROJECT_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| AppError::io(e, "read_failed"))?;
    if bytes.len() as u64 > MAX_PROJECT_BYTES {
        return Err(AppError::new("file_too_large", "Project exceeds 256 MiB"));
    }
    read_archive(Cursor::new(&bytes))?;
    Ok(bytes)
}

/// Temp data is synced and reopened for validation before an atomic replacement.
/// tempfile::persist uses MoveFileExW(REPLACE_EXISTING) on Windows and rename on Unix.
fn atomic_write(
    path: &Path,
    write: impl FnOnce(&mut File) -> Result<()>,
    verify: impl FnOnce(&Path) -> Result<()>,
) -> Result<()> {
    let parent = path
        .parent()
        .ok_or_else(|| AppError::new("invalid_path", "Missing parent directory"))?;
    let mut temp = NamedTempFile::new_in(parent).map_err(|e| AppError::io(e, "write_failed"))?;
    write(temp.as_file_mut())?;
    temp.as_file()
        .sync_all()
        .map_err(|e| AppError::io(e, "write_failed"))?;
    verify(temp.path())?;
    temp.persist(path)
        .map_err(|e| AppError::io(e.error, "write_failed"))?;
    #[cfg(unix)]
    if let Ok(directory) = File::open(parent) {
        let _ = directory.sync_all();
    }
    Ok(())
}
pub fn save_project(path: &Path, document: &Value) -> Result<()> {
    verify_path(path, "building")?;
    validate_document(document)?;
    atomic_write(
        path,
        |file| write_archive(file, document),
        |temp| {
            let file = File::open(temp).map_err(|e| AppError::io(e, "read_failed"))?;
            if read_archive(file)? != *document {
                return Err(AppError::new(
                    "write_failed",
                    "Project round-trip verification failed",
                ));
            }
            Ok(())
        },
    )
}
pub fn save_project_bytes(path: &Path, bytes: &[u8]) -> Result<()> {
    verify_path(path, "building")?;
    if bytes.len() as u64 > MAX_PROJECT_BYTES {
        return Err(AppError::new("file_too_large", "Project exceeds 256 MiB"));
    }
    read_archive(Cursor::new(bytes))?;
    atomic_write(
        path,
        |file| {
            file.write_all(bytes)
                .map_err(|e| AppError::io(e, "write_failed"))
        },
        |temp| {
            let saved = fs::read(temp).map_err(|e| AppError::io(e, "read_failed"))?;
            read_archive(Cursor::new(&saved))?;
            if saved != bytes {
                return Err(AppError::new(
                    "write_failed",
                    "Project binary verification failed",
                ));
            }
            Ok(())
        },
    )
}

pub fn validate_glb(bytes: &[u8]) -> Result<()> {
    if bytes.len() < 20 || bytes.len() as u64 > MAX_PROJECT_BYTES {
        return Err(AppError::new("invalid_glb", "Invalid GLB size"));
    }
    let u32_at = |index| {
        u32::from_le_bytes(
            bytes[index..index + 4]
                .try_into()
                .expect("validated bounds"),
        )
    };
    if &bytes[..4] != b"glTF" || u32_at(4) != 2 || u32_at(8) as usize != bytes.len() {
        return Err(AppError::new(
            "invalid_glb",
            "GLB header or total length is invalid",
        ));
    }
    let mut offset = 12usize;
    let mut chunks = 0;
    while offset < bytes.len() {
        if offset + 8 > bytes.len() {
            return Err(AppError::new("invalid_glb", "Truncated GLB chunk"));
        }
        let length = u32_at(offset) as usize;
        let kind = u32_at(offset + 4);
        let end = offset
            .checked_add(8)
            .and_then(|v| v.checked_add(length))
            .ok_or_else(|| AppError::new("invalid_glb", "GLB length overflow"))?;
        if length % 4 != 0 || end > bytes.len() {
            return Err(AppError::new(
                "invalid_glb",
                "Invalid GLB chunk alignment or length",
            ));
        }
        if chunks == 0 {
            if kind != 0x4e4f534a {
                return Err(AppError::new(
                    "invalid_glb",
                    "First GLB chunk must contain JSON",
                ));
            }
            let json: Value = serde_json::from_slice(&bytes[offset + 8..end])
                .map_err(|e| AppError::new("invalid_glb", e.to_string()))?;
            if json.pointer("/asset/version").and_then(Value::as_str) != Some("2.0") {
                return Err(AppError::new(
                    "invalid_glb",
                    "glTF asset version must be 2.0",
                ));
            }
        } else if chunks != 1 || kind != 0x004e4942 {
            return Err(AppError::new("invalid_glb", "Unexpected GLB chunk"));
        }
        chunks += 1;
        offset = end;
    }
    Ok(())
}
pub fn save_glb(path: &Path, bytes: &[u8]) -> Result<()> {
    verify_path(path, "glb")?;
    validate_glb(bytes)?;
    atomic_write(
        path,
        |file| {
            file.write_all(bytes)
                .map_err(|e| AppError::io(e, "write_failed"))
        },
        |temp| {
            let saved = fs::read(temp).map_err(|e| AppError::io(e, "read_failed"))?;
            validate_glb(&saved)?;
            if saved != bytes {
                return Err(AppError::new(
                    "write_failed",
                    "GLB round-trip verification failed",
                ));
            }
            Ok(())
        },
    )
}

pub fn settings_path(config_dir: &Path) -> PathBuf {
    config_dir.join("settings.json")
}
pub fn save_render_png(path: &Path, bytes: &[u8]) -> Result<()> {
    verify_path(path, "png")?;
    if bytes.len() < 8 || &bytes[..8] != b"\x89PNG\r\n\x1a\n" {
        return Err(AppError::new(
            "invalid_png",
            "Render export requires PNG bytes",
        ));
    }
    validate_environment(bytes, Some("image/png"))?;
    atomic_write(
        path,
        |file| {
            file.write_all(bytes)
                .map_err(|e| AppError::io(e, "write_failed"))
        },
        |temp| {
            let saved = fs::read(temp).map_err(|e| AppError::io(e, "read_failed"))?;
            validate_environment(&saved, Some("image/png"))?;
            if saved != bytes {
                return Err(AppError::new(
                    "write_failed",
                    "PNG binary verification failed",
                ));
            }
            Ok(())
        },
    )
}
pub fn load_settings(path: &Path) -> Result<Settings> {
    let bytes = match fs::read(path) {
        Ok(bytes) => bytes,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Settings::default())
        }
        Err(error) => return Err(AppError::io(error, "settings_io")),
    };
    if bytes.len() > 4096 {
        return Ok(Settings::default());
    }
    let Ok(mut stored) = serde_json::from_slice::<Value>(&bytes) else {
        return Ok(Settings::default());
    };
    // Only reads migrate legacy/malformed theme values; save validation remains strict.
    if let Some(object) = stored.as_object_mut() {
        if !matches!(
            object.get("themeMode").and_then(Value::as_str),
            Some("light" | "dark")
        ) {
            object.insert("themeMode".into(), Value::String("light".into()));
        }
    }
    let Ok(mut settings) = serde_json::from_value::<Settings>(stored) else {
        return Ok(Settings::default());
    };
    if !matches!(settings.language.as_str(), "en" | "zh-CN") {
        settings.language = "zh-CN".into();
    }
    if !matches!(settings.renderer_backend.as_str(), "webgl" | "webgpu") {
        settings.renderer_backend = default_renderer_backend();
    }
    Ok(settings)
}
pub fn save_settings(path: &Path, settings: &Settings) -> Result<()> {
    if !matches!(settings.theme_mode.as_str(), "light" | "dark")
        || !matches!(settings.language.as_str(), "en" | "zh-CN")
        || !matches!(settings.renderer_backend.as_str(), "webgl" | "webgpu")
    {
        return Err(AppError::new(
            "invalid_settings",
            "Invalid theme mode or language",
        ));
    }
    let parent = path
        .parent()
        .ok_or_else(|| AppError::new("invalid_path", "Missing settings directory"))?;
    fs::create_dir_all(parent).map_err(|e| AppError::io(e, "settings_io"))?;
    let json =
        serde_json::to_vec(settings).map_err(|e| AppError::new("settings_io", e.to_string()))?;
    atomic_write(
        path,
        |file| {
            file.write_all(&json)
                .map_err(|e| AppError::io(e, "settings_io"))
        },
        |temp| {
            if load_settings(temp)? != *settings {
                return Err(AppError::new(
                    "settings_io",
                    "Settings round-trip verification failed",
                ));
            }
            Ok(())
        },
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn project() -> Value {
        json!({"schemaVersion":1,"id":"project_1","name":"中文 Building","revision":0,"levels":[{"id":"level_1","name":"一楼","elevation":0,"height":3}],"walls":[],"slabs":[],"openings":[],"resources":[],"continuity":[]})
    }
    fn png() -> Vec<u8> {
        let mut buffer = Cursor::new(Vec::new());
        image::DynamicImage::new_rgba8(2, 2)
            .write_to(&mut buffer, ImageFormat::Png)
            .unwrap();
        buffer.into_inner()
    }
    fn glb() -> Vec<u8> {
        let mut json = br#"{"asset":{"version":"2.0"}}"#.to_vec();
        while json.len() % 4 != 0 {
            json.push(b' ');
        }
        let mut bytes = Vec::from(*b"glTF");
        bytes.extend(2u32.to_le_bytes());
        bytes.extend(((20 + json.len()) as u32).to_le_bytes());
        bytes.extend((json.len() as u32).to_le_bytes());
        bytes.extend(0x4e4f534au32.to_le_bytes());
        bytes.extend(json);
        bytes
    }
    #[test]
    fn portable_container_survives_original_deletion_and_migration() {
        let source = tempfile::tempdir().unwrap();
        let destination = tempfile::tempdir().unwrap();
        let original = source.path().join("原始 image.png");
        fs::write(&original, png()).unwrap();
        let resource = import_image(&original).unwrap();
        let mut doc = project();
        doc["resources"] = json!([resource]);
        let path = source.path().join("中文 project.building");
        save_project(&path, &doc).unwrap();
        fs::remove_file(original).unwrap();
        let moved = destination.path().join("moved building.building");
        fs::rename(path, &moved).unwrap();
        assert_eq!(open_project(&moved).unwrap(), doc);
    }
    #[test]
    fn content_addressing_deduplicates_same_image() {
        let mut first = resource_from_bytes("one.png".into(), "image/png".into(), &png()).unwrap();
        let mut second = first.clone();
        first.id = "a".into();
        second.id = "b".into();
        let mut doc = project();
        doc["resources"] = json!([first, second]);
        let mut buffer = Cursor::new(Vec::new());
        write_archive(&mut buffer, &doc).unwrap();
        buffer.set_position(0);
        assert_eq!(ZipArchive::new(buffer).unwrap().len(), 2);
    }
    #[test]
    fn unknown_version_or_fields_do_not_overwrite_valid_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("project.building");
        let doc = project();
        save_project(&path, &doc).unwrap();
        let prior = fs::read(&path).unwrap();
        let mut future = doc.clone();
        future["schemaVersion"] = json!(2);
        assert_eq!(
            save_project(&path, &future).unwrap_err().code,
            "unsupported_version"
        );
        future = doc.clone();
        future["newFeature"] = json!(true);
        assert_eq!(
            save_project(&path, &future).unwrap_err().code,
            "unknown_fields"
        );
        future = doc;
        future["levels"][0]["newField"] = json!(true);
        assert_eq!(
            save_project(&path, &future).unwrap_err().code,
            "unknown_fields"
        );
        assert_eq!(fs::read(path).unwrap(), prior);
    }
    #[test]
    fn failed_verification_preserves_previous_save() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("project.building");
        save_project(&path, &project()).unwrap();
        let prior = fs::read(&path).unwrap();
        let error = atomic_write(
            &path,
            |file| {
                file.write_all(b"partial")
                    .map_err(|e| AppError::io(e, "write_failed"))
            },
            |_| {
                Err(AppError::new(
                    "corrupt_project",
                    "injected verification failure",
                ))
            },
        )
        .unwrap_err();
        assert_eq!(error.code, "corrupt_project");
        assert_eq!(fs::read(path).unwrap(), prior);
    }
    #[test]
    fn truncated_or_unsafe_archives_fail() {
        assert_eq!(
            read_archive(Cursor::new(b"not a project"))
                .unwrap_err()
                .code,
            "corrupt_project"
        );
        let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
        zip.start_file("../outside.png", SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"bad").unwrap();
        assert_eq!(
            read_archive(Cursor::new(zip.finish().unwrap().into_inner()))
                .unwrap_err()
                .code,
            "corrupt_project"
        );
    }
    #[test]
    fn missing_resource_and_checksum_corruption_fail() {
        let mut doc = project();
        let resource = resource_from_bytes("image.png".into(), "image/png".into(), &png()).unwrap();
        let hash = "0".repeat(64);
        doc["resources"] = json!([{"id":resource.id,"name":resource.name,"mime":resource.mime,"path":format!("resources/{hash}.png"),"sha256":hash}]);
        let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
        zip.start_file("project.json", SimpleFileOptions::default())
            .unwrap();
        zip.write_all(&serde_json::to_vec(&doc).unwrap()).unwrap();
        assert_eq!(
            read_archive(Cursor::new(zip.finish().unwrap().into_inner()))
                .unwrap_err()
                .code,
            "missing_resource"
        );
        let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
        zip.start_file("project.json", SimpleFileOptions::default())
            .unwrap();
        zip.write_all(&serde_json::to_vec(&doc).unwrap()).unwrap();
        zip.start_file(
            format!("resources/{hash}.png"),
            SimpleFileOptions::default(),
        )
        .unwrap();
        zip.write_all(&png()).unwrap();
        assert_eq!(
            read_archive(Cursor::new(zip.finish().unwrap().into_inner()))
                .unwrap_err()
                .code,
            "corrupt_project"
        );
    }
    #[test]
    fn image_contents_and_limits_are_checked() {
        assert_eq!(
            resource_from_bytes("broken.png".into(), "image/png".into(), b"bad")
                .unwrap_err()
                .code,
            "invalid_image"
        );
        assert_eq!(
            resource_from_bytes("png.jpg".into(), "image/jpeg".into(), &png())
                .unwrap_err()
                .code,
            "invalid_image"
        );
        assert_eq!(
            validate_image(&vec![0; MAX_IMAGE_BYTES + 1], "image/png")
                .unwrap_err()
                .code,
            "resource_too_large"
        );
    }
    #[test]
    fn binary_glb_save_and_failed_replacement() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("door 动画.glb");
        let bytes = glb();
        save_glb(&path, &bytes).unwrap();
        assert_eq!(fs::read(&path).unwrap(), bytes);
        assert_eq!(save_glb(&path, b"partial").unwrap_err().code, "invalid_glb");
        assert_eq!(fs::read(path).unwrap(), bytes);
    }
    #[test]
    fn settings_are_separate_and_bad_preferences_fall_back() {
        let dir = tempfile::tempdir().unwrap();
        let path = settings_path(dir.path());
        let settings = Settings {
            theme_mode: "dark".into(),
            language: "en".into(),
            renderer_backend: "webgpu".into(),
        };
        save_settings(&path, &settings).unwrap();
        assert_eq!(load_settings(&path).unwrap(), settings);
        fs::write(&path, br#"{"themeMode":"invalid","language":"en"}"#).unwrap();
        assert_eq!(load_settings(&path).unwrap().theme_mode, "light");
        assert!(project().get("themeMode").is_none());
    }
    #[test]
    fn legacy_theme_preferences_migrate_to_light_without_losing_language_or_renderer() {
        let dir = tempfile::tempdir().unwrap();
        let path = settings_path(dir.path());
        assert_eq!(load_settings(&path).unwrap().theme_mode, "light");
        for theme in [
            json!("system"),
            json!("invalid"),
            Value::Null,
            json!(42),
            json!("light"),
            json!("dark"),
        ] {
            let expected = if theme.as_str() == Some("dark") {
                "dark"
            } else {
                "light"
            };
            fs::write(
                &path,
                serde_json::to_vec(&json!({
                    "themeMode": theme,
                    "language": "en",
                    "rendererBackend": "webgpu"
                }))
                .unwrap(),
            )
            .unwrap();
            let loaded = load_settings(&path).unwrap();
            assert_eq!(loaded.theme_mode, expected);
            assert_eq!(loaded.language, "en");
            assert_eq!(loaded.renderer_backend, "webgpu");
        }
        fs::write(&path, br#"{"themeMode":"system","language":"en"}"#).unwrap();
        let loaded = load_settings(&path).unwrap();
        assert_eq!(loaded.theme_mode, "light");
        assert_eq!(loaded.language, "en");
        assert_eq!(loaded.renderer_backend, "webgl");
        fs::write(&path, br#"{"language":"en","rendererBackend":"webgpu"}"#).unwrap();
        let loaded = load_settings(&path).unwrap();
        assert_eq!(loaded.theme_mode, "light");
        assert_eq!(loaded.language, "en");
        assert_eq!(loaded.renderer_backend, "webgpu");
    }
    #[test]
    fn theme_saves_accept_only_light_or_dark_and_preserve_previous_settings_on_rejection() {
        let dir = tempfile::tempdir().unwrap();
        let path = settings_path(dir.path());
        for theme in ["light", "dark"] {
            let valid = Settings {
                theme_mode: theme.into(),
                language: "en".into(),
                renderer_backend: "webgpu".into(),
            };
            save_settings(&path, &valid).unwrap();
            assert_eq!(load_settings(&path).unwrap(), valid);
        }
        let previous = fs::read(&path).unwrap();
        for theme in ["system", "invalid"] {
            let invalid = Settings {
                theme_mode: theme.into(),
                ..Settings::default()
            };
            assert_eq!(
                save_settings(&path, &invalid).unwrap_err().code,
                "invalid_settings"
            );
            assert_eq!(fs::read(&path).unwrap(), previous);
        }
    }
    #[test]
    fn path_extensions_are_restricted() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(
            save_project(&dir.path().join("unsafe.exe"), &project())
                .unwrap_err()
                .code,
            "invalid_path"
        );
        assert_eq!(
            save_project(Path::new("relative.building"), &project())
                .unwrap_err()
                .code,
            "invalid_path"
        );
    }
    #[test]
    fn binary_container_io_retains_document_and_rejects_bad_replacements() {
        let dir = tempfile::tempdir().unwrap();
        let original = dir.path().join("first.building");
        let mut doc = project();
        doc["resources"] = serde_json::json!([resource_from_bytes(
            "pixel.png".into(),
            "image/png".into(),
            &png()
        )
        .unwrap()]);
        save_project(&original, &doc).unwrap();
        let bytes = open_project_bytes(&original).unwrap();
        let destination = dir.path().join("中文 copied.building");
        save_project_bytes(&destination, &bytes).unwrap();
        assert_eq!(open_project(&destination).unwrap(), doc);
        assert_eq!(
            save_project_bytes(&destination, b"bad").unwrap_err().code,
            "corrupt_project"
        );
        assert_eq!(fs::read(destination).unwrap(), bytes);
    }
    #[test]
    fn valid_replacement_is_atomic_and_updates_entire_project() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("replace.building");
        let mut doc = project();
        save_project(&path, &doc).unwrap();
        doc["name"] = serde_json::json!("Updated");
        doc["revision"] = serde_json::json!(2);
        save_project(&path, &doc).unwrap();
        assert_eq!(open_project(&path).unwrap(), doc);
        assert_eq!(fs::read_dir(dir.path()).unwrap().count(), 1);
    }
    #[test]
    fn normalized_unexpected_archive_paths_are_rejected() {
        let mut writer = ZipWriter::new(Cursor::new(Vec::new()));
        writer
            .start_file("project.json", SimpleFileOptions::default())
            .unwrap();
        writer
            .write_all(&serde_json::to_vec(&project()).unwrap())
            .unwrap();
        // Different ZIP names normalize to the same path; neither may be extracted.
        writer
            .start_file("resources/../outside.png", SimpleFileOptions::default())
            .unwrap();
        writer.write_all(b"invalid").unwrap();
        assert_eq!(
            read_archive(Cursor::new(writer.finish().unwrap().into_inner()))
                .unwrap_err()
                .code,
            "unknown_fields"
        );
    }
    #[cfg(windows)]
    #[test]
    fn windows_read_only_save_failure_retains_previous_project() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("read-only.building");
        let mut doc = project();
        save_project(&path, &doc).unwrap();
        let prior = fs::read(&path).unwrap();
        let mut permissions = fs::metadata(&path).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&path, permissions).unwrap();
        doc["name"] = serde_json::json!("Must not be saved");
        let result = save_project(&path, &doc);
        let mut permissions = fs::metadata(&path).unwrap().permissions();
        permissions.set_readonly(false);
        fs::set_permissions(&path, permissions).unwrap();
        assert_eq!(result.unwrap_err().code, "permission_denied");
        assert_eq!(fs::read(path).unwrap(), prior);
    }
}
