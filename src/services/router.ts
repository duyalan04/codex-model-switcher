import { invoke } from "@tauri-apps/api/core";

export async function fetchModels(baseUrl: string): Promise<string[]> {
  return invoke<string[]>("fetch_models", { baseUrl });
}

export interface Combo {
  name: string;
  models: string[];
  primary_model?: string | null;
  primary_effort?: string | null;
}

export async function fetchCombos(): Promise<Combo[]> {
  return invoke<Combo[]>("fetch_combos");
}

export async function setPrimaryModel(
  comboName: string,
  model: string,
  reasoningEffort?: string | null
): Promise<void> {
  return invoke<void>("set_primary_model", {
    comboName,
    model,
    reasoningEffort: reasoningEffort ?? null,
  });
}


// ─── Router lifecycle ────────────────────────────────────────────────────────

export async function checkRouterStatus(
  baseUrl: string,
  healthTimeout?: number
): Promise<boolean> {
  return invoke<boolean>("check_router_status", { baseUrl, healthTimeout });
}

/// Returns "started" | "already_running".
export async function startRouter(
  startupCommand: string,
  baseUrl: string,
  startupTimeout?: number,
  healthTimeout?: number
): Promise<string> {
  return invoke<string>("start_router", {
    startupCommand,
    baseUrl,
    startupTimeout,
    healthTimeout,
  });
}

export async function stopRouter(baseUrl: string): Promise<void> {
  return invoke<void>("stop_router", { baseUrl });
}

export async function restartRouter(
  startupCommand: string,
  baseUrl: string,
  startupTimeout?: number,
  healthTimeout?: number
): Promise<string> {
  return invoke<string>("restart_router", {
    startupCommand,
    baseUrl,
    startupTimeout,
    healthTimeout,
  });
}

/// Append a line to ~/.codex-switch/logs/YYYY-MM-DD.log
export async function logEvent(message: string): Promise<void> {
  try {
    await invoke<void>("log_event", { message });
  } catch {
    /* logging is best-effort, never throws to the UI */
  }
}

// ─── Router settings ─────────────────────────────────────────────────────────

export interface RouterSettings {
  auto_start: boolean;
  startup_command: string;
  health_check_interval: number;
  startup_timeout: number;
  health_timeout: number;
  retry_delay: number;
}

export const DEFAULT_ROUTER_SETTINGS: RouterSettings = {
  auto_start: true,
  startup_command: "9router",
  health_check_interval: 5,
  startup_timeout: 6,
  health_timeout: 3,
  retry_delay: 500,
};

export async function loadRouterSettings(): Promise<RouterSettings> {
  return invoke<RouterSettings>("load_router_settings");
}

export async function saveRouterSettings(
  settings: RouterSettings
): Promise<void> {
  return invoke<void>("save_router_settings", { settings });
}

// ─── Quota / Usage tracking ───────────────────────────────────────────────────

export interface DailyUsage {
  date: string;
  calls: number;
  cost: number;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ProviderStats {
  connection_id: string;
  connection_name: string;
  provider: string;
  plan_type: string;
  total_calls: number;
  total_cost: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_tokens: number;
  days_active: number;
  first_seen: string;
  last_seen: string;
}

export interface QuotaWindow {
  used_percent: number;
  remaining_percent: number;
  reset_at: number | null;
  reset_after_seconds: number | null;
}

export interface ConnectionQuota {
  connection_id: string;
  connection_name: string;
  provider: string;
  plan_type: string;
  is_active: boolean;
  primary_window: QuotaWindow | null;
  secondary_window: QuotaWindow | null;
  error: string | null;
}

export interface QuotaReport {
  providers: ProviderStats[];
  quotas: ConnectionQuota[];
  daily: DailyUsage[];
  grand_total_calls: number;
  grand_total_cost: number;
  grand_total_tokens: number;
  report_date: string;
}

export async function getQuota(): Promise<QuotaReport> {
  return invoke<QuotaReport>("get_quota");
}

export async function setConnectionActive(
  connectionId: string,
  active: boolean
): Promise<void> {
  return invoke<void>("set_connection_active", { connectionId, active });
}

export interface UpdateInfo {
  current_version: string;
  latest_version: string;
  update_available: boolean;
  download_url: string | null;
  notes: string | null;
}

export async function checkUpdate(): Promise<UpdateInfo> {
  return invoke<UpdateInfo>("check_update");
}

export async function installUpdate(downloadUrl: string): Promise<void> {
  return invoke<void>("install_update", { downloadUrl });
}
