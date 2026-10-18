#[path = "build_support/popups.rs"]
mod popups;

fn main() {
    let features = std::path::Path::new("../src/features");
    // Cargo recursively watches this tree, including added/removed definitions.
    println!("cargo:rerun-if-changed={}", features.display());
    println!("cargo:rerun-if-changed=build_support/popups.rs");
    let entries = popups::discover(features).expect("Failed to discover popup definitions");
    let ids = entries
        .keys()
        .map(|id| format!("{id:?}"))
        .collect::<Vec<_>>()
        .join(", ");
    let output =
        std::path::PathBuf::from(std::env::var_os("OUT_DIR").unwrap()).join("popup_ids.rs");
    std::fs::write(
        output,
        format!("pub const POPUP_IDS: &[&str] = &[{ids}];\n"),
    )
    .unwrap();
    tauri_build::build()
}
