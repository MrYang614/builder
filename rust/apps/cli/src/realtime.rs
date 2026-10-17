//! Windows-only discovery and connection to an already-running desktop host.

use serde::Deserialize;
use std::{env, path::PathBuf};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct EndpointDescriptor {
    pub pid: u32,
    pub process_start_time: u64,
    pub host_instance_id: String,
    pub protocol_version: u32,
    pub transport: String,
    pub endpoint: String,
    pub token: String,
}

#[cfg(windows)]
pub fn descriptor_for_pid(pid: &str) -> Result<(EndpointDescriptor, u32), String> {
    let numeric = pid
        .parse::<u32>()
        .map_err(|_| "--pid must be a positive Windows process id".to_owned())?;
    if numeric == 0 {
        return Err("--pid must be a positive Windows process id".to_owned());
    }
    let path = descriptor_path(numeric)?;
    let metadata = std::fs::symlink_metadata(&path)
        .map_err(|error| format!("realtime descriptor {path:?} could not be inspected: {error}"))?;
    if metadata.file_type().is_symlink() {
        return Err("realtime descriptor symlinks are not accepted".to_owned());
    }
    let text = std::fs::read_to_string(&path)
        .map_err(|error| format!("realtime descriptor {path:?} could not be read: {error}"))?;
    let descriptor: EndpointDescriptor = serde_json::from_str(&text)
        .map_err(|error| format!("realtime descriptor is invalid: {error}"))?;
    if descriptor.pid != numeric {
        return Err("realtime descriptor PID does not match --pid".to_owned());
    }
    if descriptor.process_start_time != 0 {
        let current_start = process_start_time(numeric)?;
        if descriptor.process_start_time != current_start {
            return Err("realtime descriptor refers to a reused or stale process id".to_owned());
        }
    }
    if descriptor.protocol_version != building_control_protocol::PROTOCOL_VERSION {
        return Err("realtime descriptor protocol version is unsupported".to_owned());
    }
    if descriptor.transport != "named-pipe" || descriptor.endpoint.is_empty() {
        return Err("realtime descriptor has no Windows named-pipe endpoint".to_owned());
    }
    if descriptor.host_instance_id.is_empty() || descriptor.token.is_empty() {
        return Err("realtime descriptor is missing authentication fields".to_owned());
    }
    Ok((descriptor, numeric))
}

#[cfg(windows)]
fn process_start_time(pid: u32) -> Result<u64, String> {
    use std::ptr;
    use windows_sys::Win32::{
        Foundation::{CloseHandle, FILETIME, HANDLE, INVALID_HANDLE_VALUE},
        System::Threading::{GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION},
    };
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if process.is_null() || std::ptr::eq(process, INVALID_HANDLE_VALUE as HANDLE) {
        return Err("the requested process is not running or is not queryable".to_owned());
    }
    let mut creation = FILETIME {
        dwLowDateTime: 0,
        dwHighDateTime: 0,
    };
    let ok = unsafe {
        GetProcessTimes(
            process,
            &mut creation,
            ptr::null_mut(),
            ptr::null_mut(),
            ptr::null_mut(),
        )
    } != 0;
    unsafe { CloseHandle(process) };
    if !ok {
        return Err("the requested process creation time is unavailable".to_owned());
    }
    Ok((u64::from(creation.dwHighDateTime) << 32) | u64::from(creation.dwLowDateTime))
}

#[cfg(not(windows))]
pub fn descriptor_for_pid(_pid: &str) -> Result<(EndpointDescriptor, u32), String> {
    Err("realtime connect is currently implemented only for Windows Named Pipe hosts".to_owned())
}

#[cfg(windows)]
pub fn connect_named_pipe(endpoint: &str) -> Result<std::fs::File, String> {
    use std::{ffi::OsStr, os::windows::ffi::OsStrExt, os::windows::io::FromRawHandle};
    use windows_sys::Win32::{
        Foundation::{GetLastError, INVALID_HANDLE_VALUE},
        Storage::FileSystem::{CreateFileW, FILE_GENERIC_READ, FILE_GENERIC_WRITE, OPEN_EXISTING},
    };
    let wide = OsStr::new(endpoint)
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    // SAFETY: `wide` is NUL-terminated and remains alive for the call; the returned handle is
    // transferred into File exactly once below.
    let handle = unsafe {
        CreateFileW(
            wide.as_ptr(),
            FILE_GENERIC_READ | FILE_GENERIC_WRITE,
            0,
            std::ptr::null(),
            OPEN_EXISTING,
            0,
            std::ptr::null_mut(),
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        return Err(format!("named-pipe connection failed (Win32 {})", unsafe {
            GetLastError()
        }));
    }
    // SAFETY: CreateFileW returned a valid owned handle and File now owns it.
    Ok(unsafe { std::fs::File::from_raw_handle(handle as _) })
}

#[cfg(not(windows))]
pub fn connect_named_pipe(_endpoint: &str) -> Result<std::fs::File, String> {
    Err("realtime connect is currently implemented only for Windows Named Pipe hosts".to_owned())
}

pub fn descriptor_path(pid: u32) -> Result<PathBuf, String> {
    let root = env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .ok_or_else(|| "LOCALAPPDATA is unavailable; realtime discovery cannot run".to_owned())?;
    Ok(root
        .join("BuildingEditor")
        .join("runtime")
        .join(format!("building-{pid}.json")))
}
