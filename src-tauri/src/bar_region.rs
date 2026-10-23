//! Restrict the HWND itself so clear space passes input across process boundaries.
use serde::Deserialize;
use windows::Win32::{
    Foundation::{HWND, POINT},
    Graphics::Gdi::*,
};

#[derive(Clone, Copy, Deserialize)]
pub struct Point {
    x: f64,
    y: f64,
}

fn valid(polygons: &[Vec<Point>]) -> bool {
    polygons.len() <= 128
        && polygons.iter().all(|polygon| {
            (3..=2048).contains(&polygon.len())
                && polygon.iter().all(|p| {
                    p.x.is_finite()
                        && p.y.is_finite()
                        && p.x.abs() <= 100_000.0
                        && p.y.abs() <= 100_000.0
                })
        })
}

pub fn set(window: &tauri::WebviewWindow, polygons: Vec<Vec<Point>>) -> Result<(), String> {
    if !window.label().starts_with("bar-") || !valid(&polygons) {
        return Err("Invalid bar input region or caller".into());
    }
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let hwnd = window.hwnd().map_err(|e| e.to_string())?;
    apply(hwnd, polygons, scale)
}

fn apply(hwnd: HWND, polygons: Vec<Vec<Point>>, scale: f64) -> Result<(), String> {
    unsafe {
        let region = CreateRectRgn(0, 0, 0, 0);
        if region.0.is_null() {
            return Err("CreateRectRgn failed".into());
        }
        for polygon in polygons {
            let points: Vec<POINT> = polygon
                .iter()
                .map(|p| POINT {
                    x: (p.x * scale).round() as i32,
                    y: (p.y * scale).round() as i32,
                })
                .collect();
            let part = CreatePolygonRgn(&points, WINDING);
            if part.0.is_null() {
                let _ = DeleteObject(region.into());
                return Err("CreatePolygonRgn failed".into());
            }
            let combined = CombineRgn(Some(region), Some(region), Some(part), RGN_OR);
            let _ = DeleteObject(part.into());
            if combined == RGN_ERROR {
                let _ = DeleteObject(region.into());
                return Err("CombineRgn failed".into());
            }
        }
        // Windows owns the region after success. No HWND position or AppBar
        // reservation is changed, and WebView2 keeps its normal focus behavior.
        if SetWindowRgn(hwnd, Some(region), true) == 0 {
            let _ = DeleteObject(region.into());
            return Err("SetWindowRgn failed".into());
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn native_region_preserves_islands_and_excludes_the_gap_at_scaled_dpi() {
        use windows::{core::w, Win32::UI::WindowsAndMessaging::*};
        unsafe {
            let hwnd = CreateWindowExW(
                WINDOW_EX_STYLE::default(),
                w!("STATIC"),
                w!("Strata region test"),
                WS_POPUP,
                0,
                0,
                600,
                80,
                None,
                None,
                None,
                None,
            )
            .unwrap();
            let rect = |x: f64| {
                vec![
                    Point { x, y: 0.0 },
                    Point {
                        x: x + 50.0,
                        y: 0.0,
                    },
                    Point {
                        x: x + 50.0,
                        y: 36.0,
                    },
                    Point { x, y: 36.0 },
                ]
            };
            apply(hwnd, vec![rect(0.0), rect(200.0)], 1.5).unwrap();
            let actual = CreateRectRgn(0, 0, 0, 0);
            assert_ne!(GetWindowRgn(hwnd, actual), RGN_ERROR);
            assert!(PtInRegion(actual, 30, 20).as_bool());
            assert!(!PtInRegion(actual, 150, 20).as_bool());
            assert!(PtInRegion(actual, 320, 20).as_bool());
            // Replacement removes old hit areas, including an empty layout.
            apply(hwnd, vec![], 1.5).unwrap();
            let _ = GetWindowRgn(hwnd, actual);
            assert!(!PtInRegion(actual, 30, 20).as_bool());
            let _ = DeleteObject(actual.into());
            DestroyWindow(hwnd).unwrap();
        }
    }
    #[test]
    fn input_is_bounded_and_empty_layout_is_allowed() {
        assert!(valid(&[]));
        assert!(!valid(&[vec![Point { x: 0.0, y: 0.0 }; 2]]));
        assert!(!valid(&[vec![
            Point {
                x: f64::NAN,
                y: 0.0
            };
            3
        ]]));
        assert!(!valid(&[vec![
            Point {
                x: 100_001.0,
                y: 0.0
            };
            3
        ]]));
        assert!(!valid(&vec![vec![Point { x: 0.0, y: 0.0 }; 3]; 129]));
    }
}
