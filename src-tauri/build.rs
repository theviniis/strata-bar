fn main() {
    println!("cargo:rerun-if-changed=../src/popups/catalog.json");
    tauri_build::build()
}
