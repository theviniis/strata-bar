use serde::Deserialize;
use std::{collections::HashMap, sync::OnceLock};

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PopupSpec {
    pub label: String,
}

fn catalog() -> &'static HashMap<String, PopupSpec> {
    static CATALOG: OnceLock<HashMap<String, PopupSpec>> = OnceLock::new();
    CATALOG.get_or_init(|| {
        let catalog: HashMap<String, PopupSpec> =
            serde_json::from_str(include_str!("../../src/popups/catalog.json"))
                .expect("Invalid shared popup catalog");
        assert!(
            catalog.values().all(|p| !p.label.trim().is_empty()),
            "Invalid popup label"
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
    fn catalog_only_requires_labels() {
        let spec: PopupSpec = serde_json::from_str(r#"{"label":"Test"}"#).unwrap();
        assert_eq!(spec.label, "Test");
    }
}
