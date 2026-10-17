mod commands;
mod control;
pub mod environment_assets;
#[cfg(test)]
mod environment_tests;
mod image_assets;
mod project_archive;
mod project_schema;
#[cfg(test)]
mod project_schema_tests;
mod project_topology;
pub mod storage;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let automation_host = std::env::args().any(|arg| arg == "--automation-host");
    tauri::Builder::default()
        .manage(control::ControlState::new())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::open_project,
            commands::save_project,
            commands::save_glb,
            commands::save_render_png,
            commands::import_environment,
            commands::import_environment_bytes,
            commands::import_image,
            commands::import_image_bytes,
            commands::load_settings,
            commands::save_settings,
            control::control_ready,
            control::control_respond
        ])
        .setup(move |app| {
            if automation_host && std::env::args().any(|arg| arg == "--stdio") {
                let state = app.state::<control::ControlState>().inner().clone();
                control::start_stdio(app.handle().clone(), state);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
