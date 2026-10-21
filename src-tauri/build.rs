#[path = "src/agents_contract.rs"]
#[allow(dead_code)]
mod agents_contract;
#[path = "src/config_contract.rs"]
#[allow(dead_code)]
mod config_contract;
#[path = "src/cpu_contract.rs"]
#[allow(dead_code)]
mod cpu_contract;
#[path = "src/disk_contract.rs"]
#[allow(dead_code)]
mod disk_contract;
#[path = "src/gpu_contract.rs"]
#[allow(dead_code)]
mod gpu_contract;
#[path = "src/media_contract.rs"]
#[allow(dead_code)]
mod media_contract;
#[path = "src/memory_contract.rs"]
#[allow(dead_code)]
mod memory_contract;
#[path = "build_support/popups.rs"]
mod popups;
#[path = "src/reminders_contract.rs"]
#[allow(dead_code)]
mod reminders_contract;

fn main() {
    use ts_rs::TS;
    println!("cargo:rerun-if-changed=src/agents_contract.rs");
    let declarations = [
        agents_contract::AgentType::decl(),
        agents_contract::AgentAlertKind::decl(),
        agents_contract::AgentAlert::decl(),
        agents_contract::AgentAlertsSnapshot::decl(),
        agents_contract::AgentNotificationStatus::decl(),
        agents_contract::AgentNotificationsSnapshot::decl(),
        agents_contract::AgentTextField::decl(),
        agents_contract::AgentMessage::decl(),
        agents_contract::AgentReplyRequest::decl(),
        agents_contract::AgentPermission::decl(),
        agents_contract::AgentPermissionDecision::decl(),
        agents_contract::AgentPermissionRequest::decl(),
        agents_contract::InitialPromptStatus::decl(),
        agents_contract::CreateAgentSessionResult::decl(),
        agents_contract::AgentApplication::decl(),
        agents_contract::SessionStatus::decl(),
        agents_contract::AgentSession::decl(),
        agents_contract::AgentConnectionStatus::decl(),
        agents_contract::OpenCodeSnapshot::decl(),
        agents_contract::AntigravitySnapshot::decl(),
        agents_contract::CodexSnapshot::decl(),
        agents_contract::AgentsSnapshot::decl(),
    ];
    let generated = format!(
        "// Generated from Rust agents_contract.rs by cargo build. Do not edit.\n{}\n",
        declarations
            .iter()
            .map(|d| format!("export {d}"))
            .collect::<Vec<_>>()
            .join("\n")
    );
    let target = std::path::Path::new("../src/services/system/agents.generated.ts");
    if std::fs::read_to_string(target).ok().as_deref() != Some(&generated) {
        std::fs::write(target, generated).expect("Generate agents contract");
    }
    println!("cargo:rerun-if-changed=src/reminders_contract.rs");
    let declarations = [
        reminders_contract::ReminderMode::decl(),
        reminders_contract::ReminderStatus::decl(),
        reminders_contract::SnoozeOption::decl(),
        reminders_contract::Reminder::decl(),
        reminders_contract::CreateReminder::decl(),
        reminders_contract::ReminderSnapshot::decl(),
        reminders_contract::CalendarStatus::decl(),
    ];
    let generated = format!(
        "// Generated from Rust reminders_contract.rs by cargo build. Do not edit.\n{}\n",
        declarations
            .iter()
            .map(|d| format!("export {d}"))
            .collect::<Vec<_>>()
            .join("\n")
    );
    let target = std::path::Path::new("../src/services/system/reminders.generated.ts");
    if std::fs::read_to_string(target).ok().as_deref() != Some(&generated) {
        std::fs::write(target, generated).expect("Generate reminders contract");
    }
    println!("cargo:rerun-if-changed=src/media_contract.rs");
    let media = [
        media_contract::MediaAvailability::decl(),
        media_contract::MediaValue::<String>::decl(),
        media_contract::MediaProgress::decl(),
        media_contract::PlayerVolume::decl(),
        media_contract::RepeatMode::decl(),
        media_contract::MediaCapabilities::decl(),
        media_contract::MediaData::decl(),
        media_contract::MediaAction::decl(),
        media_contract::MediaRequest::decl(),
        media_contract::SpotifyStatus::decl(),
    ];
    let generated = format!(
        "// Generated from Rust media_contract.rs by cargo build. Do not edit.\n{}\n",
        media
            .iter()
            .map(|d| format!("export {d}"))
            .collect::<Vec<_>>()
            .join("\n")
    );
    let target = std::path::Path::new("../src/services/system/media.generated.ts");
    if std::fs::read_to_string(target).ok().as_deref() != Some(&generated) {
        std::fs::write(target, generated).expect("Generate media contract");
    }

    println!("cargo:rerun-if-changed=src/cpu_contract.rs");
    let cpu_declarations = [
        cpu_contract::CpuMetricStatus::decl(),
        cpu_contract::CpuMetric::decl(),
        cpu_contract::CpuTemperatureSensor::decl(),
        cpu_contract::CpuPoint::decl(),
        cpu_contract::CpuData::decl(),
    ];
    let cpu_generated = format!(
        "// Generated from Rust cpu_contract.rs by cargo build. Do not edit.\n{}\n",
        cpu_declarations
            .iter()
            .map(|decl| format!("export {decl}"))
            .collect::<Vec<_>>()
            .join("\n")
    );
    let cpu_target = std::path::Path::new("../src/services/system/cpu.generated.ts");
    if std::fs::read_to_string(cpu_target).ok().as_deref() != Some(&cpu_generated) {
        std::fs::write(cpu_target, cpu_generated).expect("Generate CPU contract");
    }
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
    println!("cargo:rerun-if-changed=src/config_contract.rs");
    let config_declarations = [
        config_contract::WidgetKind::decl(),
        config_contract::AudioTargetKind::decl(),
        config_contract::AudioTarget::decl(),
        config_contract::AudioSource::decl(),
        config_contract::WidgetAudio::decl(),
        config_contract::WidgetFormat::decl(),
        config_contract::WidgetConfig::decl(),
        config_contract::BarPosition::decl(),
        config_contract::BarTheme::decl(),
        config_contract::BarConfig::decl(),
        config_contract::BarOverride::decl(),
        config_contract::WidgetSections::decl(),
        config_contract::AgentVisibility::decl(),
        config_contract::AgentsConfig::decl(),
        config_contract::Config::decl(),
        config_contract::ConfigSnapshot::decl(),
    ];
    let config_generated = format!(
        "// Generated from Rust config_contract.rs by cargo build. Do not edit.\n{}\n",
        config_declarations
            .iter()
            .map(|decl| format!("export {decl}"))
            .collect::<Vec<_>>()
            .join("\n")
    );
    let config_target = std::path::Path::new("../src/services/system/config.generated.ts");
    if std::fs::read_to_string(config_target).ok().as_deref() != Some(&config_generated) {
        std::fs::write(config_target, config_generated).expect("Generate config contract");
    }
    println!("cargo:rerun-if-changed=src/gpu_contract.rs");
    let gpu_declarations = [
        gpu_contract::GpuMetricStatus::decl(),
        gpu_contract::GpuMetric::decl(),
        gpu_contract::GpuAdapter::decl(),
        gpu_contract::GpuSensor::decl(),
        gpu_contract::GpuPoint::decl(),
        gpu_contract::GpuData::decl(),
    ];
    let gpu_generated = format!(
        "// Generated from Rust gpu_contract.rs by cargo build. Do not edit.\n{}\n",
        gpu_declarations
            .iter()
            .map(|decl| format!("export {decl}"))
            .collect::<Vec<_>>()
            .join("\n")
    );
    let gpu_target = std::path::Path::new("../src/services/system/gpu.generated.ts");
    if std::fs::read_to_string(gpu_target).ok().as_deref() != Some(&gpu_generated) {
        std::fs::write(gpu_target, gpu_generated).expect("Generate GPU contract");
    }
    println!("cargo:rerun-if-changed=src/disk_contract.rs");
    let disk_declarations = [
        disk_contract::DiskVolumeKind::decl(),
        disk_contract::DiskVolume::decl(),
        disk_contract::DiskData::decl(),
    ];
    let disk_generated = format!(
        "// Generated from Rust disk_contract.rs by cargo build. Do not edit.\n{}\n",
        disk_declarations
            .iter()
            .map(|decl| format!("export {decl}"))
            .collect::<Vec<_>>()
            .join("\n")
    );
    let disk_target = std::path::Path::new("../src/services/system/disk.generated.ts");
    if std::fs::read_to_string(disk_target).ok().as_deref() != Some(&disk_generated) {
        std::fs::write(disk_target, disk_generated).expect("Generate disk contract");
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
