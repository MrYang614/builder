//! Versioned JSONL control envelopes shared by the CLI and desktop host.

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::{Map, Value};
use std::{
    collections::{HashMap, VecDeque},
    io::BufRead,
};
use thiserror::Error;

pub const PROTOCOL_VERSION: u32 = 1;
pub const DEFAULT_MAX_FRAME_BYTES: usize = 4 * 1024 * 1024;
pub const DEFAULT_MAX_TIMEOUT_MS: u64 = 120_000;
pub const MAX_TIMEOUT_MS: u64 = 600_000;

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ControlMode {
    File,
    Realtime,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct ProjectCursor {
    #[serde(rename = "projectId")]
    pub project_id: String,
    pub revision: u64,
    #[serde(rename = "documentEpoch")]
    pub document_epoch: u64,
    #[serde(
        rename = "runtimeEpoch",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub runtime_epoch: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RequestOptions {
    #[serde(default)]
    pub dry_run: bool,
    #[serde(default = "default_if_dirty")]
    pub if_dirty: String,
    #[serde(default = "default_timeout_ms")]
    pub timeout_ms: u64,
    #[serde(
        rename = "idempotencyKey",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub idempotency_key: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub overwrite: Option<bool>,
}

fn default_if_dirty() -> String {
    "fail".to_owned()
}

fn default_timeout_ms() -> u64 {
    DEFAULT_MAX_TIMEOUT_MS
}

impl Default for RequestOptions {
    fn default() -> Self {
        Self {
            dry_run: false,
            if_dirty: default_if_dirty(),
            timeout_ms: default_timeout_ms(),
            idempotency_key: None,
            overwrite: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Request<T = serde_json::Value> {
    #[serde(rename = "protocolVersion")]
    pub protocol_version: u32,
    #[serde(rename = "requestId")]
    pub request_id: String,
    #[serde(rename = "clientSessionId")]
    pub client_session_id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<ControlMode>,
    #[serde(
        rename = "hostInstanceId",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub host_instance_id: Option<String>,
    pub operation: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project: Option<ProjectCursor>,
    pub args: T,
    #[serde(default)]
    pub options: RequestOptions,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct ErrorBody {
    pub code: String,
    pub message: String,
    #[serde(default)]
    pub details: Option<serde_json::Value>,
    #[serde(default)]
    pub retryable: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Response<T = serde_json::Value> {
    #[serde(rename = "protocolVersion")]
    pub protocol_version: u32,
    #[serde(rename = "requestId")]
    pub request_id: String,
    pub ok: bool,
    #[serde(rename = "projectId", default, skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub revision: Option<u64>,
    #[serde(
        rename = "documentEpoch",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub document_epoch: Option<u64>,
    #[serde(
        rename = "runtimeEpoch",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub runtime_epoch: Option<u64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub result: Option<T>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub change_set: Option<serde_json::Value>,
    #[serde(default)]
    pub warnings: Vec<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorBody>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub capabilities: Option<serde_json::Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub status: Option<serde_json::Value>,
}

impl<T> Response<T> {
    pub fn success(request_id: impl Into<String>, result: T) -> Self {
        Self {
            protocol_version: PROTOCOL_VERSION,
            request_id: request_id.into(),
            ok: true,
            project_id: None,
            revision: None,
            document_epoch: None,
            runtime_epoch: None,
            result: Some(result),
            change_set: None,
            warnings: Vec::new(),
            error: None,
            capabilities: None,
            status: None,
        }
    }

    pub fn failure(request_id: impl Into<String>, code: &str, message: impl Into<String>) -> Self {
        Self {
            protocol_version: PROTOCOL_VERSION,
            request_id: request_id.into(),
            ok: false,
            project_id: None,
            revision: None,
            document_epoch: None,
            runtime_epoch: None,
            result: None,
            change_set: None,
            warnings: Vec::new(),
            error: Some(ErrorBody {
                code: code.to_owned(),
                message: message.into(),
                details: None,
                retryable: None,
            }),
            capabilities: None,
            status: None,
        }
    }
}

#[derive(Debug, Error)]
pub enum ProtocolError {
    #[error("frame exceeds {limit} bytes")]
    FrameTooLarge { limit: usize },
    #[error("invalid JSON: {0}")]
    Json(#[from] serde_json::Error),
    #[error("unsupported protocol version {0}")]
    UnsupportedVersion(u32),
    #[error("requestId is required")]
    MissingRequestId,
    #[error("operation is required")]
    MissingOperation,
    #[error("clientSessionId is required")]
    MissingClientSession,
    #[error("identifier {field} is empty or too long")]
    InvalidIdentifier { field: &'static str },
    #[error("realtime requests require hostInstanceId")]
    MissingHostInstance,
    #[error("project cursor is required for operation {operation}")]
    MissingProjectCursor { operation: String },
    #[error("project cursor is invalid")]
    InvalidProjectCursor,
    #[error("invalid request options")]
    InvalidOptions,
    #[error("request {request_id} was reused with a different payload")]
    DuplicateRequest { request_id: String },
    #[error("write failed: {0}")]
    Write(#[from] std::io::Error),
}

/// Reads one bounded JSONL frame without allocating an attacker-controlled line.
pub fn read_frame<R: BufRead>(
    reader: &mut R,
    max_bytes: usize,
) -> Result<Option<Vec<u8>>, ProtocolError> {
    let mut frame = Vec::new();
    loop {
        let chunk = reader.fill_buf()?.to_vec();
        if chunk.is_empty() {
            return if frame.is_empty() {
                Ok(None)
            } else {
                Ok(Some(frame))
            };
        }
        if let Some(newline) = chunk.iter().position(|byte| *byte == b'\n') {
            if frame.len().saturating_add(newline) > max_bytes {
                reader.consume(newline + 1);
                return Err(ProtocolError::FrameTooLarge { limit: max_bytes });
            }
            frame.extend_from_slice(&chunk[..newline]);
            reader.consume(newline + 1);
            return Ok(Some(frame));
        }
        if frame.len().saturating_add(chunk.len()) > max_bytes {
            reader.consume(chunk.len());
            loop {
                let rest = reader.fill_buf()?.to_vec();
                if rest.is_empty() {
                    break;
                }
                if let Some(newline) = rest.iter().position(|byte| *byte == b'\n') {
                    reader.consume(newline + 1);
                    break;
                }
                reader.consume(rest.len());
            }
            return Err(ProtocolError::FrameTooLarge { limit: max_bytes });
        }
        frame.extend_from_slice(&chunk);
        reader.consume(chunk.len());
    }
}

pub fn parse_request<T: DeserializeOwned>(
    line: &[u8],
    max_bytes: usize,
) -> Result<Request<T>, ProtocolError> {
    if line.len() > max_bytes {
        return Err(ProtocolError::FrameTooLarge { limit: max_bytes });
    }
    let request: Request<T> = serde_json::from_slice(line)?;
    if request.protocol_version != PROTOCOL_VERSION {
        return Err(ProtocolError::UnsupportedVersion(request.protocol_version));
    }
    if request.request_id.trim().is_empty() {
        return Err(ProtocolError::MissingRequestId);
    }
    if request.request_id.len() > 256 {
        return Err(ProtocolError::InvalidIdentifier { field: "requestId" });
    }
    if request.client_session_id.trim().is_empty() {
        return Err(ProtocolError::MissingClientSession);
    }
    if request.client_session_id.len() > 256 {
        return Err(ProtocolError::InvalidIdentifier {
            field: "clientSessionId",
        });
    }
    if let Some(host_instance_id) = request.host_instance_id.as_deref() {
        if host_instance_id.trim().is_empty() || host_instance_id.len() > 256 {
            return Err(ProtocolError::InvalidIdentifier {
                field: "hostInstanceId",
            });
        }
    }
    if request.mode == Some(ControlMode::Realtime) && request.host_instance_id.is_none() {
        return Err(ProtocolError::MissingHostInstance);
    }
    if let Some(project) = request.project.as_ref() {
        validate_project_cursor(project)?;
    }
    if request.operation.trim().is_empty() {
        return Err(ProtocolError::MissingOperation);
    }
    if requires_project_cursor(&request.operation) && request.project.is_none() {
        return Err(ProtocolError::MissingProjectCursor {
            operation: request.operation,
        });
    }
    if !matches!(
        request.options.if_dirty.as_str(),
        "fail" | "save" | "discard"
    ) || !(1..=MAX_TIMEOUT_MS).contains(&request.options.timeout_ms)
    {
        return Err(ProtocolError::InvalidOptions);
    }
    if request
        .options
        .idempotency_key
        .as_deref()
        .is_some_and(|key| key.trim().is_empty() || key.len() > 256)
    {
        return Err(ProtocolError::InvalidIdentifier {
            field: "options.idempotencyKey",
        });
    }
    Ok(request)
}

fn validate_project_cursor(cursor: &ProjectCursor) -> Result<(), ProtocolError> {
    if cursor.project_id.trim().is_empty() || cursor.project_id.len() > 256 {
        return Err(ProtocolError::InvalidProjectCursor);
    }
    Ok(())
}

/// Returns true for commands that only inspect state and do not mutate project history.
pub fn is_read_operation(operation: &str) -> bool {
    matches!(
        operation,
        "project.inspect"
            | "project.validate"
            | "resource.list"
            | "session.get"
            | "camera.get"
            | "camera.captureState"
            | "render.getState"
            | "render.diagnostics"
            | "window.getState"
            | "ping"
            | "capabilities"
            | "controller_ready"
            | "runtime_ready"
            | "host.handshake"
    )
}

/// Returns true when a request can change formal data, runtime state, or history.
pub fn is_write_operation(operation: &str) -> bool {
    !is_read_operation(operation)
}

/// Returns true when the request must carry the current project revision and epoch.
pub fn requires_project_cursor(operation: &str) -> bool {
    !is_read_operation(operation)
        && !matches!(operation, "project.new" | "project.open" | "project.close")
}

pub fn encode_line<T: Serialize>(value: &T, max_bytes: usize) -> Result<Vec<u8>, ProtocolError> {
    let mut encoded = serde_json::to_vec(value)?;
    if encoded.len().saturating_add(1) > max_bytes {
        return Err(ProtocolError::FrameTooLarge { limit: max_bytes });
    }
    encoded.push(b'\n');
    Ok(encoded)
}

/// Keeps a bounded response cache so retries of the same requestId are safe and deterministic.
#[derive(Debug)]
pub struct IdempotencyCache {
    capacity: usize,
    order: VecDeque<CacheKey>,
    values: HashMap<CacheKey, CacheEntry>,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
struct CacheKey {
    client_session_id: String,
    request_id: String,
}

#[derive(Debug)]
struct CacheEntry {
    fingerprint: Vec<u8>,
    response: Vec<u8>,
}

impl IdempotencyCache {
    pub fn new(capacity: usize) -> Self {
        Self {
            capacity: capacity.max(1),
            order: VecDeque::new(),
            values: HashMap::new(),
        }
    }

    pub fn get<T: Serialize>(&self, request: &Request<T>) -> Result<Option<&[u8]>, ProtocolError> {
        let key = CacheKey {
            client_session_id: request.client_session_id.clone(),
            request_id: request.request_id.clone(),
        };
        let fingerprint = request_fingerprint(request)?;
        let Some(entry) = self.values.get(&key) else {
            return Ok(None);
        };
        if entry.fingerprint != fingerprint {
            return Err(ProtocolError::DuplicateRequest {
                request_id: request.request_id.clone(),
            });
        }
        Ok(Some(entry.response.as_slice()))
    }

    pub fn insert<T: Serialize>(
        &mut self,
        request: &Request<T>,
        response: Vec<u8>,
    ) -> Result<(), ProtocolError> {
        let key = CacheKey {
            client_session_id: request.client_session_id.clone(),
            request_id: request.request_id.clone(),
        };
        let fingerprint = request_fingerprint(request)?;
        if let Some(entry) = self.values.get(&key) {
            if entry.fingerprint != fingerprint {
                return Err(ProtocolError::DuplicateRequest {
                    request_id: request.request_id.clone(),
                });
            }
            return Ok(());
        }
        self.order.push_back(key.clone());
        self.values.insert(
            key,
            CacheEntry {
                fingerprint,
                response,
            },
        );
        while self.order.len() > self.capacity {
            if let Some(old) = self.order.pop_front() {
                self.values.remove(&old);
            }
        }
        Ok(())
    }
}

fn request_fingerprint<T: Serialize>(request: &Request<T>) -> Result<Vec<u8>, ProtocolError> {
    let value = serde_json::to_value(request)?;
    serde_json::to_vec(&canonicalize(value)).map_err(ProtocolError::Json)
}

fn canonicalize(value: Value) -> Value {
    match value {
        Value::Array(values) => Value::Array(values.into_iter().map(canonicalize).collect()),
        Value::Object(object) => {
            let mut entries: Vec<_> = object.into_iter().collect();
            entries.sort_unstable_by(|left, right| left.0.cmp(&right.0));
            let mut canonical = Map::new();
            for (key, value) in entries {
                canonical.insert(key, canonicalize(value));
            }
            Value::Object(canonical)
        }
        other => other,
    }
}

#[cfg(test)]
mod tests;
