use super::*;
use std::io::Cursor;

fn request() -> Vec<u8> {
    br#"{"protocolVersion":1,"requestId":"req-1","clientSessionId":"client","operation":"session.get","args":{},"options":{}}"#.to_vec()
}

#[test]
fn parses_versioned_request_and_defaults_options() {
    let parsed: Request = parse_request(&request(), DEFAULT_MAX_FRAME_BYTES).expect("request");
    assert_eq!(parsed.operation, "session.get");
    assert_eq!(parsed.options.timeout_ms, DEFAULT_MAX_TIMEOUT_MS);
}

#[test]
fn rejects_unknown_fields_and_version() {
    let unknown = br#"{"protocolVersion":1,"requestId":"r","clientSessionId":"c","operation":"session.get","extra":true}"#;
    assert!(matches!(
        parse_request::<serde_json::Value>(unknown, 4096),
        Err(ProtocolError::Json(_))
    ));
    let version = request().iter().map(|byte| *byte).collect::<Vec<_>>();
    let mut value: serde_json::Value = serde_json::from_slice(&version).expect("json");
    value["protocolVersion"] = serde_json::json!(2);
    let encoded = serde_json::to_vec(&value).expect("json");
    assert!(matches!(
        parse_request::<serde_json::Value>(&encoded, 4096),
        Err(ProtocolError::UnsupportedVersion(2))
    ));

    let realtime = br#"{"protocolVersion":1,"requestId":"r","clientSessionId":"c","mode":"realtime","operation":"session.get","args":{},"options":{}}"#;
    assert!(matches!(
        parse_request::<serde_json::Value>(realtime, 4096),
        Err(ProtocolError::MissingHostInstance)
    ));

    let mut timeout: serde_json::Value = serde_json::from_slice(&request()).expect("json");
    timeout["options"]["timeoutMs"] = serde_json::json!(MAX_TIMEOUT_MS + 1);
    let encoded = serde_json::to_vec(&timeout).expect("json");
    assert!(matches!(
        parse_request::<serde_json::Value>(&encoded, 4096),
        Err(ProtocolError::InvalidOptions)
    ));
}

#[test]
fn cache_is_bounded_and_does_not_replace_existing_result() {
    let mut cache = IdempotencyCache::new(2);
    let mut first: Request = serde_json::from_slice(&request()).expect("request");
    first.request_id = "a".to_owned();
    let mut second = first.clone();
    second.request_id = "b".to_owned();
    let mut third = first.clone();
    third.request_id = "c".to_owned();
    cache.insert(&first, b"one".to_vec()).expect("cache insert");
    cache
        .insert(&first, b"changed".to_vec())
        .expect("same request is idempotent");
    cache
        .insert(&second, b"two".to_vec())
        .expect("cache insert");
    cache
        .insert(&third, b"three".to_vec())
        .expect("cache insert");
    assert_eq!(cache.get(&first).expect("cache lookup"), None);
    assert_eq!(cache.get(&second).expect("cache lookup"), Some(&b"two"[..]));
    assert_eq!(
        cache.get(&third).expect("cache lookup"),
        Some(&b"three"[..])
    );
}

#[test]
fn cache_scopes_request_ids_and_rejects_payload_reuse() {
    let mut cache = IdempotencyCache::new(8);
    let mut original: Request = serde_json::from_slice(&request()).expect("request");
    original.request_id = "same".to_owned();
    cache
        .insert(&original, b"result".to_vec())
        .expect("cache insert");

    let mut other_session = original.clone();
    other_session.client_session_id = "other-client".to_owned();
    assert_eq!(cache.get(&other_session).expect("cache lookup"), None);

    let mut changed = original.clone();
    changed.args = serde_json::json!({"changed": true});
    assert!(matches!(
        cache.get(&changed),
        Err(ProtocolError::DuplicateRequest { .. })
    ));
    assert!(matches!(
        cache.insert(&changed, b"different".to_vec()),
        Err(ProtocolError::DuplicateRequest { .. })
    ));
}

#[test]
fn operation_classifier_requires_cursors_for_formal_writes() {
    assert!(is_read_operation("project.inspect"));
    assert!(is_read_operation("host.handshake"));
    assert!(is_write_operation("project.new"));
    assert!(requires_project_cursor("project.open"));
    let mut request: Request = serde_json::from_slice(&request()).expect("request");
    request.operation = "project.new".to_owned();
    assert!(matches!(
        parse_request::<Value>(&serde_json::to_vec(&request).expect("json"), 4096),
        Err(ProtocolError::MissingProjectCursor { .. })
    ));
}

#[test]
fn bounded_frame_reader_drains_oversized_lines_and_recovers() {
    let mut reader = Cursor::new(b"123456789\nnext\n".to_vec());
    assert!(matches!(
        read_frame(&mut reader, 4),
        Err(ProtocolError::FrameTooLarge { limit: 4 })
    ));
    assert_eq!(
        read_frame(&mut reader, 4).expect("next frame"),
        Some(b"next".to_vec())
    );
}
