//! Surface image decoding and imports enforce the PNG/JPEG byte and pixel budgets.
use crate::storage::{AppError, Resource, ResourceMetadata, Result, MAX_IMAGE_BYTES};
use base64::{engine::general_purpose::STANDARD, Engine};
use image::{ImageFormat, ImageReader};
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::{Cursor, Read},
    path::Path,
};

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
pub(crate) fn validate_image(bytes: &[u8], mime: &str) -> Result<()> {
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
pub(crate) fn decode_resource(resource: &Resource) -> Result<Vec<u8>> {
    if (resource.id.is_empty() || resource.id.len() > 512 || resource.id.contains('\0'))
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
/// Embeds validated surface bytes; content hashes deduplicate resources across project saves.
pub fn resource_from_bytes(name: String, mime: String, bytes: &[u8]) -> Result<Resource> {
    let metadata = resource_metadata(name, mime, bytes)?;
    Ok(Resource {
        id: metadata.id,
        name: metadata.name,
        data_url: format!("data:{};base64,{}", metadata.mime, STANDARD.encode(bytes)),
        mime: metadata.mime,
    })
}
/// Returns bounded, decoded metadata for binary imports while JavaScript retains the source bytes.
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
/// Bounds reads from the opened file, then validates its actual format and decoded dimensions.
pub fn read_image_bytes(path: &Path) -> Result<Vec<u8>> {
    if !path.is_absolute() {
        return Err(AppError::new("invalid_path", "Image path must be absolute"));
    }
    let file = File::open(path).map_err(|e| AppError::io(e, "read_failed"))?;
    let meta = file
        .metadata()
        .map_err(|e| AppError::io(e, "read_failed"))?;
    if !meta.is_file() || meta.len() > MAX_IMAGE_BYTES as u64 {
        return Err(AppError::new("resource_too_large", "Image limit is 32 MiB"));
    }
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
/// Produces a self-contained image so later source deletion cannot break the project.
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
