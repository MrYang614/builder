use super::*;
use crate::image_assets::validate_image;
use image::ImageFormat;
use serde_json::json;
use zip::{write::SimpleFileOptions, ZipArchive, ZipWriter};

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
    while !json.len().is_multiple_of(4) {
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
fn oversized_atomic_project_temporary_cannot_replace_a_reopenable_save() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("bounded.building");
    save_project(&path, &project()).unwrap();
    let prior = fs::read(&path).unwrap();
    let error = atomic_write(
        &path,
        |file| {
            file.set_len(MAX_PROJECT_BYTES + 1)
                .map_err(|error| AppError::io(error, "write_failed"))
        },
        |temporary| open_bounded_project(temporary).map(|_| ()),
    )
    .unwrap_err();
    assert_eq!(error.code, "file_too_large");
    assert_eq!(fs::read(&path).unwrap(), prior);
    assert_eq!(open_project(&path).unwrap(), project());
    assert_eq!(fs::read_dir(directory.path()).unwrap().count(), 1);
}
#[test]
fn malformed_settings_read_stops_at_the_declared_budget() {
    let mut reader = Cursor::new(vec![b'x'; 8192]);
    assert_eq!(read_settings(&mut reader).unwrap(), Settings::default());
    assert_eq!(reader.position(), 4097);
}
#[test]
fn archive_alias_expansion_is_bounded_before_resource_decoding() {
    let hash = "0".repeat(64);
    let path = format!("resources/{hash}.png");
    let mut doc = project();
    doc["resources"] = json!((0..9).map(|index| json!({
        "id": format!("alias_{index}"), "name": "alias.png", "mime": "image/png", "path": path, "sha256": hash
    })).collect::<Vec<_>>());
    let mut archive = ZipWriter::new(Cursor::new(Vec::new()));
    archive
        .start_file("project.json", SimpleFileOptions::default())
        .unwrap();
    archive
        .write_all(&serde_json::to_vec(&doc).unwrap())
        .unwrap();
    archive
        .start_file(&path, SimpleFileOptions::default())
        .unwrap();
    archive.write_all(&[1]).unwrap();
    let mut bytes = archive.finish().unwrap().into_inner();
    for offset in 0..bytes.len() - 46 {
        if &bytes[offset..offset + 4] != b"PK\x01\x02" {
            continue;
        }
        let length =
            u16::from_le_bytes(bytes[offset + 28..offset + 30].try_into().unwrap()) as usize;
        if &bytes[offset + 46..offset + 46 + length] == path.as_bytes() {
            bytes[offset + 24..offset + 28]
                .copy_from_slice(&(MAX_IMAGE_BYTES as u32).to_le_bytes());
            break;
        }
    }
    assert_eq!(
        read_archive(Cursor::new(bytes)).unwrap_err().code,
        "file_too_large"
    );
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
fn native_project_open_distinguishes_non_object_json_from_future_schema() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("root-validation.building");
    let mut future = project();
    future["schemaVersion"] = json!(2);
    for (document, expected_code) in [
        (Value::Null, "corrupt_project"),
        (json!([]), "corrupt_project"),
        (json!(42), "corrupt_project"),
        (json!("project"), "corrupt_project"),
        (json!(true), "corrupt_project"),
        (future, "unsupported_version"),
    ] {
        let mut archive = ZipWriter::new(Cursor::new(Vec::new()));
        archive
            .start_file("project.json", SimpleFileOptions::default())
            .unwrap();
        archive
            .write_all(&serde_json::to_vec(&document).unwrap())
            .unwrap();
        fs::write(&path, archive.finish().unwrap().into_inner()).unwrap();
        assert_eq!(open_project(&path).unwrap_err().code, expected_code);
        assert_eq!(open_project_bytes(&path).unwrap_err().code, expected_code);
    }
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
    doc["resources"] =
        serde_json::json!([
            resource_from_bytes("pixel.png".into(), "image/png".into(), &png()).unwrap()
        ]);
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
    #[expect(
        clippy::permissions_set_readonly_false,
        reason = "Windows-only test cleanup restores the file after checking read-only behavior"
    )]
    permissions.set_readonly(false);
    fs::set_permissions(&path, permissions).unwrap();
    assert_eq!(result.unwrap_err().code, "permission_denied");
    assert_eq!(fs::read(path).unwrap(), prior);
}
