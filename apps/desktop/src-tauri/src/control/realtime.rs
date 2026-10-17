//! Windows realtime endpoint for an already-running desktop client.

#[cfg(windows)]
use super::ControlState;
#[cfg(windows)]
use building_control_protocol::{
    encode_line, parse_request, read_frame, Request, Response, DEFAULT_MAX_FRAME_BYTES,
    PROTOCOL_VERSION,
};
#[cfg(windows)]
use serde::{Deserialize, Serialize};
#[cfg(windows)]
use serde_json::Value;
#[cfg(windows)]
use std::{
    env,
    io::{BufReader, BufWriter, Write},
    path::PathBuf,
    thread,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::AppHandle;

#[cfg(windows)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EndpointDescriptor {
    pid: u32,
    process_start_time: u64,
    host_instance_id: String,
    protocol_version: u32,
    transport: &'static str,
    endpoint: String,
    token: String,
}

#[cfg(windows)]
/// Publishes a per-user named pipe and forwards authenticated requests to the TS bridge.
pub fn start(app: AppHandle, state: ControlState) {
    let Some((descriptor, path)) = publish_descriptor() else {
        return;
    };
    let endpoint = descriptor.endpoint.clone();
    let host_instance_id = descriptor.host_instance_id.clone();
    let token = descriptor.token.clone();
    thread::Builder::new()
        .name("building-realtime-named-pipe".to_owned())
        .spawn(move || run_server(app, state, endpoint, host_instance_id, token, path))
        .expect("realtime named-pipe thread must start");
}

#[cfg(not(windows))]
/// Keeps the API available while leaving macOS Unix-socket transport explicit and unsupported.
pub fn start(_app: AppHandle, _state: ControlState) {}

#[cfg(windows)]
fn publish_descriptor() -> Option<(EndpointDescriptor, PathBuf)> {
    let pid = std::process::id();
    // WebView2 hosts crash when this process calls GetProcessTimes; the token still authenticates
    // the per-process pipe, while the descriptor explicitly records the missing PID-reuse check.
    let process_start_time = 0;
    let token = random_token(pid)?;
    let host_instance_id = token[..24].to_owned();
    let endpoint = format!(r"\\.\pipe\building-{pid}-{host_instance_id}");
    let descriptor = EndpointDescriptor {
        pid,
        process_start_time,
        host_instance_id,
        protocol_version: PROTOCOL_VERSION,
        transport: "named-pipe",
        endpoint,
        token,
    };
    let path = descriptor_path(pid)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).ok()?;
    }
    if let Ok(metadata) = std::fs::symlink_metadata(&path) {
        if metadata.file_type().is_symlink() {
            return None;
        }
    }
    let bytes = serde_json::to_vec(&descriptor).ok()?;
    std::fs::write(&path, bytes).ok()?;
    Some((descriptor, path))
}

#[cfg(windows)]
fn descriptor_path(pid: u32) -> Option<PathBuf> {
    Some(
        PathBuf::from(env::var_os("LOCALAPPDATA")?)
            .join("BuildingEditor")
            .join("runtime")
            .join(format!("building-{pid}.json")),
    )
}

#[cfg(windows)]
fn random_token(pid: u32) -> Option<String> {
    use sha2::{Digest, Sha256};
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()?
        .as_nanos();
    let mut digest = Sha256::new();
    digest.update(pid.to_le_bytes());
    digest.update(now.to_le_bytes());
    digest.update(format!("{:p}", &digest).as_bytes());
    Some(format!("{:x}", digest.finalize()))
}

#[cfg(windows)]
fn run_server(
    app: AppHandle,
    state: ControlState,
    endpoint: String,
    host_instance_id: String,
    token: String,
    descriptor_path: PathBuf,
) {
    use std::{os::windows::io::FromRawHandle, ptr};
    use windows_sys::Win32::{
        Foundation::{CloseHandle, GetLastError, ERROR_PIPE_CONNECTED, INVALID_HANDLE_VALUE},
        Storage::FileSystem::PIPE_ACCESS_DUPLEX,
        System::Pipes::{
            ConnectNamedPipe, CreateNamedPipeW, PIPE_READMODE_BYTE, PIPE_TYPE_BYTE, PIPE_WAIT,
        },
    };
    let wide = endpoint
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    loop {
        // The process default DACL confines this local endpoint to the current user.
        let handle = unsafe {
            CreateNamedPipeW(
                wide.as_ptr(),
                PIPE_ACCESS_DUPLEX,
                PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT,
                1,
                DEFAULT_MAX_FRAME_BYTES as u32,
                DEFAULT_MAX_FRAME_BYTES as u32,
                1_000,
                ptr::null(),
            )
        };
        if handle == INVALID_HANDLE_VALUE {
            break;
        }
        let connected = unsafe { ConnectNamedPipe(handle, ptr::null_mut()) } != 0;
        if !connected && unsafe { GetLastError() } != ERROR_PIPE_CONNECTED {
            unsafe { CloseHandle(handle) };
            continue;
        }
        let file = unsafe { std::fs::File::from_raw_handle(handle as _) };
        let reader = match file.try_clone() {
            Ok(clone) => clone,
            Err(_) => continue,
        };
        let mut reader = BufReader::new(reader);
        let mut writer = BufWriter::new(file);
        let mut authenticated = false;
        while let Ok(Some(frame)) = read_frame(&mut reader, DEFAULT_MAX_FRAME_BYTES) {
            let request = match parse_request::<Value>(&frame, DEFAULT_MAX_FRAME_BYTES) {
                Ok(request) => request,
                Err(error) => {
                    let response: Response<Value> =
                        Response::failure("unknown", "protocol.invalid", error.to_string());
                    if write_response(&mut writer, &response).is_err() {
                        break;
                    }
                    continue;
                }
            };
            if !authenticated {
                if !valid_handshake(&request, &host_instance_id, &token) {
                    let response: Response<Value> = Response::failure(
                        request.request_id,
                        "invalid_host",
                        "Realtime handshake token was rejected",
                    );
                    let _ = write_response(&mut writer, &response);
                    break;
                }
                authenticated = true;
            } else if !matches_host(&request, &host_instance_id) {
                let response: Response<Value> = Response::failure(
                    request.request_id,
                    "invalid_host",
                    "Realtime host instance does not match this endpoint",
                );
                if write_response(&mut writer, &response).is_err() {
                    break;
                }
                continue;
            }
            let response = super::dispatch(app.clone(), state.clone(), request);
            if write_response(&mut writer, &response).is_err() {
                break;
            }
        }
    }
    let _ = std::fs::remove_file(descriptor_path);
}

#[cfg(windows)]
fn valid_handshake(request: &Request<Value>, expected_host: &str, expected_token: &str) -> bool {
    request.operation == "host.handshake"
        && matches_host(request, expected_host)
        && request.args.get("token").and_then(Value::as_str) == Some(expected_token)
}

#[cfg(windows)]
fn matches_host(request: &Request<Value>, expected_host: &str) -> bool {
    request.mode == Some(building_control_protocol::ControlMode::Realtime)
        && request.host_instance_id.as_deref() == Some(expected_host)
}

#[cfg(windows)]
fn write_response<W: Write>(writer: &mut W, response: &Response<Value>) -> std::io::Result<()> {
    let line = encode_line(response, DEFAULT_MAX_FRAME_BYTES).map_err(std::io::Error::other)?;
    writer.write_all(&line)?;
    writer.flush()
}
