use std::io::Write as IoWrite;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

// ─── Shared process handle ────────────────────────────────────────────────────

static ROUTER_PID: Mutex<Option<u32>> = Mutex::new(None);

// ─── Config types ─────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct CodexConfig {
    pub model: Option<String>,
    pub model_provider: Option<String>,
    pub model_reasoning_effort: Option<String>,
    pub base_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RouterSettings {
    pub auto_start: bool,
    pub startup_command: String,
    pub health_check_interval: u64,
    pub startup_timeout: u64,
    pub health_timeout: u64,
    pub retry_delay: u64,
}

impl Default for RouterSettings {
    fn default() -> Self {
        Self {
            auto_start: true,
            startup_command: "9router".to_string(),
            health_check_interval: 5,
            startup_timeout: 6,
            health_timeout: 3,
            retry_delay: 500,
        }
    }
}

// ─── Quota report types ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize)]
pub struct Combo {
    pub name: String,
    pub models: Vec<String>,
    pub primary_model: Option<String>,
    pub primary_effort: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ProviderStats {
    pub connection_id: String,
    pub connection_name: String,
    pub provider: String,
    pub plan_type: String,
    pub total_calls: i64,
    pub total_cost: f64,
    pub total_prompt_tokens: i64,
    pub total_completion_tokens: i64,
    pub total_tokens: i64,
    pub days_active: i32,
    pub first_seen: String,
    pub last_seen: String,
}

#[derive(Debug, Serialize)]
pub struct DailyUsage {
    pub date: String,
    pub calls: i64,
    pub cost: f64,
    pub prompt_tokens: i64,
    pub completion_tokens: i64,
    pub total_tokens: i64,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct QuotaWindow {
    pub used_percent: f64,
    pub remaining_percent: f64,
    pub reset_at: Option<i64>,
    pub reset_after_seconds: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct ConnectionQuota {
    pub connection_id: String,
    pub connection_name: String,
    pub provider: String,
    pub plan_type: String,
    pub is_active: bool,
    pub primary_window: Option<QuotaWindow>,
    pub secondary_window: Option<QuotaWindow>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct QuotaReport {
    pub providers: Vec<ProviderStats>,
    pub quotas: Vec<ConnectionQuota>,
    pub daily: Vec<DailyUsage>,
    pub grand_total_calls: i64,
    pub grand_total_cost: f64,
    pub grand_total_tokens: i64,
    pub report_date: String,
}

#[derive(Debug, Serialize)]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub download_url: Option<String>,
    pub notes: Option<String>,
}

// ─── Document paths ───────────────────────────────────────────────────────────

fn get_doc_dir() -> std::io::Result<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        Ok(PathBuf::from(std::env::var("APPDATA").unwrap_or_default())
            .join("9router")
            .join("db"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let home = std::env::var("HOME").unwrap_or_default();
        Ok(PathBuf::from(home).join(".config/9router"))
    }
}

fn read_codex_document() -> Result<toml_edit::DocumentMut, String> {
    let home = dirs::home_dir().ok_or("Unable to locate home directory")?;
    let path = home.join(".codex/config.toml");
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Unable to read ~/.codex/config.toml: {e}"))?;
    content
        .parse()
        .map_err(|e| format!("Parse error in config.toml: {e}"))
}

fn read_switch_document() -> Result<toml_edit::DocumentMut, String> {
    let doc_dir = get_doc_dir().map_err(|e| format!("IO error: {e}"))?;
    let path = doc_dir.join("codex-switch.toml");
    if path.exists() {
        let content =
            std::fs::read_to_string(&path).map_err(|e| format!("Unable to read config: {e}"))?;
        content.parse().map_err(|e| format!("Parse error: {e}"))
    } else {
        Ok(toml_edit::DocumentMut::new())
    }
}

fn write_text_with_backup(path: &Path, content: String, label: &str) -> Result<(), String> {
    let backup = path.with_extension("toml.bak");
    let tmp = path.with_extension("toml.tmp");

    {
        let mut file = std::fs::File::create(&tmp)
            .map_err(|e| format!("Unable to create temporary {label}: {e}"))?;
        file.write_all(content.as_bytes())
            .map_err(|e| format!("Unable to write temporary {label}: {e}"))?;
        file.sync_all()
            .map_err(|e| format!("Unable to flush temporary {label}: {e}"))?;
    }

    if path.exists() {
        std::fs::copy(path, &backup).map_err(|e| format!("Unable to backup {label}: {e}"))?;
    }

    if std::fs::rename(&tmp, path).is_ok() {
        return Ok(());
    }

    if path.exists() {
        std::fs::remove_file(path).map_err(|e| format!("Unable to replace {label}: {e}"))?;
    }
    if let Err(error) = std::fs::rename(&tmp, path) {
        if backup.exists() {
            let _ = std::fs::copy(&backup, path);
        }
        return Err(format!("Unable to replace {label}: {error}"));
    }
    Ok(())
}

fn save_switch_document(doc: &toml_edit::DocumentMut) -> Result<(), String> {
    let doc_dir = get_doc_dir().map_err(|e| format!("IO error: {e}"))?;
    std::fs::create_dir_all(&doc_dir)
        .map_err(|e| format!("Unable to create config directory: {e}"))?;
    let path = doc_dir.join("codex-switch.toml");
    write_text_with_backup(&path, doc.to_string(), "config")
}

// ─── Logging ─────────────────────────────────────────────────────────────────

fn get_log_path() -> Result<PathBuf, String> {
    let doc_dir = get_doc_dir().map_err(|e| format!("IO error: {e}"))?;
    let log_dir = doc_dir.join("logs");
    std::fs::create_dir_all(&log_dir)
        .map_err(|e| format!("Unable to create log directory: {e}"))?;
    let date = chrono::Local::now().format("%Y-%m-%d");
    Ok(log_dir.join(format!("{date}.log")))
}

fn write_log(message: &str) -> Result<(), String> {
    let log_path = get_log_path()?;
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(|e| format!("Unable to open log file: {e}"))?;
    writeln!(file, "{timestamp} {message}")
        .map_err(|e| format!("Unable to write log entry: {e}"))?;
    Ok(())
}

// ─── Codex config commands ────────────────────────────────────────────────────

#[tauri::command]
pub fn load_config() -> Result<CodexConfig, String> {
    let doc = read_codex_document()?;

    let model = doc.get("model").and_then(|v| v.as_str()).map(String::from);
    let model_provider = doc
        .get("model_provider")
        .and_then(|v| v.as_str())
        .map(String::from);
    let model_reasoning_effort = doc
        .get("model_reasoning_effort")
        .and_then(|v| v.as_str())
        .map(String::from);

    let mut base_url: Option<String> = None;
    if let Some(providers) = doc.get("model_providers").and_then(|v| v.as_table()) {
        let key = model_provider
            .clone()
            .unwrap_or_else(|| "9router".to_string());
        if let Some(provider) = providers.get(&key).and_then(|v| v.as_table()) {
            base_url = provider
                .get("base_url")
                .and_then(|v| v.as_str())
                .map(String::from);
        }
    }

    Ok(CodexConfig {
        model,
        model_provider,
        model_reasoning_effort,
        base_url,
    })
}

#[tauri::command]
pub fn save_config(model: String, reasoning_effort: String) -> Result<bool, String> {
    let valid = ["minimal", "low", "medium", "high", "xhigh", "max"];
    if !valid.contains(&reasoning_effort.as_str()) {
        return Err(format!(
            "Invalid reasoning_effort '{}'. Valid: {:?}",
            reasoning_effort, valid
        ));
    }

    let home = dirs::home_dir().ok_or("Unable to locate home directory")?;
    let path = home.join(".codex/config.toml");

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Unable to read ~/.codex/config.toml: {e}"))?;
    let mut doc: toml_edit::DocumentMut =
        content.parse().map_err(|e| format!("Parse error: {e}"))?;

    doc["model"] = toml_edit::value(&model);
    doc["model_reasoning_effort"] = toml_edit::value(reasoning_effort);
    // Always ensure model_provider is set to 9router for this app
    doc["model_provider"] = toml_edit::value("9router");

    write_text_with_backup(&path, doc.to_string(), "~/.codex/config.toml")?;

    let _ = write_log(&format!("Saved config: model={}", model));
    Ok(true)
}

// ─── Combo helpers ────────────────────────────────────────────────────────────

fn strip_primary(model: &str) -> (String, Option<String>) {
    if let Some(idx) = model.find('(') {
        let base = model[..idx].trim().to_string();
        let inner = model[idx + 1..].trim_end_matches(')');
        if !inner.is_empty() {
            return (base, Some(inner.to_string()));
        }
    }
    (model.to_string(), None)
}

fn primary_model_entry(model: &str, reasoning_effort: Option<&str>) -> String {
    let target_base = strip_primary(model).0;
    match reasoning_effort {
        Some(level)
            if matches!(
                level,
                "low" | "medium" | "high" | "xhigh" | "minimal" | "none" | "max"
            ) =>
        {
            format!("{target_base}({level})")
        }
        _ => target_base,
    }
}

fn reorder_combo_models(
    current_models: &[String],
    model: &str,
    reasoning_effort: Option<&str>,
) -> Vec<String> {
    let target_base = strip_primary(model).0;
    let mut seen = vec![target_base];
    let mut new_models = vec![primary_model_entry(model, reasoning_effort)];

    for model_entry in current_models {
        let base = strip_primary(model_entry).0;
        if !seen.contains(&base) {
            seen.push(base);
            new_models.push(model_entry.clone());
        }
    }

    new_models
}

#[cfg(test)]
mod tests {
    use super::{
        is_newer, parse_quota_window, port_from_url, reorder_combo_models, router_models_url,
        strip_primary, trusted_release_asset_url, write_text_with_backup, QuotaWindow,
    };

    #[test]
    fn parses_combo_primary_model() {
        assert_eq!(
            strip_primary("cx/gpt-5.6-sol(high)"),
            ("cx/gpt-5.6-sol".into(), Some("high".into()))
        );
    }

    #[test]
    fn reorders_combo_without_losing_secondary_suffixes() {
        let current = vec![
            "cx/a(low)".to_string(),
            "cx/b(high)".to_string(),
            "cx/a(max)".to_string(),
            "cx/c".to_string(),
        ];

        assert_eq!(
            reorder_combo_models(&current, "cx/c", Some("max")),
            vec![
                "cx/c(max)".to_string(),
                "cx/a(low)".to_string(),
                "cx/b(high)".to_string(),
            ]
        );
    }

    #[test]
    fn calculates_remaining_quota() {
        let value = serde_json::json!({ "used_percent": 22, "reset_after_seconds": 3600 });
        assert_eq!(
            parse_quota_window(Some(&value)),
            Some(QuotaWindow {
                used_percent: 22.0,
                remaining_percent: 78.0,
                reset_at: None,
                reset_after_seconds: Some(3600),
            })
        );
    }

    #[test]
    fn compares_versions_numerically() {
        assert!(is_newer("0.10.0", "0.9.3"));
        assert!(is_newer("v0.2.0", "0.1.0"));
        assert!(!is_newer("0.1.0", "0.1.0"));
        assert!(!is_newer("0.1.0", "0.2.0"));
    }

    #[test]
    fn writes_config_with_backup() {
        let dir = std::env::temp_dir().join(format!(
            "codex-model-switcher-test-{}",
            chrono::Local::now()
                .timestamp_nanos_opt()
                .unwrap_or_default()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("config.toml");
        std::fs::write(&path, "old").unwrap();

        write_text_with_backup(&path, "new".to_string(), "test config").unwrap();

        assert_eq!(std::fs::read_to_string(&path).unwrap(), "new");
        assert_eq!(
            std::fs::read_to_string(path.with_extension("toml.bak")).unwrap(),
            "old"
        );
        std::fs::remove_dir_all(dir).unwrap();
    }

    #[test]
    fn builds_models_url_without_double_v1() {
        assert_eq!(
            router_models_url("http://127.0.0.1:20128/v1").unwrap(),
            "http://127.0.0.1:20128/v1/models"
        );
        assert_eq!(
            router_models_url("http://127.0.0.1:20128").unwrap(),
            "http://127.0.0.1:20128/v1/models"
        );
    }

    #[test]
    fn parses_router_port_from_v1_url() {
        assert_eq!(port_from_url("http://127.0.0.1:20128/v1"), 20128);
    }

    #[test]
    fn trusts_only_project_release_assets() {
        assert!(trusted_release_asset_url(
            "https://github.com/duyalan04/codex-model-switcher/releases/latest/download/latest.json",
            ".json"
        ));
        assert!(!trusted_release_asset_url(
            "https://example.com/codex-model-switcher.exe",
            ".exe"
        ));
    }
}

// ─── Combo commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn fetch_combos() -> Result<Vec<Combo>, String> {
    let db_path = get_9router_db_path()?;
    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Unable to open database: {e}"))?;

    let mut stmt = conn
        .prepare("SELECT name, models FROM combos")
        .map_err(|e| format!("Query error: {e}"))?;

    let combos = stmt
        .query_map([], |row| {
            let name: String = row.get(0)?;
            let models_json: String = row.get(1)?;
            let stored_models: Vec<String> = serde_json::from_str(&models_json).unwrap_or_default();
            let (primary_model, primary_effort) = stored_models
                .first()
                .map(|model| strip_primary(model))
                .map(|(model, effort)| (Some(model), effort))
                .unwrap_or_default();
            let models = stored_models
                .iter()
                .map(|model| strip_primary(model).0)
                .collect();
            Ok(Combo {
                name,
                models,
                primary_model,
                primary_effort,
            })
        })
        .map_err(|e| format!("Query error: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(combos)
}

#[tauri::command]
pub fn set_primary_model(
    combo_name: String,
    model: String,
    reasoning_effort: Option<String>,
) -> Result<(), String> {
    let db_path = get_9router_db_path()?;
    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Unable to open database: {e}"))?;

    let mut stmt = conn
        .prepare("SELECT models FROM combos WHERE name = ?")
        .map_err(|e| format!("Query error: {e}"))?;

    let current_models: Vec<String> = stmt
        .query_row([&combo_name], |row| {
            let json: String = row.get(0)?;
            Ok(serde_json::from_str(&json).unwrap_or_default())
        })
        .map_err(|_| "Combo not found".to_string())?;

    let new_models = reorder_combo_models(&current_models, &model, reasoning_effort.as_deref());
    let primary = new_models.first().cloned().unwrap_or_default();

    let models_json = serde_json::to_string(&new_models).map_err(|e| format!("JSON error: {e}"))?;

    conn.execute(
        "UPDATE combos SET models = ?, updatedAt = datetime('now') WHERE name = ?",
        rusqlite::params![models_json, &combo_name],
    )
    .map_err(|e| format!("Update error: {e}"))?;

    let _ = write_log(&format!(
        "Set primary model to {} in combo '{}'",
        primary, combo_name
    ));
    Ok(())
}

// ─── Router settings commands ─────────────────────────────────────────────────

#[tauri::command]
pub fn load_router_settings() -> RouterSettings {
    let defaults = RouterSettings::default();
    if let Ok(doc) = read_switch_document() {
        let auto_start = doc
            .get("auto_start")
            .and_then(|v| v.as_bool())
            .unwrap_or(defaults.auto_start);
        let startup_command = doc
            .get("startup_command")
            .and_then(|v| v.as_str())
            .unwrap_or(&defaults.startup_command)
            .to_string();
        let health_check_interval = doc
            .get("health_check_interval")
            .and_then(|v| v.as_integer())
            .and_then(|v| v.try_into().ok())
            .unwrap_or(defaults.health_check_interval);
        let startup_timeout = doc
            .get("startup_timeout")
            .and_then(|v| v.as_integer())
            .and_then(|v| v.try_into().ok())
            .unwrap_or(defaults.startup_timeout);
        let health_timeout = doc
            .get("health_timeout")
            .and_then(|v| v.as_integer())
            .and_then(|v| v.try_into().ok())
            .unwrap_or(defaults.health_timeout);
        let retry_delay = doc
            .get("retry_delay")
            .and_then(|v| v.as_integer())
            .and_then(|v| v.try_into().ok())
            .unwrap_or(defaults.retry_delay);

        return RouterSettings {
            auto_start,
            startup_command,
            health_check_interval,
            startup_timeout,
            health_timeout,
            retry_delay,
        };
    }
    RouterSettings::default()
}

#[tauri::command]
pub fn save_router_settings(settings: RouterSettings) -> Result<(), String> {
    let mut doc = read_switch_document().unwrap_or_else(|_| toml_edit::DocumentMut::new());
    doc["auto_start"] = toml_edit::value(settings.auto_start);
    doc["startup_command"] = toml_edit::value(settings.startup_command);
    doc["health_check_interval"] = toml_edit::value(settings.health_check_interval as i64);
    doc["startup_timeout"] = toml_edit::value(settings.startup_timeout as i64);
    doc["health_timeout"] = toml_edit::value(settings.health_timeout as i64);
    doc["retry_delay"] = toml_edit::value(settings.retry_delay as i64);
    save_switch_document(&doc)
}

// ─── Database path ─────────────────────────────────────────────────────────────

fn get_9router_db_path() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        let path = PathBuf::from(std::env::var("APPDATA").unwrap_or_default())
            .join("9router")
            .join("db")
            .join("data.sqlite");
        if path.exists() {
            Ok(path)
        } else {
            Err("9Router database not found".to_string())
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let home = PathBuf::from(std::env::var("HOME").unwrap_or_default());
        let path = home.join(".config/9router/data.sqlite");
        if path.exists() {
            Ok(path)
        } else {
            Err("9Router database not found".to_string())
        }
    }
}

// ─── Quota report ──────────────────────────────────────────────────────────────

fn parse_quota_window(value: Option<&serde_json::Value>) -> Option<QuotaWindow> {
    let value = value?;
    let used_percent = value.get("used_percent")?.as_f64()?;
    Some(QuotaWindow {
        used_percent,
        remaining_percent: (100.0 - used_percent).clamp(0.0, 100.0),
        reset_at: value.get("reset_at").and_then(|value| value.as_i64()),
        reset_after_seconds: value
            .get("reset_after_seconds")
            .and_then(|value| value.as_i64()),
    })
}

fn get_connection_quotas(conn: &rusqlite::Connection) -> Vec<ConnectionQuota> {
    let rows: Vec<(String, String, String, bool, String)> = conn
        .prepare("SELECT id, name, provider, isActive, data FROM providerConnections WHERE provider = 'codex'")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| {
                    Ok((
                        row.get(0)?,
                        row.get::<_, String>(1).unwrap_or_default(),
                        row.get::<_, String>(2).unwrap_or_default(),
                        row.get::<_, i64>(3).unwrap_or(0) != 0,
                        row.get::<_, String>(4).unwrap_or_default(),
                    ))
                })
                .map(|rows| rows.filter_map(|row| row.ok()).collect())
        })
        .unwrap_or_default();

    let client = match reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent("codex-model-switcher/0.1.0")
        .build()
    {
        Ok(client) => client,
        Err(error) => {
            return rows
                .into_iter()
                .map(
                    |(connection_id, connection_name, provider, is_active, _)| ConnectionQuota {
                        connection_id,
                        connection_name,
                        provider,
                        plan_type: "unknown".to_string(),
                        is_active,
                        primary_window: None,
                        secondary_window: None,
                        error: Some(error.to_string()),
                    },
                )
                .collect();
        }
    };

    rows.into_iter()
        .map(
            |(connection_id, connection_name, provider, is_active, data)| {
                let data: serde_json::Value = serde_json::from_str(&data).unwrap_or_default();
                let access_token = data.get("accessToken").and_then(|value| value.as_str());
                let provider_data = data.get("providerSpecificData");
                let account_id = provider_data
                    .and_then(|value| value.get("chatgptAccountId"))
                    .and_then(|value| value.as_str());
                let plan_type = provider_data
                    .and_then(|value| value.get("chatgptPlanType"))
                    .and_then(|value| value.as_str())
                    .unwrap_or("unknown")
                    .to_string();

                let mut quota = ConnectionQuota {
                    connection_id,
                    connection_name,
                    provider,
                    plan_type,
                    is_active,
                    primary_window: None,
                    secondary_window: None,
                    error: None,
                };

                let Some((access_token, account_id)) = access_token.zip(account_id) else {
                    quota.error = Some("Missing Codex credentials in 9Router".to_string());
                    return quota;
                };

                // ponytail: Codex-only quota endpoint; add provider adapters when 9Router connections need them.
                match client
                    .get("https://chatgpt.com/backend-api/wham/usage")
                    .bearer_auth(access_token)
                    .header("ChatGPT-Account-Id", account_id)
                    .header("originator", "codex_cli_rs")
                    .send()
                {
                    Ok(response) if response.status().is_success() => {
                        match response.json::<serde_json::Value>() {
                            Ok(body) => {
                                let rate_limit = body.get("rate_limit");
                                quota.primary_window = parse_quota_window(
                                    rate_limit.and_then(|value| value.get("primary_window")),
                                );
                                quota.secondary_window = parse_quota_window(
                                    rate_limit.and_then(|value| value.get("secondary_window")),
                                );
                            }
                            Err(error) => {
                                quota.error = Some(format!("Invalid quota response: {error}"))
                            }
                        }
                    }
                    Ok(response) => quota.error = Some(format!("Quota HTTP {}", response.status())),
                    Err(error) => quota.error = Some(format!("Quota unavailable: {error}")),
                }

                quota
            },
        )
        .collect()
}

pub fn get_quota_report() -> Result<QuotaReport, String> {
    let db_path = get_9router_db_path()?;
    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Unable to open database: {e}"))?;

    let has_usage = conn.prepare("SELECT COUNT(*) FROM usageHistory").is_ok();

    if !has_usage {
        return Ok(QuotaReport {
            providers: vec![],
            quotas: get_connection_quotas(&conn),
            daily: vec![],
            grand_total_calls: 0,
            grand_total_cost: 0.0,
            grand_total_tokens: 0,
            report_date: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        });
    }

    #[derive(Default)]
    struct InternalProviderStats {
        calls: i64,
        cost: f64,
        prompt: i64,
        completion: i64,
        first_ts: Option<String>,
        last_ts: Option<String>,
    }

    let mut provider_map: std::collections::HashMap<String, InternalProviderStats> =
        std::collections::HashMap::new();

    let mut rows = conn
        .prepare(
            "SELECT connectionId, provider, cost, promptTokens, completionTokens, timestamp
             FROM usageHistory WHERE connectionId IS NOT NULL AND connectionId != ''",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let usage_rows: Vec<(String, Option<String>, f64, i64, i64, String)> = rows
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, f64>(2).unwrap_or(0.0),
                row.get::<_, i64>(3).unwrap_or(0),
                row.get::<_, i64>(4).unwrap_or(0),
                row.get::<_, String>(5)?,
            ))
        })
        .map_err(|e| format!("Query error: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    for (conn_id, _provider, cost, prompt, completion, ts) in usage_rows {
        let entry = provider_map.entry(conn_id.clone()).or_default();
        entry.calls += 1;
        entry.cost += cost;
        entry.prompt += prompt;
        entry.completion += completion;

        let ts_str = ts.clone();
        if entry.first_ts.is_none() || ts_str < entry.first_ts.clone().unwrap_or(ts_str.clone()) {
            entry.first_ts = Some(ts_str.clone());
        }
        if entry.last_ts.is_none() || ts_str > entry.last_ts.clone().unwrap_or(ts_str.clone()) {
            entry.last_ts = Some(ts_str);
        }
    }

    let mut conn_names: std::collections::HashMap<String, (String, String, String)> =
        std::collections::HashMap::new();
    if let Ok(mut rows) = conn.prepare("SELECT id, name, provider, data FROM providerConnections") {
        let name_rows: Vec<(String, String, String, String)> = rows
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1).unwrap_or_default(),
                    row.get::<_, String>(2).unwrap_or_default(),
                    row.get::<_, String>(3).unwrap_or_default(),
                ))
            })
            .ok()
            .map(|rows| rows.filter_map(|r| r.ok()).collect())
            .unwrap_or_default();

        for (id, name, prov, data) in name_rows {
            let plan = if let Ok(json) = serde_json::from_str::<serde_json::Value>(&data) {
                json.get("providerSpecificData")
                    .and_then(|pd| pd.get("chatgptPlanType"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown")
                    .to_string()
            } else {
                "unknown".to_string()
            };
            conn_names.insert(id, (name, prov, plan));
        }
    }

    let mut grand_calls = 0i64;
    let mut grand_cost = 0.0f64;
    let mut grand_tokens: i64 = 0;

    let providers: Vec<ProviderStats> = provider_map
        .into_iter()
        .filter_map(|(conn_id, stats)| {
            let (name, prov, plan) = conn_names.get(&conn_id)?.clone();

            grand_calls += stats.calls;
            grand_cost += stats.cost;
            grand_tokens += stats.prompt + stats.completion;

            let days_active = if let (Some(first), Some(last)) = (&stats.first_ts, &stats.last_ts) {
                let f = &first[..10];
                let l = &last[..10];
                if f == l {
                    1
                } else {
                    chrono::NaiveDate::parse_from_str(l, "%Y-%m-%d")
                        .ok()
                        .and_then(|ld| {
                            chrono::NaiveDate::parse_from_str(f, "%Y-%m-%d")
                                .ok()
                                .and_then(|fd| (ld - fd).num_days().try_into().ok())
                        })
                        .unwrap_or(1)
                }
            } else {
                0
            };

            Some(ProviderStats {
                connection_id: conn_id,
                connection_name: name,
                provider: prov,
                plan_type: plan,
                total_calls: stats.calls,
                total_cost: stats.cost,
                total_prompt_tokens: stats.prompt,
                total_completion_tokens: stats.completion,
                total_tokens: stats.prompt + stats.completion,
                days_active,
                first_seen: stats.first_ts.unwrap_or_default(),
                last_seen: stats.last_ts.unwrap_or_default(),
            })
        })
        .collect();

    let mut daily_map: std::collections::BTreeMap<String, DailyUsage> =
        std::collections::BTreeMap::new();

    let today = chrono::Local::now().date_naive();
    let thirty_days_ago = today - chrono::Duration::days(30);

    let mut rows = conn
        .prepare(
            "SELECT timestamp, cost, promptTokens, completionTokens
             FROM usageHistory WHERE timestamp >= ?",
        )
        .map_err(|e| format!("Query error: {e}"))?;

    let cutoff = thirty_days_ago.format("%Y-%m-%d").to_string();
    let daily_rows: Vec<(String, f64, i64, i64)> = rows
        .query_map([&cutoff], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, f64>(1).unwrap_or(0.0),
                row.get::<_, i64>(2).unwrap_or(0),
                row.get::<_, i64>(3).unwrap_or(0),
            ))
        })
        .map_err(|e| format!("Query error: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    for (ts, cost, prompt, completion) in daily_rows {
        let date = ts[..10].to_string();
        let entry = daily_map.entry(date.clone()).or_insert(DailyUsage {
            date,
            calls: 0,
            cost: 0.0,
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
        });
        entry.calls += 1;
        entry.cost += cost;
        entry.prompt_tokens += prompt;
        entry.completion_tokens += completion;
        entry.total_tokens += prompt + completion;
    }

    let daily: Vec<DailyUsage> = daily_map.into_values().rev().collect();
    let quotas = get_connection_quotas(&conn);

    Ok(QuotaReport {
        providers,
        quotas,
        daily,
        grand_total_calls: grand_calls,
        grand_total_cost: grand_cost,
        grand_total_tokens: grand_tokens,
        report_date: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    })
}

#[tauri::command]
pub fn get_quota() -> Result<QuotaReport, String> {
    get_quota_report()
}

#[tauri::command]
pub fn set_connection_active(connection_id: String, active: bool) -> Result<(), String> {
    let db_path = get_9router_db_path()?;
    let conn = rusqlite::Connection::open(&db_path)
        .map_err(|e| format!("Unable to open 9Router DB: {e}"))?;
    let changed = conn
        .execute(
            "UPDATE providerConnections SET isActive = ?1 WHERE id = ?2 AND provider = 'codex'",
            rusqlite::params![if active { 1 } else { 0 }, connection_id],
        )
        .map_err(|e| format!("Unable to update connection: {e}"))?;
    if changed == 0 {
        return Err("Codex connection not found".to_string());
    }
    Ok(())
}

// ─── Update check ─────────────────────────────────────────────────────────────

/// Compares dotted numeric versions, so 0.10.0 counts as newer than 0.9.3.
fn is_newer(latest: &str, current: &str) -> bool {
    fn parts(version: &str) -> Vec<u64> {
        version
            .trim()
            .trim_start_matches('v')
            .split('.')
            .map(|part| {
                part.chars()
                    .take_while(|c| c.is_ascii_digit())
                    .collect::<String>()
                    .parse()
                    .unwrap_or(0)
            })
            .collect()
    }

    let (latest, current) = (parts(latest), parts(current));
    for index in 0..latest.len().max(current.len()) {
        let left = latest.get(index).copied().unwrap_or(0);
        let right = current.get(index).copied().unwrap_or(0);
        if left != right {
            return left > right;
        }
    }
    false
}

/// Default manifest URL; `update_url` in codex-switch.toml overrides it when it
/// still points to this repository's GitHub release assets.
const DEFAULT_UPDATE_URL: &str =
    "https://github.com/duyalan04/codex-model-switcher/releases/latest/download/latest.json";

fn trusted_release_asset_url(raw: &str, suffix: &str) -> bool {
    let Ok(url) = reqwest::Url::parse(raw.trim()) else {
        return false;
    };
    url.scheme() == "https"
        && url.host_str() == Some("github.com")
        && url
            .path()
            .starts_with("/duyalan04/codex-model-switcher/releases/")
        && url.path().ends_with(suffix)
}

#[tauri::command]
pub fn check_update() -> Result<UpdateInfo, String> {
    let current_version = env!("CARGO_PKG_VERSION").to_string();
    let url = read_switch_document()
        .ok()
        .and_then(|doc| {
            doc.get("update_url")
                .and_then(|value| value.as_str())
                .map(|value| value.trim().to_string())
        })
        .filter(|value| trusted_release_asset_url(value, ".json"))
        .unwrap_or_else(|| DEFAULT_UPDATE_URL.to_string());

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .user_agent(concat!("codex-model-switcher/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .get(&url)
        .send()
        .map_err(|error| format!("Update check failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("Update check HTTP {}", response.status()));
    }

    let manifest: serde_json::Value = response
        .json()
        .map_err(|error| format!("Invalid update manifest: {error}"))?;
    let latest_version = manifest
        .get("version")
        .and_then(|value| value.as_str())
        .ok_or("Update manifest has no version field")?
        .trim()
        .trim_start_matches('v')
        .to_string();

    let update_available = is_newer(&latest_version, &current_version);
    if update_available {
        let _ = write_log(&format!(
            "Update available: {current_version} -> {latest_version}"
        ));
    }

    Ok(UpdateInfo {
        current_version,
        latest_version,
        update_available,
        download_url: manifest
            .get("url")
            .and_then(|value| value.as_str())
            .filter(|value| trusted_release_asset_url(value, ".exe"))
            .map(String::from),
        notes: manifest
            .get("notes")
            .and_then(|value| value.as_str())
            .map(String::from),
    })
}

/// Downloads the NSIS installer and runs it with /UPDATE /P so it overwrites the
/// existing install in place without prompting. The app exits so its files are
/// unlocked; the installer reopens it when finished.
#[tauri::command]
pub fn install_update(download_url: String) -> Result<(), String> {
    if !trusted_release_asset_url(&download_url, ".exe") {
        return Err("Installer URL must be a trusted GitHub release .exe".to_string());
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .user_agent(concat!("codex-model-switcher/", env!("CARGO_PKG_VERSION")))
        .build()
        .map_err(|error| error.to_string())?;

    let response = client
        .get(&download_url)
        .send()
        .map_err(|error| format!("Download failed: {error}"))?;
    if !response.status().is_success() {
        return Err(format!("Download HTTP {}", response.status()));
    }
    let bytes = response
        .bytes()
        .map_err(|error| format!("Download failed: {error}"))?;
    if bytes.len() < 1024 {
        return Err("Downloaded installer is too small to be valid".to_string());
    }

    let installer = std::env::temp_dir().join(format!(
        "codex-model-switcher-update-{}.exe",
        chrono::Local::now().format("%Y%m%d%H%M%S")
    ));
    std::fs::write(&installer, &bytes)
        .map_err(|error| format!("Unable to save installer: {error}"))?;

    Command::new(&installer)
        .args(["/UPDATE", "/P"])
        .spawn()
        .map_err(|error| format!("Unable to start installer: {error}"))?;

    let _ = write_log(&format!(
        "Running update installer: {}",
        installer.display()
    ));
    std::process::exit(0);
}

// ─── URL helpers ───────────────────────────────────────────────────────────────

fn port_from_url(url: &str) -> u16 {
    reqwest::Url::parse(url.trim())
        .ok()
        .and_then(|url| url.port_or_known_default())
        .unwrap_or(8080)
}

fn router_models_url(base_url: &str) -> Result<String, String> {
    let mut url =
        reqwest::Url::parse(base_url.trim()).map_err(|_| "Invalid base_url".to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("base_url must use http or https".to_string());
    }

    let path = url.path().trim_end_matches('/');
    let models_path = if path.ends_with("/v1") {
        format!("{path}/models")
    } else {
        format!("{path}/v1/models")
    };
    url.set_path(&models_path);
    url.set_query(None);
    url.set_fragment(None);
    Ok(url.to_string())
}

// ─── Process helpers ──────────────────────────────────────────────────────────

fn kill_pid(pid: u32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .output()
            .map_err(|e| format!("taskkill failed: {e}"))?;
        if output.status.success() {
            return Ok(());
        }
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("taskkill failed: {}", stderr))
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("kill")
            .args(["-9", &pid.to_string()])
            .output()
            .map_err(|e| format!("kill failed: {e}"))?;
        Ok(())
    }
}

fn find_pid_by_port(port: u16) -> Result<u32, String> {
    #[cfg(target_os = "windows")]
    {
        let output = std::process::Command::new("netstat")
            .args(["-ano", "-p", "TCP"])
            .output()
            .map_err(|e| format!("netstat failed: {e}"))?;
        let stdout = String::from_utf8_lossy(&output.stdout);
        for line in stdout.lines() {
            if line.contains(&format!(":{port}")) && line.contains("LISTENING") {
                if let Some(pid_str) = line.split_whitespace().last() {
                    return pid_str
                        .parse::<u32>()
                        .map_err(|_| "Failed to parse PID".to_string());
                }
            }
        }
        Err(format!("No process found on port {port}"))
    }
    #[cfg(not(target_os = "windows"))]
    {
        let output = std::process::Command::new("lsof")
            .args(["-t", "-i", &format!(":{port}")])
            .output()
            .map_err(|e| format!("lsof failed: {e}"))?;
        let pid_str = String::from_utf8_lossy(&output.stdout);
        pid_str
            .trim()
            .parse::<u32>()
            .map_err(|_| "Failed to parse PID".to_string())
    }
}

// ─── Router lifecycle commands ────────────────────────────────────────────────

#[tauri::command]
pub async fn fetch_models(base_url: String) -> Result<Vec<String>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let url = router_models_url(&base_url)?;
    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|_| "Unable to connect to 9Router")?;

    if !response.status().is_success() {
        return Err(format!("9Router returned status {}", response.status()));
    }

    #[derive(serde::Deserialize)]
    struct Model {
        id: String,
    }

    #[derive(serde::Deserialize)]
    struct ModelsResponse {
        data: Vec<Model>,
    }

    let data: ModelsResponse = response
        .json()
        .await
        .map_err(|e| format!("Parse error: {e}"))?;

    Ok(data.data.into_iter().map(|m| m.id).collect())
}

#[tauri::command]
pub async fn check_router_status(base_url: String, health_timeout: Option<u64>) -> bool {
    let timeout = std::time::Duration::from_secs(health_timeout.unwrap_or(3).max(1));

    if let Ok(client) = reqwest::Client::builder().timeout(timeout).build() {
        let Ok(url) = router_models_url(&base_url) else {
            return false;
        };
        if let Ok(response) = client.get(&url).send().await {
            return response.status().is_success();
        }
    }
    false
}

#[tauri::command]
pub async fn start_router(
    startup_command: String,
    base_url: String,
    startup_timeout: Option<u64>,
    health_timeout: Option<u64>,
) -> Result<String, String> {
    let _ = write_log(&format!("Starting router: {}", startup_command));

    let mut cmd = Command::new("cmd");
    cmd.args(["/C", "start", "/B", "", &startup_command])
        .stdout(Stdio::null())
        .stderr(Stdio::null());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    match cmd.spawn() {
        Ok(_) => {}
        Err(e) => {
            return Err(format!("Unable to start 9Router: {e}"));
        }
    }

    let health_timeout = health_timeout.unwrap_or(3).max(1);
    let startup_timeout = startup_timeout.unwrap_or(6).max(1);
    let iterations = (startup_timeout * 1000 / 500).max(1);
    let port = port_from_url(&base_url);

    for _ in 0..iterations {
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
        if check_router_status(base_url.clone(), Some(health_timeout)).await {
            if let Ok(pid) = find_pid_by_port(port) {
                if let Ok(mut pid_guard) = ROUTER_PID.lock() {
                    *pid_guard = Some(pid);
                }
                let _ = write_log(&format!("Router Running (pid {pid})"));
                return Ok("started".to_string());
            }
            let _ = write_log("Router Running");
            return Ok("started".to_string());
        }
    }

    let _ = write_log(&format!(
        "Router Start: timed out after {startup_timeout}s (port {port})"
    ));
    Err(format!(
        "9Router did not respond within {startup_timeout}s (port {port})"
    ))
}

#[tauri::command]
pub fn stop_router(base_url: String) -> Result<(), String> {
    let stored_pid = ROUTER_PID.lock().ok().and_then(|g| *g);
    if let Some(pid) = stored_pid {
        let result = kill_pid(pid);
        if result.is_ok() {
            if let Ok(mut guard) = ROUTER_PID.lock() {
                *guard = None;
            }
            let _ = write_log(&format!("Router Stopped via PID {pid}"));
            return Ok(());
        }
    }

    let port = port_from_url(&base_url);
    let pid = find_pid_by_port(port)?;
    kill_pid(pid)?;
    if let Ok(mut guard) = ROUTER_PID.lock() {
        *guard = None;
    }
    let _ = write_log(&format!(
        "Router Stopped via port scan (port {port}, pid {pid})"
    ));
    Ok(())
}

#[tauri::command]
pub async fn restart_router(
    startup_command: String,
    base_url: String,
    startup_timeout: Option<u64>,
    health_timeout: Option<u64>,
) -> Result<String, String> {
    let health_timeout = health_timeout.unwrap_or(3).max(1);
    let _ = write_log("Router Restarting...");
    let _ = stop_router(base_url.clone());

    for _ in 0..25 {
        if !check_router_status(base_url.clone(), Some(health_timeout)).await {
            break;
        }
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }

    start_router(
        startup_command,
        base_url,
        startup_timeout,
        Some(health_timeout),
    )
    .await
}

#[tauri::command]
pub fn log_event(message: String) -> Result<(), String> {
    write_log(&message)
}
