//! Content-addressed ZIP serialization is shared by JSON tooling and binary desktop IO.
use crate::{
    environment_assets::{
        decode_environment_resource, environment_extension, validate_environment,
    },
    image_assets::{decode_resource, validate_image},
    storage::{
        validate_document, AppError, Resource, Result, MAX_ENTITIES, MAX_ENVIRONMENT_BYTES,
        MAX_IMAGE_BYTES, MAX_JSON_BYTES, MAX_PROJECT_BYTES,
    },
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    io::{Read, Seek, Write},
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct StoredResource {
    id: String,
    name: String,
    mime: String,
    path: String,
    sha256: String,
}

fn invalid(details: impl Into<String>) -> AppError {
    AppError::new("invalid_project", details)
}

pub(crate) fn write_archive<W: Write + Seek>(writer: W, document: &Value) -> Result<()> {
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
    let mut expanded_total = 0u64;
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
        expanded_total += bytes.len() as u64;
        if expanded_total > MAX_PROJECT_BYTES {
            return Err(AppError::new(
                "file_too_large",
                "Expanded project resources exceed 256 MiB",
            ));
        }
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

pub(crate) fn read_archive<R: Read + Seek>(reader: R) -> Result<Value> {
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
    if !doc.is_object() {
        return Err(AppError::new(
            "corrupt_project",
            "Project JSON must contain an object",
        ));
    }
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
    if entries.len() > 1000 || environment_entries.len() > 128 {
        return Err(AppError::new(
            "file_too_large",
            "Too many project resources",
        ));
    }
    // Every manifest alias becomes embedded data in the formal document, even when ZIP bytes deduplicate.
    let mut expanded_total = 0u64;
    for entry in entries.iter().chain(environment_entries.iter()) {
        if let Ok(file) = zip.by_name(&entry.path) {
            expanded_total = expanded_total.checked_add(file.size()).ok_or_else(|| {
                AppError::new("file_too_large", "Expanded resource size overflow")
            })?;
            if expanded_total > MAX_PROJECT_BYTES {
                return Err(AppError::new(
                    "file_too_large",
                    "Expanded project resources exceed 256 MiB",
                ));
            }
        }
    }
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
