//! Environment images have their own formats and budgets; surface images stay PNG/JPEG only.
use crate::storage::{AppError, Resource, MAX_ENVIRONMENT_BYTES};
use base64::{engine::general_purpose::STANDARD, Engine};
use image::{ImageFormat, ImageReader};
use std::{
    fs::File,
    io::{Cursor, Read},
    path::Path,
};

type Result<T> = std::result::Result<T, AppError>;
pub fn environment_extension(mime: &str) -> Result<&'static str> {
    match mime {
        "image/vnd.radiance" => Ok("hdr"),
        "image/x-exr" => Ok("exr"),
        "image/png" => Ok("png"),
        "image/jpeg" => Ok("jpg"),
        _ => Err(AppError::new(
            "environment.invalidAsset",
            "Use Radiance HDR, EXR, PNG or JPEG",
        )),
    }
}
pub fn validate_environment(bytes: &[u8], expected_mime: Option<&str>) -> Result<&'static str> {
    if bytes.is_empty() || bytes.len() > MAX_ENVIRONMENT_BYTES {
        return Err(AppError::new(
            "environment.assetTooLarge",
            "Environment file limit is 64 MiB",
        ));
    }
    let format = image::guess_format(bytes)
        .map_err(|e| AppError::new("environment.invalidAsset", e.to_string()))?;
    let mime = match format {
        ImageFormat::Hdr => "image/vnd.radiance",
        ImageFormat::OpenExr => "image/x-exr",
        ImageFormat::Png => "image/png",
        ImageFormat::Jpeg => "image/jpeg",
        _ => {
            return Err(AppError::new(
                "environment.invalidAsset",
                "Unsupported panorama format",
            ))
        }
    };
    if expected_mime.is_some_and(|expected| expected != mime) {
        return Err(AppError::new(
            "environment.invalidAsset",
            "Environment MIME does not match its bytes",
        ));
    }
    let (width, height) = ImageReader::with_format(Cursor::new(bytes), format)
        .into_dimensions()
        .map_err(|e| AppError::new("environment.invalidAsset", e.to_string()))?;
    if width == 0
        || height == 0
        || width > 8192
        || height > 8192
        || u64::from(width) * u64::from(height) > 32 * 1024 * 1024
    {
        return Err(AppError::new(
            "environment.assetTooLarge",
            "Environment limit: 8192 per side, 32 million pixels",
        ));
    }
    let mut limits = image::Limits::default();
    limits.max_image_width = Some(8192);
    limits.max_image_height = Some(8192);
    limits.max_alloc = Some(512 * 1024 * 1024);
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    reader.limits(limits);
    let decoded = reader
        .decode()
        .map_err(|e| AppError::new("environment.invalidAsset", e.to_string()))?;
    let finite = decoded
        .as_rgb32f()
        .map(|image| image.as_raw().iter().all(|v| v.is_finite()))
        .or_else(|| {
            decoded
                .as_rgba32f()
                .map(|image| image.as_raw().iter().all(|v| v.is_finite()))
        })
        .unwrap_or(true);
    if !finite {
        return Err(AppError::new(
            "environment.invalidAsset",
            "Non-finite environment pixels",
        ));
    }
    Ok(mime)
}
pub fn decode_environment_resource(resource: &Resource) -> Result<Vec<u8>> {
    if resource.name.len() > 4096 || resource.data_url.len() > MAX_ENVIRONMENT_BYTES * 4 / 3 + 256 {
        return Err(AppError::new(
            "environment.assetTooLarge",
            "Environment metadata exceeds limit",
        ));
    }
    environment_extension(&resource.mime)?;
    let prefix = format!("data:{};base64,", resource.mime);
    let encoded = resource.data_url.strip_prefix(&prefix).ok_or_else(|| {
        AppError::new(
            "environment.invalidAsset",
            "Environment bytes must be embedded",
        )
    })?;
    let bytes = STANDARD
        .decode(encoded)
        .map_err(|e| AppError::new("environment.invalidAsset", e.to_string()))?;
    validate_environment(&bytes, Some(&resource.mime))?;
    Ok(bytes)
}
pub fn read_environment_bytes(path: &Path) -> Result<Vec<u8>> {
    let file = File::open(path).map_err(|e| AppError::io(e, "read_failed"))?;
    let metadata = file
        .metadata()
        .map_err(|e| AppError::io(e, "read_failed"))?;
    if !metadata.is_file() || metadata.len() > MAX_ENVIRONMENT_BYTES as u64 {
        return Err(AppError::new(
            "environment.assetTooLarge",
            "Environment file limit is 64 MiB",
        ));
    }
    let mut bytes = Vec::new();
    file.take(MAX_ENVIRONMENT_BYTES as u64 + 1)
        .read_to_end(&mut bytes)
        .map_err(|e| AppError::io(e, "read_failed"))?;
    validate_environment(&bytes, None)?;
    Ok(bytes)
}
