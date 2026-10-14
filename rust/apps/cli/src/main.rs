//! `building` is the local control-plane executable. Domain edits stay in the desktop host.

use building_control_protocol::{
    encode_line, parse_request, read_frame, Request, Response, DEFAULT_MAX_FRAME_BYTES,
    PROTOCOL_VERSION,
};
use serde_json::{json, Value};
use std::{
    env,
    io::{self, Write},
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
    Host(String),
}

impl CliError {
    fn code(&self) -> &'static str {
        match self {
            Self::Arguments(_) => "arguments.invalid",
            Self::Host(_) => "host.notAttached",
        }
    }

    fn message(&self) -> &str {
        match self {
            Self::Arguments(message) | Self::Host(message) => message,
        }
    }

    fn exit_code(&self) -> u8 {
        match self {
            Self::Arguments(_) => 2,
            Self::Host(_) => 8,
        }
    }
}

fn capabilities() -> Value {
    json!({
        "protocolVersion": PROTOCOL_VERSION,
        "version": VERSION,
        "transport": ["stdio", "named-pipe", "unix-socket"],
        "modes": ["file", "realtime"],
        "operations": [
            "project.new", "project.open", "project.save", "project.saveAs", "project.close",
            "project.inspect", "project.validate", "edit.apply", "edit.batch", "edit.dryRun",
            "history.undo", "history.redo", "export.glb", "export.gltf", "render.capturePng",
            "camera.get", "camera.set", "window.getState"
        ],
        "status": "control-plane-ready",
        "limitations": ["formal commands require an attached desktop automation host"]
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
            ensure_known_flags(args, &["--pid"])?;
            let pid = required_flag(args, "--pid")?;
            Ok(HumanCommand {
                operation: "host.connect".to_owned(),
                project: None,
                args: json!({ "pid": pid }),
            })
        }
        "attach" => {
            ensure_known_flags(args, &["--session"])?;
            let session = required_flag(args, "--session")?;
            let operation = args
                .iter()
                .filter(|arg| !arg.starts_with('-'))
                .last()
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

fn dispatch_human(command: HumanCommand) -> Result<(), CliError> {
    let project = command.project.as_deref().unwrap_or("<none>");
    Err(CliError::Host(format!(
        "{} requires a desktop automation host (project: {project})",
        command.operation
    )))
}

fn run_stdio() -> i32 {
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
                    return 8;
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
                    return 8;
                }
                continue;
            }
        };
        let response = dispatch_request(request);
        if write_response(&mut stdout, &response).is_err() {
            return 8;
        }
    }
    0
}

fn write_response<W: Write, T: serde::Serialize>(
    writer: &mut W,
    response: &Response<T>,
) -> io::Result<()> {
    let line = encode_line(response, DEFAULT_MAX_FRAME_BYTES).map_err(io::Error::other)?;
    writer.write_all(&line)?;
    writer.flush()
}

fn dispatch_request(request: Request<Value>) -> Response<Value> {
    match request.operation.as_str() {
        "capabilities" => {
            let mut response = Response::success(request.request_id, capabilities());
            response.capabilities = Some(capabilities());
            response
        }
        "ping" => Response::success(request.request_id, json!({ "status": "ready" })),
        _ => Response::failure(
            request.request_id,
            "host.notAttached",
            "Formal project operations require a desktop automation host",
        ),
    }
}

fn print_help() -> io::Result<()> {
    print_json(&json!({
        "name": "building",
        "usage": [
            "building --version",
            "building capabilities --json",
            "building run --stdio",
            "building apply --project <path> --commands <json> --save",
            "building inspect --project <path> --json",
            "building validate --project <path> --json",
            "building export --project <path> --format glb --out <path>"
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
