include!(concat!(env!("OUT_DIR"), "/popup_ids.rs"));

pub fn contains(id: &str) -> bool {
    POPUP_IDS.contains(&id)
}

#[cfg(test)]
#[path = "../build_support/popups.rs"]
mod discovery;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generated_ids_match_definitions_and_reject_unknown_ids() {
        let definitions = discovery::discover(std::path::Path::new("../src/features")).unwrap();
        assert_eq!(
            POPUP_IDS,
            definitions.keys().map(String::as_str).collect::<Vec<_>>()
        );
        assert!(!contains("unregistered-popup"));
    }
}
