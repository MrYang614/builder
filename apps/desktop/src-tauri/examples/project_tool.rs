//! Reproducible project-fixture utility; application users use native dialogs.
use builder_lib::storage;
use std::{env, fs, path::PathBuf, process};
fn main() {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.len() != 3 || !matches!(args[0].as_str(), "pack" | "unpack") {
        eprintln!("Usage: project_tool pack input.json output.building | unpack input.building output.json");
        process::exit(2);
    }
    let absolute = |path: &str| {
        let path = PathBuf::from(path);
        if path.is_absolute() {
            path
        } else {
            env::current_dir().expect("current directory").join(path)
        }
    };
    let input = absolute(&args[1]);
    let output = absolute(&args[2]);
    let result = if args[0] == "pack" {
        fs::read(&input)
            .map_err(|e| storage::AppError::new("read_failed", e.to_string()))
            .and_then(|bytes| {
                serde_json::from_slice(&bytes)
                    .map_err(|e| storage::AppError::new("invalid_project", e.to_string()))
            })
            .and_then(|doc| storage::save_project(&output, &doc))
    } else {
        storage::open_project(&input)
            .and_then(|doc| {
                serde_json::to_vec_pretty(&doc)
                    .map_err(|e| storage::AppError::new("invalid_project", e.to_string()))
            })
            .and_then(|bytes| {
                fs::write(&output, bytes)
                    .map_err(|e| storage::AppError::new("write_failed", e.to_string()))
            })
    };
    if let Err(error) = result {
        eprintln!("{}: {}", error.code, error.details);
        process::exit(1);
    }
}
