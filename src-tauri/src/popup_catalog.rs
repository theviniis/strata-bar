use serde::Deserialize;
use std::{collections::HashMap, sync::OnceLock};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PopupSpec {
    pub label: String,
    #[serde(default = "default_width")]
    pub width: f64,
    #[serde(default = "default_height")]
    pub max_height: f64,
}
fn default_width() -> f64 {
    320.0
}
fn default_height() -> f64 {
    380.0
}

fn catalog() -> &'static HashMap<String, PopupSpec> {
    static CATALOG: OnceLock<HashMap<String, PopupSpec>> = OnceLock::new();
    CATALOG.get_or_init(|| {
        let catalog: HashMap<String, PopupSpec> =
            serde_json::from_str(include_str!("../../src/popups/catalog.json"))
                .expect("Invalid shared popup catalog");
        assert!(
            catalog.values().all(|p| !p.label.trim().is_empty()
                && p.width.is_finite()
                && (1.0..=2048.0).contains(&p.width)
                && p.max_height.is_finite()
                && (13.0..=2048.0).contains(&p.max_height)),
            "Invalid popup dimensions"
        );
        catalog
    })
}

pub fn get(id: &str) -> Option<PopupSpec> {
    catalog().get(id).cloned()
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn catalog_is_valid_and_unknown_ids_are_rejected() {
        assert!(!catalog().is_empty());
        assert!(get("unregistered-popup").is_none());
    }
    #[test]
    fn omitted_dimensions_use_shared_defaults() {
        let spec: PopupSpec = serde_json::from_str(r#"{"label":"Test"}"#).unwrap();
        assert_eq!(spec.width, 320.0);
        assert_eq!(spec.max_height, 380.0);
    }
}
