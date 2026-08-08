// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            codex_model_switcher_lib::load_config,
            codex_model_switcher_lib::save_config,
            codex_model_switcher_lib::fetch_models,
            codex_model_switcher_lib::fetch_combos,
            codex_model_switcher_lib::set_primary_model,
            codex_model_switcher_lib::check_router_status,
            codex_model_switcher_lib::start_router,
            codex_model_switcher_lib::stop_router,
            codex_model_switcher_lib::restart_router,
            codex_model_switcher_lib::log_event,
            codex_model_switcher_lib::load_router_settings,
            codex_model_switcher_lib::save_router_settings,
            codex_model_switcher_lib::get_quota,
            codex_model_switcher_lib::set_connection_active,
            codex_model_switcher_lib::check_update,
            codex_model_switcher_lib::install_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn main() {
    run();
}
