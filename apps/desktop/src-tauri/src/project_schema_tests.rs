use crate::storage::validate_document;
use serde_json::{json, Value};

fn project() -> Value {
    json!({"schemaVersion":1,"id":"project_1","name":"中文 Building","revision":0,"levels":[{"id":"level_1","name":"一楼","elevation":0,"height":3}],"walls":[],"slabs":[],"openings":[],"resources":[],"continuity":[]})
}
fn surface() -> Value {
    json!({"color":"#ded8cd","tileWidth":0.5,"tileHeight":0.5,"rotation":0,"offsetX":0,"offsetY":0})
}
fn wall(id: &str, start: [f64; 2], end: [f64; 2], thickness: f64) -> Value {
    json!({
        "id":id,"levelId":"level_1",
        "start":{"x":start[0],"z":start[1]},"end":{"x":end[0],"z":end[1]},
        "height":3,"thickness":thickness,
        "materials":{"A":surface(),"B":surface(),"edge":surface()}
    })
}
fn assert_invalid(document: &Value) {
    assert_eq!(
        validate_document(document).unwrap_err().code,
        "invalid_project"
    );
}
fn door(id: &str, wall_id: &str, offset: f64) -> Value {
    json!({
        "id":id,"levelId":"level_1","wallId":wall_id,"kind":"door",
        "offset":offset,"width":0.8,"height":2,"sill":0,"hinge":"left",
        "direction":1,"angle":0,"openAngle":90,"duration":1
    })
}

#[test]
fn native_schema_matches_editor_core_numeric_and_identifier_bounds() {
    let mut document = project();
    document["id"] = json!("项目");
    assert_invalid(&document);
    document = project();
    document["walls"] = json!([wall("wall_1", [0.0, 0.0], [0.04, 0.0], 0.2)]);
    assert_invalid(&document);
    document = project();
    document["walls"] = json!([wall("wall_1", [0.0, 0.0], [1.0, 0.0], 0.2)]);
    document["walls"][0]["height"] = json!(10_001.0);
    assert_invalid(&document);
    document = project();
    document["slabs"] = json!([{
        "id":"slab_1","levelId":"level_1",
        "polygon":[{"x":0,"z":0},{"x":1,"z":1},{"x":2,"z":0},{"x":1,"z":-1}],
        "elevation":0,"thickness":0.2,"purpose":"floor",
        "materials":{"top":surface(),"bottom":surface(),"edge":surface()}
    }]);
    assert_invalid(&document);
    document = project();
    document["walls"] = json!([wall("wall_1", [0.0, 0.0], [2.0, 0.0], 0.2)]);
    document["openings"] = json!([{
        "id":"door_1","levelId":"level_1","wallId":"wall_1","kind":"door",
        "offset":0.2,"width":0.8,"height":2,"sill":0,"hinge":"left","direction":1,
        "angle":181,"openAngle":90,"duration":1
    }]);
    assert_invalid(&document);

    document = project();
    document["walls"] = json!([
        wall("wall_1", [0.0, 0.0], [2.0, 0.0], 0.2),
        wall("wall_2", [1.0, 0.0], [3.0, 0.0], 0.2)
    ]);
    assert_invalid(&document);

    document = project();
    document["walls"] = json!([
        wall("wall_1", [0.0, 0.0], [2.0, 0.0], 0.2),
        wall("wall_2", [1.0, -1.0], [1.0, 1.0], 0.2)
    ]);
    assert_invalid(&document);

    document = project();
    document["walls"] = json!([
        wall("wall_1", [0.0, 0.0], [2.0, 0.0], 0.2),
        wall("wall_2", [2.0, 0.0], [2.0, 1.0], 0.3)
    ]);
    assert_invalid(&document);

    document = project();
    document["walls"] = json!([
        wall("wall_1", [0.0, 0.0], [2.0, 0.0], 0.2),
        wall("wall_2", [2.0, 0.0], [2.0, 2.0], 0.2)
    ]);
    document["openings"] = json!([door("door_1", "wall_1", 1.8)]);
    assert_invalid(&document);

    document = project();
    document["walls"] = json!([wall("wall_1", [0.0, 0.0], [3.0, 0.0], 0.2)]);
    document["openings"] = json!([
        door("door_1", "wall_1", 0.2),
        door("door_2", "wall_1", 1.04)
    ]);
    assert_invalid(&document);
}
