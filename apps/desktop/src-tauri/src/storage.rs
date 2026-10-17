//! File replacement, exports and local settings; project and image validation have separate owners.
use crate::{
    environment_assets::validate_environment,
    project_archive::{read_archive, write_archive},
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    fs::{self, File},
    io::{Cursor, Read, Write},
    path::{Path, PathBuf},
};
use tempfile::NamedTempFile;

pub use crate::image_assets::{
    import_image, read_image_bytes, resource_from_bytes, resource_metadata,
};
pub use crate::project_schema::validate_document;

pub const MAX_PROJECT_BYTES: u64 = 256 * 1024 * 1024;
pub const MAX_IMAGE_BYTES: usize = 32 * 1024 * 1024;
pub const MAX_ENVIRONMENT_BYTES: usize = 64 * 1024 * 1024;
pub(crate) const MAX_JSON_BYTES: u64 = 32 * 1024 * 1024;
pub(crate) const MAX_ENTITIES: usize = 20_000;

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
pub(crate) type Result<T> = std::result::Result<T, AppError>;

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
            theme_mode: "dark".into(),
            language: "zh-CN".into(),
            renderer_backend: default_renderer_backend(),
        }
    }
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

// Used for both user files and atomic-save temporaries so every saved project remains reopenable.
fn open_bounded_project(path: &Path) -> Result<File> {
    let file = File::open(path).map_err(|e| AppError::io(e, "read_failed"))?;
    if file
        .metadata()
        .map_err(|e| AppError::io(e, "read_failed"))?
        .len()
        > MAX_PROJECT_BYTES
    {
        return Err(AppError::new("file_too_large", "Project exceeds 256 MiB"));
    }
    Ok(file)
}
/// Reopens a bounded archive without extracting its resource paths to disk.
pub fn open_project(path: &Path) -> Result<Value> {
    verify_path(path, "building")?;
    read_archive(open_bounded_project(path)?)
}
/// Returns the verified portable bytes for binary IPC; no machine-local resource paths survive.
pub fn open_project_bytes(path: &Path) -> Result<Vec<u8>> {
    verify_path(path, "building")?;
    let file = open_bounded_project(path)?;
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
/// Rebuilds a portable container and verifies its final size/content before replacing any prior save.
pub fn save_project(path: &Path, document: &Value) -> Result<()> {
    verify_path(path, "building")?;
    validate_document(document)?;
    atomic_write(
        path,
        |file| write_archive(file, document),
        |temp| {
            let file = open_bounded_project(temp)?;
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
/// Validates incoming IPC bytes and their disk round trip before atomic replacement.
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

/// Checks the exported GLB envelope before allowing it to overwrite a user file.
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
        if !length.is_multiple_of(4) || end > bytes.len() {
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
/// Atomically exports a validated GLB and checks that disk IO preserved all bytes.
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

/// Keeps local preferences outside portable project data.
pub fn settings_path(config_dir: &Path) -> PathBuf {
    config_dir.join("settings.json")
}
/// Validates pixels and the disk round trip before replacing a previous render export.
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
/// Reads at most one byte beyond the 4 KiB budget; malformed preferences use defaults.
pub fn load_settings(path: &Path) -> Result<Settings> {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
            return Ok(Settings::default())
        }
        Err(error) => return Err(AppError::io(error, "settings_io")),
    };
    read_settings(file)
}

fn read_settings(reader: impl Read) -> Result<Settings> {
    let mut bytes = Vec::new();
    reader
        .take(4097)
        .read_to_end(&mut bytes)
        .map_err(|error| AppError::io(error, "settings_io"))?;
    if bytes.len() > 4096 {
        return Ok(Settings::default());
    }
    let Ok(mut stored) = serde_json::from_slice::<Value>(&bytes) else {
        return Ok(Settings::default());
    };
    // Read migration uses the current dark default; explicit appearances and strict saves survive.
    if let Some(object) = stored.as_object_mut() {
        if !matches!(
            object.get("themeMode").and_then(Value::as_str),
            Some("light" | "dark")
        ) {
            object.insert("themeMode".into(), Value::String("dark".into()));
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
/// Persists validated preferences atomically without admitting them into project files.
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
#[path = "storage_tests.rs"]
mod tests;
