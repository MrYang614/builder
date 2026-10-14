use std::{env, fs, path::PathBuf};

fn main() {
    let target = env::var("TAURI_ENV_TARGET_TRIPLE")
        .or_else(|_| env::var("TARGET"))
        .expect("Tauri build target is available");
    let executable = if target.contains("windows") {
        format!("building-{target}.exe")
    } else {
        format!("building-{target}")
    };
    let bin =
        PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("manifest directory")).join("bin");
    fs::create_dir_all(&bin).expect("create sidecar directory");
    let sidecar = bin.join(executable);
    if !sidecar.exists() {
        fs::write(
            &sidecar,
            b"placeholder; npm run build:cli replaces this before bundling\n",
        )
        .expect("create sidecar placeholder");
    }
    tauri_build::build();
}
