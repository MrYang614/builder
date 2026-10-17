use crate::project_schema::{Point, Wall};

fn same_point(a: &Point, b: &Point) -> bool {
    (a.x - b.x).abs() < 1e-7 && (a.z - b.z).abs() < 1e-7
}
fn on_segment(point: &Point, wall: &Wall) -> bool {
    let dx = wall.end.x - wall.start.x;
    let dz = wall.end.z - wall.start.z;
    ((point.x - wall.start.x) * dz - (point.z - wall.start.z) * dx).abs() <= 1e-7
        && point.x >= wall.start.x.min(wall.end.x) - 1e-7
        && point.x <= wall.start.x.max(wall.end.x) + 1e-7
        && point.z >= wall.start.z.min(wall.end.z) - 1e-7
        && point.z <= wall.start.z.max(wall.end.z) + 1e-7
}
pub(crate) fn point_on_segment(point: &Point, wall: &Wall) -> bool {
    on_segment(point, wall)
}
fn walls_connected(a: &Wall, b: &Wall) -> bool {
    on_segment(&a.start, b)
        || on_segment(&a.end, b)
        || on_segment(&b.start, a)
        || on_segment(&b.end, a)
}

/// Rejects unsupported wall overlap and unequal orthogonal junctions before native save/open.
pub(crate) fn validate_wall_pairs(walls: &[Wall]) -> bool {
    for (index, a) in walls.iter().enumerate() {
        for b in walls.iter().skip(index + 1) {
            if a.level_id != b.level_id {
                continue;
            }
            let a_horizontal = (a.start.z - a.end.z).abs() < 1e-7;
            let b_horizontal = (b.start.z - b.end.z).abs() < 1e-7;
            let connected = walls_connected(a, b);
            if a_horizontal == b_horizontal {
                let same_axis = if a_horizontal {
                    (a.start.z - b.start.z).abs() < 1e-7
                } else {
                    (a.start.x - b.start.x).abs() < 1e-7
                };
                if same_axis {
                    let a_min = if a_horizontal {
                        a.start.x.min(a.end.x)
                    } else {
                        a.start.z.min(a.end.z)
                    };
                    let a_max = if a_horizontal {
                        a.start.x.max(a.end.x)
                    } else {
                        a.start.z.max(a.end.z)
                    };
                    let b_min = if b_horizontal {
                        b.start.x.min(b.end.x)
                    } else {
                        b.start.z.min(b.end.z)
                    };
                    let b_max = if b_horizontal {
                        b.start.x.max(b.end.x)
                    } else {
                        b.start.z.max(b.end.z)
                    };
                    if a_max.min(b_max) - a_min.max(b_min) > 1e-7
                        || (connected && (a.thickness - b.thickness).abs() > 1e-7)
                    {
                        return false;
                    }
                }
            } else {
                let (horizontal, vertical) = if a_horizontal { (a, b) } else { (b, a) };
                let hit = Point {
                    x: vertical.start.x,
                    z: horizontal.start.z,
                };
                if on_segment(&hit, horizontal) && on_segment(&hit, vertical) {
                    let endpoint = same_point(&hit, &a.start)
                        || same_point(&hit, &a.end)
                        || same_point(&hit, &b.start)
                        || same_point(&hit, &b.end);
                    if !endpoint || (a.thickness - b.thickness).abs() > 1e-7 {
                        return false;
                    }
                }
            }
            if !connected {
                let bounds = |wall: &Wall| {
                    (
                        wall.start.x.min(wall.end.x)
                            - if (wall.start.x - wall.end.x).abs() < 1e-7 {
                                wall.thickness / 2.0
                            } else {
                                0.0
                            },
                        wall.start.x.max(wall.end.x)
                            + if (wall.start.x - wall.end.x).abs() < 1e-7 {
                                wall.thickness / 2.0
                            } else {
                                0.0
                            },
                        wall.start.z.min(wall.end.z)
                            - if (wall.start.z - wall.end.z).abs() < 1e-7 {
                                wall.thickness / 2.0
                            } else {
                                0.0
                            },
                        wall.start.z.max(wall.end.z)
                            + if (wall.start.z - wall.end.z).abs() < 1e-7 {
                                wall.thickness / 2.0
                            } else {
                                0.0
                            },
                    )
                };
                let (amin_x, amax_x, amin_z, amax_z) = bounds(a);
                let (bmin_x, bmax_x, bmin_z, bmax_z) = bounds(b);
                if amax_x.min(bmax_x) - amin_x.max(bmin_x) > 1e-7
                    && amax_z.min(bmax_z) - amin_z.max(bmin_z) > 1e-7
                {
                    return false;
                }
            }
        }
    }
    true
}
