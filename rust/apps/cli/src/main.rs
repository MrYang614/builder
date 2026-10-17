//! `building` is the local control-plane executable. Domain edits stay in the desktop host.

mod host;
mod realtime;

use building_control_protocol::{ProjectCursor, RequestOptions, Response, PROTOCOL_VERSION};
use host::{HostError, HostSession};
use serde_json::{json, Value};
use std::{
    env,
    io::{self, Write},
    path::PathBuf,
    process::ExitCode,
};

const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Debug, PartialEq)]
struct HumanCommand {
    operation: String,
    project: Option<String>,
    args: Value,
}

#[derive(Debug, PartialEq)]
enum CliError {
    Arguments(String),
    Host { code: String, message: String },
}

impl CliError {
    fn from_host(error: HostError) -> Self {
        Self::Host {
            code: error.code.to_owned(),
            message: error.message,
        }
    }

    fn response(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self::Host {
            code: code.into(),
            message: message.into(),
        }
    }

    fn code(&self) -> &str {
        match self {
            Self::Arguments(_) => "arguments.invalid",
            Self::Host { code, .. } => code,
        }
    }

    fn message(&self) -> &str {
        match self {
            Self::Arguments(message) => message,
            Self::Host { message, .. } => message,
        }
    }

    fn exit_code(&self) -> u8 {
        match self {
            Self::Arguments(_) => 2,
            Self::Host { .. } => 8,
        }
    }
}

fn capabilities() -> Value {
    json!({
        "protocolVersion": PROTOCOL_VERSION,
        "version": VERSION,
        "transport": ["stdio", "named-pipe"],
        "modes": ["file", "realtime"],
        "operations": [
            "project.new", "project.open", "project.save", "project.saveAs", "project.close",
            "project.inspect", "project.validate", "project.rename", "edit.apply", "edit.batch",
            "edit.dryRun", "history.undo", "history.redo", "wall.create", "slab.createRectangle",
            "session.get", "session.setLevel", "session.setTool", "session.select",
            "session.setHidden", "session.setWholeBuildingPreview", "session.setSnapSettings",
            "render.getState", "render.setBackend", "render.setMode", "render.setSamples",
            "render.pause", "render.resume", "render.setPostProcessing", "render.diagnostics"
        ],
        "status": "sibling-host-proxy-ready",
        "limitations": [
            "Unix socket discovery is not implemented on macOS",
            "GUI realtime descriptors currently omit independent process-start-time validation",
            "GLB/GLTF, PNG, camera and window commands are not wired in the shared handler"
        ]
    })
}

fn print_json(value: &Value) -> io::Result<()> {
    let mut stdout = io::BufWriter::new(io::stdout().lock());
    serde_json::to_writer(&mut stdout, value)?;
    stdout.write_all(b"\n")?;
    stdout.flush()
}

fn required_flag(args: &[String], name: &str) -> Result<String, CliError> {
    let Some(index) = args.iter().position(|arg| arg == name) else {
        return Err(CliError::Arguments(format!("missing {name}")));
    };
    let value = args
        .get(index + 1)
        .ok_or_else(|| CliError::Arguments(format!("{name} requires a value")))?;
    if value.starts_with('-') {
        return Err(CliError::Arguments(format!("{name} requires a value")));
    }
    Ok(value.clone())
}

fn ensure_known_flags(args: &[String], known: &[&str]) -> Result<(), CliError> {
    let mut index = 0;
    while index < args.len() {
        let argument = args[index].as_str();
        if !argument.starts_with('-') {
            index += 1;
            continue;
        }
        if !known.contains(&argument) {
            return Err(CliError::Arguments(format!("unknown option {argument}")));
        }
        if matches!(
            argument,
            "--project" | "--commands" | "--format" | "--out" | "--pid" | "--session"
        ) {
            index += 1;
        }
        index += 1;
    }
    Ok(())
}

fn parse_human_command(command: &str, args: &[String]) -> Result<HumanCommand, CliError> {
    match command {
        "inspect" => {
            ensure_known_flags(args, &["--project", "--json"])?;
            let project = required_flag(args, "--project")?;
            Ok(HumanCommand {
                operation: "project.inspect".to_owned(),
                project: Some(project.clone()),
                args: json!({ "path": project }),
            })
        }
        "validate" => {
            ensure_known_flags(args, &["--project", "--json"])?;
            let project = required_flag(args, "--project")?;
            Ok(HumanCommand {
                operation: "project.validate".to_owned(),
                project: Some(project.clone()),
                args: json!({ "path": project }),
            })
        }
        "apply" => {
            ensure_known_flags(args, &["--project", "--commands", "--save"])?;
            let project = required_flag(args, "--project")?;
            let commands = required_flag(args, "--commands")?;
            let commands = serde_json::from_str::<Value>(&commands).map_err(|error| {
                CliError::Arguments(format!("--commands must be valid JSON: {error}"))
            })?;
            Ok(HumanCommand {
                operation: "edit.batch".to_owned(),
                project: Some(project.clone()),
                args: json!({ "path": project, "commands": commands, "save": args.iter().any(|arg| arg == "--save") }),
            })
        }
        "export" => {
            ensure_known_flags(args, &["--project", "--format", "--out"])?;
            let project = required_flag(args, "--project")?;
            let format = required_flag(args, "--format")?.to_ascii_lowercase();
            let operation = match format.as_str() {
                "glb" => "export.glb",
                "gltf" => "export.gltf",
                _ => {
                    return Err(CliError::Arguments(
                        "--format must be glb or gltf".to_owned(),
                    ));
                }
            };
            let output = required_flag(args, "--out")?;
            Ok(HumanCommand {
                operation: operation.to_owned(),
                project: Some(project.clone()),
                args: json!({ "path": project, "output": output }),
            })
        }
        "run" => {
            ensure_known_flags(args, &["--project"])?;
            let project = args
                .iter()
                .position(|arg| arg == "--project")
                .map(|_| required_flag(args, "--project"))
                .transpose()?;
            Ok(HumanCommand {
                operation: "host.start".to_owned(),
                project: project.clone(),
                args: json!({ "path": project }),
            })
        }
        "connect" => {
            ensure_known_flags(args, &["--pid", "--stdio"])?;
            let pid = required_flag(args, "--pid")?;
            Ok(HumanCommand {
                operation: "host.connect".to_owned(),
                project: None,
                args: json!({ "pid": pid, "stdio": args.iter().any(|arg| arg == "--stdio") }),
            })
        }
        "attach" => {
            ensure_known_flags(args, &["--session"])?;
            let session = required_flag(args, "--session")?;
            let operation = args
                .iter()
                .rfind(|arg| !arg.starts_with('-'))
                .cloned()
                .ok_or_else(|| CliError::Arguments("attach requires an operation".to_owned()))?;
            Ok(HumanCommand {
                operation,
                project: None,
                args: json!({ "session": session }),
            })
        }
        "render" | "window" => Ok(HumanCommand {
            operation: format!("{command}.control"),
            project: None,
            args: Value::Object(Default::default()),
        }),
        _ => Err(CliError::Arguments(format!("unknown command {command}"))),
    }
}

fn human_error(error: CliError) -> io::Result<()> {
    let request_id = format!("cli-{}", std::process::id());
    let mut response: Response<Value> =
        Response::failure(request_id, error.code(), error.message());
    response.status = Some(json!({ "operation": "human-command" }));
    print_json(&serde_json::to_value(response).map_err(io::Error::other)?)
}

fn response_cursor(response: &Response<Value>) -> Option<ProjectCursor> {
    Some(ProjectCursor {
        project_id: response.project_id.clone()?,
        revision: response.revision?,
        document_epoch: response.document_epoch?,
        runtime_epoch: response.runtime_epoch,
    })
}

fn absolute_path(path: &str) -> String {
    let candidate = PathBuf::from(path);
    if candidate.is_absolute() {
        return candidate.to_string_lossy().into_owned();
    }
    env::current_dir()
        .map(|directory| directory.join(candidate))
        .unwrap_or_else(|_| PathBuf::from(path))
        .to_string_lossy()
        .into_owned()
}

fn dispatch_human(command: HumanCommand) -> Result<(), CliError> {
    let mut host = if command.operation == "host.connect" {
        let pid = command
            .args
            .get("pid")
            .and_then(Value::as_str)
            .ok_or_else(|| CliError::response("arguments.invalid", "connect requires --pid"))?;
        HostSession::connect(pid).map_err(CliError::from_host)?
    } else {
        HostSession::start().map_err(CliError::from_host)?
    };
    if command.operation == "host.connect"
        && command
            .args
            .get("stdio")
            .and_then(Value::as_bool)
            .unwrap_or(false)
    {
        host.proxy_stdio().map_err(CliError::from_host)?;
        return Ok(());
    }
    let mut cursor = None;
    if let Some(path) = command.project.as_deref() {
        let path = absolute_path(path);
        let opened = host
            .request(
                "project.open",
                json!({ "path": path }),
                None,
                RequestOptions {
                    if_dirty: "discard".to_owned(),
                    ..RequestOptions::default()
                },
            )
            .map_err(CliError::from_host)?;
        if !opened.ok {
            return Err(response_error(&opened));
        }
        cursor = response_cursor(&opened);
    }

    let mut operation = command.operation;
    let mut args = command.args;
    let save_after =
        operation == "edit.batch" && args.get("save").and_then(Value::as_bool).unwrap_or(false);
    if let Some(object) = args.as_object_mut() {
        object.remove("path");
        object.remove("save");
    }
    if operation == "host.start" || operation == "host.connect" {
        operation = "host.handshake".to_owned();
        args = json!({});
    }
    let mut response = host
        .request(operation, args, cursor.clone(), RequestOptions::default())
        .map_err(CliError::from_host)?;
    if response.ok && save_after {
        cursor = response_cursor(&response).or(cursor);
        response = host
            .request("project.save", json!({}), cursor, RequestOptions::default())
            .map_err(CliError::from_host)?;
    }
    if !response.ok {
        return Err(response_error(&response));
    }
    let value = serde_json::to_value(response)
        .map_err(|error| CliError::response("host.serializationFailed", error.to_string()))?;
    print_json(&value)
        .map_err(|error| CliError::response("host.writeFailed", error.to_string()))?;
    Ok(())
}

fn response_error(response: &Response<Value>) -> CliError {
    let error = response.error.as_ref();
    CliError::response(
        error
            .map(|value| value.code.as_str())
            .unwrap_or("host.requestFailed"),
        error
            .map(|value| value.message.as_str())
            .unwrap_or("Desktop host rejected the request"),
    )
}

fn run_stdio() -> i32 {
    match HostSession::start().and_then(|mut host| host.proxy_stdio()) {
        Ok(code) => code,
        Err(error) => {
            let _ = human_error(CliError::from_host(error));
            8
        }
    }
}

fn print_help() -> io::Result<()> {
    print_json(&json!({
        "name": "building",
        "usage": [
            "building --version",
            "building capabilities --json",
            "building run --stdio",
            "building connect --pid <pid> --stdio",
            "building apply --project <path> --commands <json> --save",
            "building inspect --project <path> --json",
            "building validate --project <path> --json"
        ],
        "protocolVersion": PROTOCOL_VERSION
    }))
}

fn main() -> ExitCode {
    let args = env::args().skip(1).collect::<Vec<_>>();
    let result = match args.first().map(String::as_str) {
        Some("--version") | Some("-V") => {
            print_json(&json!({ "version": VERSION, "protocolVersion": PROTOCOL_VERSION }))
        }
        Some("capabilities") => print_json(&capabilities()),
        Some("run") if args.iter().any(|arg| arg == "--stdio") => {
            return ExitCode::from(run_stdio() as u8)
        }
        Some(
            command @ ("run" | "inspect" | "validate" | "apply" | "export" | "connect" | "attach"
            | "render" | "window"),
        ) => match parse_human_command(command, &args[1..]).and_then(dispatch_human) {
            Ok(()) => return ExitCode::SUCCESS,
            Err(error) => {
                let exit_code = error.exit_code();
                if human_error(error).is_err() {
                    return ExitCode::from(9);
                }
                return ExitCode::from(exit_code);
            }
        },
        Some("--help") | Some("-h") | None => print_help(),
        Some(_) => {
            let _ = print_json(
                &json!({ "ok": false, "error": { "code": "arguments.invalid", "message": "Use building run --stdio for JSONL control" } }),
            );
            return ExitCode::from(2);
        }
    };
    if result.is_ok() {
        ExitCode::SUCCESS
    } else {
        ExitCode::from(9)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| (*value).to_owned()).collect()
    }

    #[test]
    fn parses_inspect_and_validate_paths() {
        let inspect =
            parse_human_command("inspect", &args(&["--project", "demo.building", "--json"]))
                .expect("inspect");
        assert_eq!(inspect.operation, "project.inspect");
        assert_eq!(inspect.project.as_deref(), Some("demo.building"));
        let validate = parse_human_command("validate", &args(&["--project", "demo.building"]))
            .expect("validate");
        assert_eq!(validate.operation, "project.validate");
    }

    #[test]
    fn parses_apply_and_export_arguments() {
        let apply = parse_human_command(
            "apply",
            &args(&[
                "--project",
                "demo.building",
                "--commands",
                "[{\"type\":\"noop\"}]",
                "--save",
            ]),
        )
        .expect("apply");
        assert_eq!(apply.operation, "edit.batch");
        assert_eq!(apply.args["save"], true);
        let export = parse_human_command(
            "export",
            &args(&[
                "--project",
                "demo.building",
                "--format",
                "glb",
                "--out",
                "demo.glb",
            ]),
        )
        .expect("export");
        assert_eq!(export.operation, "export.glb");
        assert_eq!(export.args["output"], "demo.glb");
    }

    #[test]
    fn rejects_missing_and_unknown_arguments() {
        assert!(matches!(
            parse_human_command("inspect", &args(&["--json"])),
            Err(CliError::Arguments(_))
        ));
        assert!(matches!(
            parse_human_command(
                "export",
                &args(&["--project", "a", "--format", "png", "--out", "a.png"])
            ),
            Err(CliError::Arguments(_))
        ));
        assert!(matches!(
            parse_human_command("validate", &args(&["--project", "a", "--wat"])),
            Err(CliError::Arguments(_))
        ));
    }
}
