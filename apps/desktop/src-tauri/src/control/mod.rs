//! Local automation-host control plane. Formal commands remain in the TypeScript bridge.

use building_control_protocol::{
    encode_line, parse_request, read_frame, IdempotencyCache, Request, Response,
    DEFAULT_MAX_FRAME_BYTES, PROTOCOL_VERSION,
};
use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{self, Write},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::Duration,
};
use tauri::{AppHandle, Emitter, State};

const CACHE_CAPACITY: usize = 256;

#[derive(Clone)]
pub struct ControlState {
    pending: Arc<Mutex<HashMap<String, mpsc::Sender<Response<Value>>>>>,
    cache: Arc<Mutex<IdempotencyCache>>,
    bridge_ready: Arc<AtomicBool>,
}

impl ControlState {
    pub fn new() -> Self {
        Self {
            pending: Arc::new(Mutex::new(HashMap::new())),
            cache: Arc::new(Mutex::new(IdempotencyCache::new(CACHE_CAPACITY))),
            bridge_ready: Arc::new(AtomicBool::new(false)),
        }
    }

    /// Reports whether the TypeScript bridge has registered its event listener.
    pub fn is_bridge_ready(&self) -> bool {
        self.bridge_ready.load(Ordering::Acquire)
    }

    fn mark_bridge_ready(&self) {
        self.bridge_ready.store(true, Ordering::Release);
    }
}

/// Marks the Tauri event bridge ready after TypeScript has installed its listener.
#[tauri::command]
pub fn control_ready(state: State<'_, ControlState>) -> Result<(), String> {
    state.mark_bridge_ready();
    Ok(())
}

/// Completes one request that the TypeScript bridge received from stdin.
#[tauri::command]
pub fn control_respond(
    state: State<'_, ControlState>,
    response: Response<Value>,
) -> Result<(), String> {
    let sender = state
        .pending
        .lock()
        .map_err(|_| "control.statePoisoned".to_owned())?
        .remove(&response.request_id);
    match sender {
        Some(sender) => sender
            .send(response)
            .map_err(|_| "control.responseClosed".to_owned()),
        None => Err("control.requestUnknown".to_owned()),
    }
}

/// Starts the single stdio loop for `builder --automation-host --stdio`.
pub fn start_stdio(app: AppHandle, state: ControlState) {
    thread::Builder::new()
        .name("building-automation-stdio".to_owned())
        .spawn(move || run_stdio(app, state))
        .expect("automation stdio thread must start");
}

fn run_stdio(app: AppHandle, state: ControlState) {
    let stdin = io::stdin();
    let mut reader = stdin.lock();
    let mut stdout = io::BufWriter::new(io::stdout().lock());
    loop {
        let line = match read_frame(&mut reader, DEFAULT_MAX_FRAME_BYTES) {
            Ok(Some(value)) => value,
            Ok(None) => break,
            Err(error) => {
                let response: Response<Value> =
                    Response::failure("unknown", "protocol.invalid", error.to_string());
                if write_response(&mut stdout, &response).is_err() {
                    break;
                }
                continue;
            }
        };
        if line.iter().all(u8::is_ascii_whitespace) {
            continue;
        }
        let request = match parse_request::<Value>(&line, DEFAULT_MAX_FRAME_BYTES) {
            Ok(value) => value,
            Err(error) => {
                let response: Response<Value> =
                    Response::failure("unknown", "protocol.invalid", error.to_string());
                if write_response(&mut stdout, &response).is_err() {
                    break;
                }
                continue;
            }
        };
        let cached = match state.cache.lock() {
            Ok(cache) => cache
                .get(&request)
                .map(|value| value.map(ToOwned::to_owned)),
            Err(_) => Err(building_control_protocol::ProtocolError::Write(
                io::Error::other("control cache poisoned"),
            )),
        };
        match cached {
            Ok(Some(bytes)) => {
                if stdout.write_all(&bytes).is_err() || stdout.flush().is_err() {
                    break;
                }
                continue;
            }
            Err(error) => {
                let response: Response<Value> = Response::failure(
                    request.request_id.clone(),
                    "duplicate_request",
                    error.to_string(),
                );
                if write_response(&mut stdout, &response).is_err() {
                    break;
                }
                continue;
            }
            Ok(None) => {}
        }
        let cache_request = request.clone();
        let response = dispatch(app.clone(), state.clone(), request);
        let Ok(encoded) = encode_line(&response, DEFAULT_MAX_FRAME_BYTES) else {
            break;
        };
        if stdout.write_all(&encoded).is_err() || stdout.flush().is_err() {
            break;
        }
        if let Ok(mut cache) = state.cache.lock() {
            let _ = cache.insert(&cache_request, encoded);
        }
    }
    let _ = app.emit(
        "control/disconnected",
        json!({ "protocolVersion": PROTOCOL_VERSION }),
    );
    // Automation hosts are short-lived; EOF means the owning CLI has closed its session.
    app.exit(0);
}

fn dispatch(app: AppHandle, state: ControlState, request: Request<Value>) -> Response<Value> {
    if !state.is_bridge_ready() {
        return Response::failure(
            request.request_id,
            "host.notReady",
            "Automation bridge is not connected",
        );
    }
    let (sender, receiver) = mpsc::channel();
    if state
        .pending
        .lock()
        .map(|mut pending| pending.insert(request.request_id.clone(), sender))
        .is_err()
    {
        return Response::failure(
            request.request_id,
            "control.statePoisoned",
            "Control state unavailable",
        );
    }
    if app.emit("control/request", &request).is_err() {
        let _ = state
            .pending
            .lock()
            .map(|mut pending| pending.remove(&request.request_id));
        return Response::failure(
            request.request_id,
            "host.notReady",
            "Automation bridge is not connected",
        );
    }
    match receiver.recv_timeout(Duration::from_millis(request.options.timeout_ms)) {
        Ok(response) => response,
        Err(mpsc::RecvTimeoutError::Timeout) => {
            let _ = state
                .pending
                .lock()
                .map(|mut pending| pending.remove(&request.request_id));
            Response::failure(
                request.request_id,
                "request.timeout",
                "Automation bridge did not respond before timeout",
            )
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => Response::failure(
            request.request_id,
            "unknown_outcome",
            "Automation bridge disconnected before responding",
        ),
    }
}

fn write_response<W: Write, T: serde::Serialize>(
    writer: &mut W,
    response: &Response<T>,
) -> io::Result<()> {
    let line = encode_line(response, DEFAULT_MAX_FRAME_BYTES).map_err(io::Error::other)?;
    writer.write_all(&line)?;
    writer.flush()
}

#[cfg(test)]
mod tests {
    use super::ControlState;

    #[test]
    fn bridge_starts_not_ready_until_marked_by_command() {
        let state = ControlState::new();
        assert!(!state.is_bridge_ready());
        state.mark_bridge_ready();
        assert!(state.is_bridge_ready());
    }
}
