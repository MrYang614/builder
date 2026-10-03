#[cfg(test)]
mod tests {
    use crate::{environment_assets::*, storage::*};
    use base64::{engine::general_purpose::STANDARD, Engine};
    use image::{DynamicImage, ImageBuffer, ImageFormat, Rgb};
    use serde_json::{json, Value};
    use std::{fs, io::Cursor};
    fn project() -> Value {
        json!({"schemaVersion":1,"id":"environment_project","name":"环境工程","revision":0,"levels":[{"id":"level_1","name":"1","elevation":0,"height":3}],"walls":[],"slabs":[],"openings":[],"resources":[],"continuity":[]})
    }
    fn hdr() -> Vec<u8> {
        let mut bytes = b"#?RADIANCE\nFORMAT=32-bit_rle_rgbe\n\n-Y 2 +X 4\n".to_vec();
        bytes.extend([128, 64, 32, 129].repeat(8));
        bytes
    }
    fn exr() -> Vec<u8> {
        let image = ImageBuffer::<Rgb<f32>, Vec<f32>>::from_pixel(4, 2, Rgb([0.8, 0.4, 0.2]));
        let mut output = Cursor::new(Vec::new());
        DynamicImage::ImageRgb32F(image)
            .write_to(&mut output, ImageFormat::OpenExr)
            .unwrap();
        output.into_inner()
    }
    fn environment(id: &str, mime: &str, bytes: &[u8]) -> Value {
        json!({"id":id,"name":"全景 中文","mime":mime,"dataUrl":format!("data:{mime};base64,{}",STANDARD.encode(bytes))})
    }
    #[test]
    fn hdr_exr_environment_portable_after_source_deletion_and_directory_migration() {
        let directory = tempfile::tempdir().unwrap();
        for (format, data) in [("image/vnd.radiance", hdr()), ("image/x-exr", exr())] {
            let source = directory.path().join("原始全景.asset");
            fs::write(&source, &data).unwrap();
            assert_eq!(read_environment_bytes(&source).unwrap(), data);
            let mut doc = project();
            doc["environmentResources"] = json!([
                environment("environment_a", format, &data),
                environment("environment_alias", format, &data)
            ]);
            doc["environment"] = json!({"resourceId":"environment_a","intensity":1.5,"rotation":120,"background":true});
            let path = directory.path().join("原始工程.building");
            save_project(&path, &doc).unwrap();
            let mut zip = zip::ZipArchive::new(fs::File::open(&path).unwrap()).unwrap();
            assert_eq!(zip.len(), 2);
            drop(zip.by_index(0).unwrap());
            drop(zip);
            fs::remove_file(&source).unwrap();
            let migrated = directory.path().join("迁移");
            fs::create_dir_all(&migrated).unwrap();
            let destination = migrated.join(format!(
                "{}.building",
                environment_extension(format).unwrap()
            ));
            fs::rename(&path, &destination).unwrap();
            assert_eq!(open_project(&destination).unwrap(), doc);
        }
    }
    #[test]
    fn environment_validation_does_not_expand_surface_formats_or_overwrite_valid_project() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("保留.building");
        let mut doc = project();
        save_project(&path, &doc).unwrap();
        let original = fs::read(&path).unwrap();
        assert_eq!(
            resource_from_bytes("wrong.hdr".into(), "image/vnd.radiance".into(), &hdr())
                .unwrap_err()
                .code,
            "invalid_image"
        );
        doc["environment"] =
            json!({"resourceId":"missing","intensity":1,"rotation":0,"background":false});
        assert_eq!(
            save_project(&path, &doc).unwrap_err().code,
            "environment.resourceMissing"
        );
        assert_eq!(fs::read(&path).unwrap(), original);
        assert!(validate_environment(&hdr()[..48], None).is_err());
        assert_eq!(
            validate_environment(&exr(), Some("image/png"))
                .unwrap_err()
                .code,
            "environment.invalidAsset"
        );
    }
    #[test]
    fn renderer_preference_migrates_old_settings_and_remains_local() {
        let directory = tempfile::tempdir().unwrap();
        let path = settings_path(directory.path());
        fs::write(&path, br#"{"themeMode":"dark","language":"en"}"#).unwrap();
        assert_eq!(load_settings(&path).unwrap().renderer_backend, "webgl");
        let settings = Settings {
            renderer_backend: "webgpu".into(),
            ..Settings::default()
        };
        save_settings(&path, &settings).unwrap();
        assert_eq!(load_settings(&path).unwrap(), settings);
        fs::write(
            &path,
            br#"{"themeMode":"dark","language":"en","rendererBackend":"invalid"}"#,
        )
        .unwrap();
        assert_eq!(load_settings(&path).unwrap().renderer_backend, "webgl");
        assert!(project().get("rendererBackend").is_none());
    }
    #[test]
    fn binary_render_png_validates_and_protects_previous_export() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("渲染.png");
        let mut buffer = Cursor::new(Vec::new());
        DynamicImage::new_rgba8(4, 2)
            .write_to(&mut buffer, ImageFormat::Png)
            .unwrap();
        let bytes = buffer.into_inner();
        save_render_png(&path, &bytes).unwrap();
        assert_eq!(fs::read(&path).unwrap(), bytes);
        assert_eq!(
            save_render_png(&path, b"bad png").unwrap_err().code,
            "invalid_png"
        );
        assert_eq!(fs::read(&path).unwrap(), bytes);
        assert_eq!(
            save_render_png(&directory.path().join("wrong.glb"), &bytes)
                .unwrap_err()
                .code,
            "invalid_path"
        );
    }
}
