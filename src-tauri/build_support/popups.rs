use std::{
    collections::BTreeMap,
    fs, io,
    path::{Path, PathBuf},
};

fn valid_id(id: &str) -> bool {
    let mut bytes = id.bytes();
    let start = |b: u8| b.is_ascii_alphabetic() || b == b'_' || b == b'$';
    bytes.next().is_some_and(start) && bytes.all(|b| start(b) || b.is_ascii_digit())
}

/// Same discovery and naming rules as scripts/generate-popups.ts; no JS execution.
pub fn discover(root: &Path) -> io::Result<BTreeMap<String, PathBuf>> {
    fn visit(directory: &Path, entries: &mut BTreeMap<String, PathBuf>) -> io::Result<()> {
        for entry in fs::read_dir(directory)? {
            let entry = entry?;
            let path = entry.path();
            let kind = entry.file_type()?;
            if kind.is_dir() {
                visit(&path, entries)?;
            } else if kind.is_file() {
                let Some(id) = path
                    .file_name()
                    .and_then(|s| s.to_str())
                    .and_then(|s| s.strip_suffix(".popup.ts"))
                else {
                    continue;
                };
                if !valid_id(id) {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidInput,
                        format!("Invalid popup ID '{id}': {}", path.display()),
                    ));
                }
                if let Some(previous) = entries.get(id) {
                    return Err(io::Error::new(
                        io::ErrorKind::InvalidInput,
                        format!(
                            "Duplicate popup ID '{id}': {} and {}",
                            previous.display(),
                            path.display()
                        ),
                    ));
                }
                entries.insert(id.to_owned(), path);
            }
        }
        Ok(())
    }
    let mut entries = BTreeMap::new();
    visit(root, &mut entries)?;
    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    struct Fixture(PathBuf);
    impl Fixture {
        fn new() -> Self {
            static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let root = std::env::temp_dir().join(format!(
                "strata-popup-discovery-{}-{}-{}",
                std::process::id(),
                std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_nanos(),
                NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ));
            fs::create_dir(&root).unwrap();
            Self(root)
        }
        fn add(&self, name: &str) -> PathBuf {
            let path = name
                .split('/')
                .fold(self.0.clone(), |path, part| path.join(part));
            fs::create_dir_all(path.parent().unwrap()).unwrap();
            fs::write(&path, "export default {}\n").unwrap();
            path
        }
    }
    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn ids_follow_the_frontend_ascii_identifier_rule() {
        for id in ["clock", "audioOutputs", "_details", "$details", "x1"] {
            assert!(valid_id(id));
        }
        for id in ["", "1clock", "audio-outputs", "áudio", "clock.popup"] {
            assert!(!valid_id(id));
        }
    }

    #[test]
    fn discovers_nested_definitions_and_tracks_renames_and_removals() {
        let root = Fixture::new();
        let clock = root.add("clock/clock.popup.ts");
        root.add("clock/ClockPopup.tsx");
        root.add("volume/audioOutputs.popup.ts");
        let ids = |root: &Path| discover(root).unwrap().into_keys().collect::<Vec<_>>();
        assert_eq!(ids(&root.0), ["audioOutputs", "clock"]);
        let calendar = clock.with_file_name("calendar.popup.ts");
        fs::rename(clock, &calendar).unwrap();
        assert_eq!(ids(&root.0), ["audioOutputs", "calendar"]);
        fs::remove_file(calendar).unwrap();
        assert_eq!(ids(&root.0), ["audioOutputs"]);
    }

    #[test]
    fn invalid_names_and_duplicate_ids_report_the_paths() {
        let root = Fixture::new();
        let invalid = root.add("bad-name.popup.ts");
        assert!(discover(&root.0)
            .unwrap_err()
            .to_string()
            .contains(&invalid.display().to_string()));
        fs::remove_file(invalid).unwrap();
        let first = root.add("a/clock.popup.ts");
        let second = root.add("b/clock.popup.ts");
        let error = discover(&root.0).unwrap_err().to_string();
        assert!(error.contains("Duplicate popup ID"));
        assert!(error.contains(&first.display().to_string()));
        assert!(error.contains(&second.display().to_string()));
    }
}
