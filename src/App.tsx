import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Check, Loader2, Cpu, Info, Download, X } from "lucide-react";
import { ModelSelect } from "./components/ModelSelect";
import { ReasoningSelect } from "./components/ReasoningSelect";
import { RouterControl, RouterStatus } from "./components/RouterControl";
import { StatusBar, StatusState, StatusItem } from "./components/StatusBar";
import { ThemeToggle } from "./components/ThemeToggle";
import { QuotaPanel } from "./components/QuotaPanel";
import { cn } from "./lib/utils";
import {
  CodexConfig,
  DEFAULT_BASE_URL,
  loadConfig,
  saveConfig,
} from "./services/config";
import { fetchCombos, fetchModels, setPrimaryModel, checkUpdate, installUpdate, Combo, UpdateInfo } from "./services/router";

interface Toast {
  type: "success" | "error" | "info";
  message: string;
}

type Theme = "dark" | "light";

function App() {
  const [config, setConfig] = useState<CodexConfig | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [routerLive, setRouterLive] = useState(false);

  // UI Selection State
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedReasoning, setSelectedReasoning] = useState("medium");

  // Actually applied/active State
  const [activeModel, setActiveModel] = useState<string>("");
  const [activeReasoning, setActiveReasoning] = useState<string>("medium");

  const [configState, setConfigState] = useState<StatusState>("loading");
  const [routerState, setRouterState] = useState<StatusState>("loading");

  const [applying, setApplying] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [theme, setTheme] = useState<Theme>("dark");
  const [combos, setCombos] = useState<Combo[]>([]);
  const [rawModels, setRawModels] = useState<string[]>([]);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme") as Theme | null;
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    }
  }, []);

  const toggleTheme = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    localStorage.setItem("theme", next);
    document.documentElement.setAttribute("data-theme", next);
  }, [theme]);

  const baseUrl = config?.base_url || DEFAULT_BASE_URL;

  const showToast = useCallback((t: Toast) => {
    setToast(t);
    setTimeout(() => setToast(null), 3500);
  }, []);

  const loadCombos = useCallback(async () => {
    try {
      const list = await fetchCombos();
      setCombos(list);
      const allModels = list.flatMap(c => c.models);
      const uniqueModels = [...new Set(allModels)];
      setModels(uniqueModels);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => { void loadCombos(); }, [loadCombos]);

  const loadModels = useCallback(async (url: string) => {
    setRouterState("loading");
    try {
      const list = await fetchModels(url);
      setRawModels(list);
      setRouterState("success");
      return list;
    } catch (e) {
      setRouterState("error");
      return [];
    }
  }, []);

  const loadModelsAndCombos = useCallback(async (url: string) => {
    await loadModels(url);
    await loadCombos();
  }, [loadModels, loadCombos]);

  const init = useCallback(async () => {
    setConfigState("loading");
    try {
      const cfg = await loadConfig();
      setConfig(cfg);

      // Attempt to restore the specific underlying model if the config model is "combo"
      const storedLastModel = localStorage.getItem("lastActiveModel");
      const storedLastEffort = localStorage.getItem("lastActiveEffort");
      const initialModel = storedLastModel || cfg.model || "";
      const initialReasoning = storedLastEffort || cfg.model_reasoning_effort || "medium";

      setSelectedModel(initialModel);
      setActiveModel(initialModel);
      setSelectedReasoning(initialReasoning);
      setActiveReasoning(initialReasoning);

      setConfigState("success");
    } catch (e) {
      console.error("Config load error:", e);
      setConfigState("error");
    }
  }, []);

  useEffect(() => { init(); }, [init]);

  useEffect(() => {
    void checkUpdate()
      .then(info => { if (info.update_available) setUpdate(info); })
      .catch(() => { /* update check is best-effort */ });
  }, []);

  useEffect(() => {
    if (!config || localStorage.getItem("lastActiveModel")) return;
    const activeCombo = combos.find(combo => combo.name === config.model);
    if (!activeCombo?.primary_model) return;
    setSelectedModel(activeCombo.primary_model);
    setActiveModel(activeCombo.primary_model);
    if (activeCombo.primary_effort) {
      setSelectedReasoning(activeCombo.primary_effort);
      setActiveReasoning(activeCombo.primary_effort);
    }
  }, [config, combos]);

  const prevStatus = useRef<RouterStatus>("unknown");
  const handleRouterStatus = useCallback((s: RouterStatus) => {
    const prev = prevStatus.current;
    prevStatus.current = s;
    if (s === "running") {
      setRouterLive(true);
      if (prev !== "running" || models.length === 0) {
        void loadModelsAndCombos(baseUrl);
      }
    } else if (s === "offline" || s === "error") {
      setRouterLive(false);
      setRouterState("error");
    } else if (s === "starting" || s === "stopping") {
      setRouterLive(false);
      setRouterState("loading");
    }
  }, [baseUrl, loadModelsAndCombos, models.length]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadModelsAndCombos(baseUrl);
    setRefreshing(false);
  }, [baseUrl, loadModelsAndCombos]);

  const handleApply = useCallback(async () => {
    // Fallback to "9router" if model_provider is not set (for combo mode)
    if (!config && configState !== "success") {
      showToast({ type: "error", message: "Config not loaded yet. Please wait..." });
      return;
    }

    if (!baseUrl || !baseUrl.startsWith("http")) {
      showToast({ type: "error", message: "Invalid base_url" });
      return;
    }
    if (!selectedModel) {
      showToast({ type: "error", message: "Please select a model" });
      return;
    }
    setApplying(true);
    try {
      const targetCombo = combos.find(c => c.models.includes(selectedModel));
      if (targetCombo) {
        await setPrimaryModel(targetCombo.name, selectedModel, selectedReasoning);
        await saveConfig(targetCombo.name, selectedReasoning);

        setActiveModel(selectedModel);
        setActiveReasoning(selectedReasoning);
        localStorage.setItem("lastActiveModel", selectedModel);
        localStorage.setItem("lastActiveEffort", selectedReasoning);

        showToast({ type: "success", message: `Applied: ${selectedModel} (${selectedReasoning})` });
      } else {
        const changed = await saveConfig(selectedModel, selectedReasoning);

        setActiveModel(selectedModel);
        setActiveReasoning(selectedReasoning);
        localStorage.setItem("lastActiveModel", selectedModel);
        localStorage.setItem("lastActiveEffort", selectedReasoning);

        if (!changed) {
          showToast({ type: "info", message: "No changes detected." });
          return;
        }
        showToast({ type: "success", message: "Config updated. Restart required." });
      }
    } catch (e) {
      const msg = typeof e === "string" ? e : String(e);
      showToast({ type: "error", message: msg });
    } finally {
      setApplying(false);
    }
  }, [config, baseUrl, selectedModel, selectedReasoning, combos, showToast]);

  const statusItems = useMemo<StatusItem[]>(() => [
    { key: "config", label: configState === "success" ? "Config OK" : configState === "loading" ? "Loading..." : "Config Error", state: configState },
    { key: "router", label: routerState === "success" ? "Connected" : routerState === "loading" ? "Connecting..." : "Router Error", state: routerState },
    { key: "models", label: routerState === "success" ? `${rawModels.length} up / ${combos.length} combos` : `${rawModels.length} up`, state: routerState === "success" ? "success" : routerState === "loading" ? "loading" : "error" },
  ], [configState, routerState, rawModels.length, combos.length]);

  // Map of model name → effort currently pinned in the combo DB.
  // Used to display a badge next to the active model so users can see which
  // combo models already have a "(level)" suffix applied at the router layer.
  const effortByModel = useMemo<Record<string, string>>(() => {
    const map: Record<string, string> = {};
    for (const combo of combos) {
      if (combo.primary_model && combo.primary_effort) {
        map[combo.primary_model] = combo.primary_effort;
      }
    }
    return map;
  }, [combos]);

  const isDirty = selectedModel !== activeModel || selectedReasoning !== activeReasoning;

  return (
    <div className="flex h-screen w-full flex-col font-sans bg-[hsl(var(--background))] text-[hsl(var(--foreground))] overflow-hidden gap-5" style={{ padding: '32px' }}>
        {update && (
          <div className="shrink-0 flex items-center gap-3 rounded-xl border border-[hsl(var(--primary))]/40 bg-[hsl(var(--primary))]/10 px-4 py-2.5">
            <Download size={14} className="text-[hsl(var(--primary))] shrink-0" />
            <div className="min-w-0 flex-1">
              <span className="text-xs font-semibold">
                Update available: v{update.latest_version}
              </span>
              <span className="text-[11px] text-[hsl(var(--muted-foreground))] ml-2">
                (current v{update.current_version})
              </span>
              {update.notes && (
                <div className="text-[10px] text-[hsl(var(--muted-foreground))] truncate">{update.notes}</div>
              )}
            </div>
            {update.download_url && (
              <button
                onClick={async () => {
                  if (!update.download_url) return;
                  setInstalling(true);
                  try {
                    await installUpdate(update.download_url);
                  } catch (e) {
                    setInstalling(false);
                    showToast({ type: "error", message: typeof e === "string" ? e : String(e) });
                  }
                }}
                disabled={installing}
                className="shrink-0 flex items-center gap-1.5 rounded-lg bg-[hsl(var(--primary))] px-3 py-1.5 text-[11px] font-bold text-[hsl(var(--primary-foreground))] hover:opacity-90 disabled:opacity-60"
              >
                {installing ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                {installing ? "Installing..." : "Update now"}
              </button>
            )}
            <button
              onClick={() => setUpdate(null)}
              title="Dismiss"
              className="shrink-0 flex h-6 w-6 items-center justify-center rounded-md hover:bg-[hsl(var(--muted))]"
            >
              <X size={12} />
            </button>
          </div>
        )}

        {/* 1. Header Row */}
        <header className="flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-[hsl(var(--primary))] to-blue-500 text-white shadow-md">
              <Cpu size={20} />
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight text-[hsl(var(--foreground))] leading-tight">Codex Switcher</h1>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">9Router Control</span>
                <div className="w-1 h-1 rounded-full bg-[hsl(var(--border))]"></div>
                <span className="text-[11px] font-medium text-[hsl(var(--primary))] flex items-center gap-1">
                  <Info size={12} /> Active: {activeModel || "—"} ({activeReasoning || "—"})
                </span>
              </div>
            </div>
          </div>
          <ThemeToggle theme={theme} onToggle={toggleTheme} />
        </header>

        {/* 2. Main Dashboard Layout (2 Columns) */}
        <div className="custom-scrollbar flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden px-1.5 pb-1">
          <div className="grid grid-cols-2 gap-5 items-start">

            {/* LEFT COLUMN: Model Switcher (7 cols) */}
            <div className="min-w-0 flex flex-col gap-5">
              <section className="flex flex-col bg-[hsl(var(--muted))]/10 border border-[hsl(var(--border))]/40 rounded-2xl p-6 gap-6 h-full">
                {/* Target Model Area */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between h-6">
                    <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                      Target Model
                      {selectedModel !== activeModel && <span className="size-1.5 rounded-full bg-[hsl(var(--primary))] animate-pulse"></span>}
                    </label>
                    <span className="text-[10px] font-medium bg-[hsl(var(--muted))]/60 px-2 py-0.5 rounded text-[hsl(var(--foreground))]">{models.length} available</span>
                  </div>
                  <ModelSelect models={models} value={selectedModel} onChange={setSelectedModel} disabled={!routerLive} effortByModel={effortByModel} />
                </div>

                {/* Reasoning Effort Area */}
                <div className="flex flex-col gap-3">
                  <div className="flex items-center h-6">
                    <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
                      Reasoning Effort
                      {selectedReasoning !== activeReasoning && <span className="size-1.5 rounded-full bg-[hsl(var(--primary))] animate-pulse"></span>}
                    </label>
                  </div>
                  <ReasoningSelect value={selectedReasoning} onChange={setSelectedReasoning} />
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3 pt-4 mt-auto">
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    title="Refresh Models"
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--border))]/80",
                      "bg-[hsl(var(--background))]/50 text-[hsl(var(--foreground))]",
                      "transition-colors hover:bg-[hsl(var(--muted))] disabled:opacity-50"
                    )}
                  >
                    <RefreshCw size={16} className={cn(refreshing && "animate-spin")} />
                  </button>
                  <button
                    onClick={handleApply}
                    disabled={applying || !selectedModel || configState === "loading" || (!isDirty && activeModel !== "")}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-2 rounded-xl",
                      "h-10 text-xs font-bold shadow-md transition-all",
                      isDirty
                        ? "bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:scale-[1.02] active:scale-[0.98]"
                        : "bg-[hsl(var(--muted))]/60 text-[hsl(var(--muted-foreground))] border border-[hsl(var(--border))]/60",
                      "disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
                    )}
                  >
                    {applying ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    {isDirty ? "Apply Changes" : "Applied"}
                  </button>
                </div>
              </section>
            </div>

            {/* RIGHT COLUMN: Router Control & Quota Tracker (5 cols) */}
            <div className="min-w-0 flex flex-col gap-5 h-full overflow-y-auto pr-2 custom-scrollbar">
              <section className="shrink-0">
                <RouterControl baseUrl={baseUrl} onStatusChange={handleRouterStatus} />
              </section>

              <section className="shrink-0">
                <QuotaPanel />
              </section>
            </div>

          </div>
        </div>

        {/* 5. Footer */}
        <div className="shrink-0 flex items-center justify-between">
          <StatusBar items={statusItems} />
          <span className="text-[10px] font-mono text-[hsl(var(--muted-foreground))] opacity-50">v{__APP_VERSION__}</span>
        </div>

        {toast && (
          <div className={cn(
            "fixed top-6 right-6 animate-in slide-in-from-right-4 fade-in-90 rounded-xl px-5 py-3 text-sm font-semibold shadow-2xl border z-50",
            toast.type === "success" ? "bg-[hsl(var(--success))]/95 text-white border-[hsl(var(--success))]" :
              toast.type === "info" ? "bg-[hsl(var(--card))]/95 text-[hsl(var(--foreground))] border-[hsl(var(--border))]" :
                "bg-[hsl(var(--destructive))]/95 text-white border-[hsl(var(--destructive))]"
          )}>
            {toast.message}
          </div>
        )}
    </div>
  );
}

export default App;
