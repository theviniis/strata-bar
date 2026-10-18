#[path = "src/memory_contract.rs"]
#[allow(dead_code)]
mod memory_contract;
#[path = "build_support/popups.rs"]
mod popups;

fn main() {
    use ts_rs::TS;
    println!("cargo:rerun-if-changed=src/memory_contract.rs");
    let declarations = [
        memory_contract::MemoryMetricStatus::decl(),
        memory_contract::MemoryMetric::decl(),
        memory_contract::MemoryPoint::decl(),
        memory_contract::MemoryData::decl(),
    ];
    let generated = format!(
        "// Generated from Rust memory_contract.rs by cargo build. Do not edit.\n{}\n",
        declarations
            .iter()
            .map(|decl| format!("export {decl}"))
            .collect::<Vec<_>>()
            .join("\n")
    );
    let target = std::path::Path::new("../src/services/system/memory.generated.ts");
    if std::fs::read_to_string(target).ok().as_deref() != Some(&generated) {
        std::fs::write(target, generated).expect("Generate memory contract");
    }
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
