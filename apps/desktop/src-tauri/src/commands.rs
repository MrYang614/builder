use crate::storage::{self, AppError, ResourceMetadata, Settings};
use percent_encoding::percent_decode_str;
use std::path::PathBuf;
use tauri::{
    ipc::{InvokeBody, Request, Response},
    Manager,
};

fn task_error(error: impl std::fmt::Display) -> AppError {
    AppError::new("service_failed", error.to_string())
}
fn header(request: &Request<'_>, name: &str) -> Result<String, AppError> {
    let value = request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::new("invalid_request", format!("Missing {name} header")))?;
    percent_decode_str(value)
        .decode_utf8()
        .map(|v| v.into_owned())
        .map_err(|e| AppError::new("invalid_request", e.to_string()))
}

#[tauri::command]
pub async fn open_project(path: String) -> Result<Response, AppError> {
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        storage::open_project_bytes(&PathBuf::from(path))
    })
    .await
    .map_err(task_error)??;
    Ok(Response::new(bytes))
}
#[tauri::command]
pub async fn save_project(request: Request<'_>) -> Result<(), AppError> {
    let path = header(&request, "x-file-path")?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(AppError::new(
            "invalid_request",
            "Project save requires a binary container",
        ));
    };
    let bytes = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        storage::save_project_bytes(&PathBuf::from(path), &bytes)
    })
    .await
    .map_err(task_error)?
}
#[tauri::command]
pub async fn save_glb(request: Request<'_>) -> Result<(), AppError> {
    let path = header(&request, "x-file-path")?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(AppError::new(
            "invalid_request",
            "GLB export requires a binary body",
        ));
    };
    let bytes = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || storage::save_glb(&PathBuf::from(path), &bytes))
        .await
        .map_err(task_error)?
}
#[tauri::command]
pub async fn save_render_png(request: Request<'_>) -> Result<(), AppError> {
    let path = header(&request, "x-file-path")?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(AppError::new(
            "invalid_request",
            "PNG export requires a binary body",
        ));
    };
    let bytes = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        storage::save_render_png(&PathBuf::from(path), &bytes)
    })
    .await
    .map_err(task_error)?
}
#[tauri::command]
pub async fn import_environment(path: String) -> Result<Response, AppError> {
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        crate::environment_assets::read_environment_bytes(&PathBuf::from(path))
    })
    .await
    .map_err(task_error)??;
    Ok(Response::new(bytes))
}
#[tauri::command]
pub async fn import_environment_bytes(request: Request<'_>) -> Result<(), AppError> {
    let _name = header(&request, "x-file-name")?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(AppError::new(
            "invalid_request",
            "Environment import requires a binary body",
        ));
    };
    let bytes = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || {
        crate::environment_assets::validate_environment(&bytes, None).map(|_| ())
    })
    .await
    .map_err(task_error)?
}
#[tauri::command]
pub async fn import_image(path: String) -> Result<Response, AppError> {
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        storage::read_image_bytes(&PathBuf::from(path))
    })
    .await
    .map_err(task_error)??;
    Ok(Response::new(bytes))
}
#[tauri::command]
pub async fn import_image_bytes(request: Request<'_>) -> Result<ResourceMetadata, AppError> {
    let name = header(&request, "x-file-name")?;
    let mime = header(&request, "x-file-mime")?;
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err(AppError::new(
            "invalid_request",
            "Image import requires a binary body",
        ));
    };
    let bytes = bytes.clone();
    tauri::async_runtime::spawn_blocking(move || storage::resource_metadata(name, mime, &bytes))
        .await
        .map_err(task_error)?
}
#[tauri::command]
pub async fn load_settings(app: tauri::AppHandle) -> Result<Settings, AppError> {
    let directory = app.path().app_config_dir().map_err(task_error)?;
    tauri::async_runtime::spawn_blocking(move || {
        storage::load_settings(&storage::settings_path(&directory))
    })
    .await
    .map_err(task_error)?
}
#[tauri::command]
pub async fn save_settings(app: tauri::AppHandle, settings: Settings) -> Result<(), AppError> {
    let directory = app.path().app_config_dir().map_err(task_error)?;
    tauri::async_runtime::spawn_blocking(move || {
        storage::save_settings(&storage::settings_path(&directory), &settings)
    })
    .await
    .map_err(task_error)?
}
