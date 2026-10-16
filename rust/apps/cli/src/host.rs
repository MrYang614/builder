//! Sibling desktop-host launcher and JSONL transport for the `building` CLI.

use building_control_protocol::{
    encode_line, parse_request, read_frame, ControlMode, ProjectCursor, Request, RequestOptions,
    Response, DEFAULT_MAX_FRAME_BYTES, PROTOCOL_VERSION,
};
use serde_json::{json, Value};
use std::{
    env, fmt,
    io::{self, BufReader, BufWriter, Write},
    path::PathBuf,
    process::{Child, ChildStdin, ChildStdout, Command, Stdio},
    sync::mpsc::{self, Receiver},
    thread,
    time::{Duration, Instant},
};

const HANDSHAKE_TIMEOUT: Duration = Duration::from_secs(60);
const HANDSHAKE_RETRY: Duration = Duration::from_millis(100);

#[derive(Debug)]
pub struct HostError {
    pub code: &'static str,
    pub message: String,
}

impl HostError {
    fn new(code: &'static str, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

impl fmt::Display for HostError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}: {}", self.code, self.message)
    }
}

impl std::error::Error for HostError {}

/// Owns one short-lived Tauri automation host and serializes all requests to it.
pub struct HostSession {
    child: Child,
    stdin: BufWriter<ChildStdin>,
    stdout: Receiver<Result<Vec<u8>, String>>,
    client_session_id: String,
    request_counter: u64,
    failed: bool,
}

impl HostSession {
    /// Starts the sibling desktop host and waits for the TypeScript bridge barrier.
    pub fn start() -> Result<Self, HostError> {
        let executable = find_desktop_host()?;
        let mut child = Command::new(&executable)
            .args(["--automation-host", "--stdio"])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|error| {
                HostError::new("host.startFailed", format!("{executable:?}: {error}"))
            })?;
        let Some(stdin) = child.stdin.take() else {
            let _ = child.kill();
            return Err(HostError::new(
                "host.startFailed",
                "Desktop host stdin was unavailable",
            ));
        };
        let Some(stdout) = child.stdout.take() else {
            let _ = child.kill();
            return Err(HostError::new(
                "host.startFailed",
                "Desktop host stdout was unavailable",
            ));
        };
        let stdout = start_reader(stdout);
        let mut session = Self {
            child,
            stdin: BufWriter::new(stdin),
            stdout,
            client_session_id: format!("cli-{}", std::process::id()),
            request_counter: 0,
            failed: false,
        };
        session.wait_until_ready()?;
        Ok(session)
    }

    /// Sends one typed request and waits for the matching response line.
    pub fn request(
        &mut self,
        operation: impl Into<String>,
        args: Value,
        project: Option<ProjectCursor>,
        options: RequestOptions,
    ) -> Result<Response<Value>, HostError> {
        self.request_counter = self.request_counter.saturating_add(1);
        let request = Request {
            protocol_version: PROTOCOL_VERSION,
            request_id: format!("{}-{}", self.client_session_id, self.request_counter),
            client_session_id: self.client_session_id.clone(),
            mode: Some(ControlMode::File),
            host_instance_id: None,
            operation: operation.into(),
            project,
            args,
            options,
        };
        self.request_raw(request)
    }

    /// Proxies validated JSONL requests from the caller to the same desktop host.
    pub fn proxy_stdio(&mut self) -> Result<i32, HostError> {
        let stdin = io::stdin();
        let mut reader = stdin.lock();
        let stdout = io::stdout();
        let mut writer = BufWriter::new(stdout.lock());
        loop {
            let Some(frame) = read_frame(&mut reader, DEFAULT_MAX_FRAME_BYTES)
                .map_err(|error| HostError::new("protocol.invalid", error.to_string()))?
            else {
                return Ok(0);
            };
            if frame.iter().all(u8::is_ascii_whitespace) {
                continue;
            }
            let request = match parse_request::<Value>(&frame, DEFAULT_MAX_FRAME_BYTES) {
                Ok(request) => request,
                Err(error) => {
                    let response: Response<Value> =
                        Response::failure("unknown", "protocol.invalid", error.to_string());
                    write_response(&mut writer, &response)?;
                    continue;
                }
            };
            let response = self.request_raw(request)?;
            write_response(&mut writer, &response)?;
        }
    }

    fn request_raw(&mut self, request: Request<Value>) -> Result<Response<Value>, HostError> {
        if self.failed {
            return Err(HostError::new(
                "host.disconnected",
                "Desktop host transport is unavailable",
            ));
        }
        let request_id = request.request_id.clone();
        let timeout_ms = request.options.timeout_ms;
        let encoded = encode_line(&request, DEFAULT_MAX_FRAME_BYTES)
            .map_err(|error| HostError::new("protocol.invalid", error.to_string()))?;
        self.stdin
            .write_all(&encoded)
            .and_then(|_| self.stdin.flush())
            .map_err(|error| HostError::new("host.writeFailed", error.to_string()))?;
        let frame = match self.stdout.recv_timeout(Duration::from_millis(timeout_ms)) {
            Ok(Ok(frame)) => frame,
            Ok(Err(error)) => {
                self.failed = true;
                return Err(HostError::new("host.readFailed", error));
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                self.failed = true;
                return Err(HostError::new(
                    "host.timeout",
                    format!("Desktop host did not respond within {timeout_ms} ms"),
                ));
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => {
                self.failed = true;
                return Err(HostError::new(
                    "host.disconnected",
                    "Desktop host closed its control stream",
                ));
            }
        };
        let response: Response<Value> = serde_json::from_slice(&frame)
            .map_err(|error| HostError::new("protocol.invalid", error.to_string()))?;
        if response.protocol_version != PROTOCOL_VERSION {
            return Err(HostError::new(
                "protocol.versionMismatch",
                format!(
                    "Expected protocol {PROTOCOL_VERSION}, received {}",
                    response.protocol_version
                ),
            ));
        }
        if response.request_id != request_id {
            return Err(HostError::new(
                "host.protocolMismatch",
                format!(
                    "Expected response {request_id}, received {}",
                    response.request_id
                ),
            ));
        }
        Ok(response)
    }

    fn wait_until_ready(&mut self) -> Result<(), HostError> {
        let deadline = Instant::now() + HANDSHAKE_TIMEOUT;
        loop {
            let response =
                self.request("host.handshake", json!({}), None, RequestOptions::default())?;
            if response.ok {
                return Ok(());
            }
            let code = response.error.as_ref().map(|error| error.code.as_str());
            if code != Some("host.notReady") {
                let message = response
                    .error
                    .map(|error| error.message)
                    .unwrap_or_else(|| "Desktop host handshake failed".to_owned());
                return Err(HostError::new("host.handshakeFailed", message));
            }
            if Instant::now() >= deadline {
                return Err(HostError::new(
                    "host.timeout",
                    "Timed out waiting for the TypeScript automation bridge",
                ));
            }
            thread::sleep(HANDSHAKE_RETRY);
        }
    }
}

fn start_reader(stdout: ChildStdout) -> Receiver<Result<Vec<u8>, String>> {
    let (sender, receiver) = mpsc::channel();
    thread::Builder::new()
        .name("building-cli-host-reader".to_owned())
        .spawn(move || {
            let mut reader = BufReader::new(stdout);
            loop {
                match read_frame(&mut reader, DEFAULT_MAX_FRAME_BYTES) {
                    Ok(Some(frame)) => {
                        if sender.send(Ok(frame)).is_err() {
                            break;
                        }
                    }
                    Ok(None) => break,
                    Err(error) => {
                        let _ = sender.send(Err(error.to_string()));
                        break;
                    }
                }
            }
        })
        .expect("CLI host reader thread must start");
    receiver
}

impl Drop for HostSession {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn write_response<W: Write>(writer: &mut W, response: &Response<Value>) -> Result<(), HostError> {
    let encoded = encode_line(response, DEFAULT_MAX_FRAME_BYTES)
        .map_err(|error| HostError::new("protocol.invalid", error.to_string()))?;
    writer
        .write_all(&encoded)
        .and_then(|_| writer.flush())
        .map_err(|error| HostError::new("host.writeFailed", error.to_string()))
}

fn find_desktop_host() -> Result<PathBuf, HostError> {
    if let Some(path) = env::var_os("BUILDING_DESKTOP_HOST") {
        let path = PathBuf::from(path);
        return if path.is_file() {
            Ok(path)
        } else {
            Err(HostError::new(
                "host.notFound",
                format!("BUILDING_DESKTOP_HOST does not point to a file: {path:?}"),
            ))
        };
    }
    let mut candidates = Vec::new();
    let executable_name = if cfg!(windows) {
        "builder.exe"
    } else {
        "builder"
    };
    if let Ok(current_executable) = env::current_exe() {
        if let Some(parent) = current_executable.parent() {
            candidates.push(parent.join(executable_name));
        }
    }
    let manifest_root = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("..");
    let tauri_root = manifest_root.join("apps").join("desktop").join("src-tauri");
    // A raw Cargo release host does not carry the packaged frontend resources; use the
    // debug Tauri host for source checkouts, while installed bundles use the sibling above.
    candidates.push(
        tauri_root
            .join("target")
            .join("debug")
            .join(executable_name),
    );
    if let Some(workspace) = env::var_os("BUILDING_WORKSPACE") {
        let tauri_root = PathBuf::from(workspace)
            .join("apps")
            .join("desktop")
            .join("src-tauri");
        candidates.push(
            tauri_root
                .join("target")
                .join("debug")
                .join(executable_name),
        );
    }
    candidates.retain(|candidate| candidate.is_file());
    candidates
        .into_iter()
        .next()
        .ok_or_else(|| HostError::new("host.notFound", format!("Could not find {executable_name}")))
}

#[cfg(test)]
mod tests {
    use super::HostError;

    #[test]
    fn host_error_preserves_a_stable_code() {
        let error = HostError::new("host.notFound", "missing desktop host");
        assert_eq!(error.code, "host.notFound");
        assert_eq!(error.message, "missing desktop host");
    }
}
