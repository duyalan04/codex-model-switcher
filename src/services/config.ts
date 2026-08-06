import { invoke } from "@tauri-apps/api/core";

export interface CodexConfig {
  model: string | null;
  model_provider: string | null;
  model_reasoning_effort: string | null;
  base_url: string | null;
}

export const DEFAULT_BASE_URL = "http://127.0.0.1:20128/v1";

export async function loadConfig(): Promise<CodexConfig> {
  return invoke<CodexConfig>("load_config");
}

export async function saveConfig(
  model: string,
  reasoningEffort: string
): Promise<boolean> {
  return invoke<boolean>("save_config", {
    model,
    reasoningEffort,
  });
}
