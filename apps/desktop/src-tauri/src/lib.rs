mod commands;
pub mod environment_assets;
#[cfg(test)]
mod environment_tests;
pub mod storage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            commands::save_settings
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
