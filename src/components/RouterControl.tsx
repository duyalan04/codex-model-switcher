import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Square, RotateCw, Loader2, Settings2 } from "lucide-react";
import { cn } from "../lib/utils";
import {
  checkRouterStatus,
  startRouter,
  stopRouter,
  restartRouter,
  loadRouterSettings,
  saveRouterSettings,
  RouterSettings,
  DEFAULT_ROUTER_SETTINGS,
} from "../services/router";

export type RouterStatus = "unknown" | "starting" | "running" | "stopping" | "offline" | "error";

interface RouterControlProps {
  baseUrl: string;
  onStatusChange?: (status: RouterStatus) => void;
}

const STATUS_META: Record<RouterStatus, { dot: string; label: string; text: string; pulse?: boolean }> = {
  unknown:  { dot: "bg-[hsl(var(--muted-foreground))]",  label: "Unknown",          text: "text-[hsl(var(--muted-foreground))]" },
  starting: { dot: "bg-yellow-500",                       label: "Starting...",       text: "text-yellow-500", pulse: true },
  running:  { dot: "bg-[hsl(var(--success))]",            label: "Running",          text: "text-[hsl(var(--success))]" },
  stopping: { dot: "bg-yellow-500",                       label: "Stopping...",       text: "text-yellow-500", pulse: true },
  offline:  { dot: "bg-[hsl(var(--destructive))]",        label: "Offline",          text: "text-[hsl(var(--destructive))]" },
  error:    { dot: "bg-[hsl(var(--destructive))]",        label: "Error",            text: "text-[hsl(var(--destructive))]" },
};

function Switch({ checked, onChange }: { checked: boolean; onChange: (c: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--primary))] focus-visible:ring-offset-1 focus-visible:ring-offset-[hsl(var(--background))]",
        checked ? "bg-[hsl(var(--primary))]" : "bg-[hsl(var(--muted))]"
      )}
    >
      <span className={cn("pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform", checked ? "translate-x-4" : "translate-x-1")} />
    </button>
  );
}

export function RouterControl({ baseUrl, onStatusChange }: RouterControlProps) {
  const [status, setStatus] = useState<RouterStatus>("unknown");
  const [settings, setSettings] = useState<RouterSettings>(DEFAULT_ROUTER_SETTINGS);
  const [busy, setBusy] = useState<null | "start" | "stop" | "restart">(null);
  const [showSettings, setShowSettings] = useState(false);

  const autoStartAttempted = useRef(false);

  const setStatusAndNotify = useCallback((s: RouterStatus) => {
    setStatus(s);
    onStatusChange?.(s);
  }, [onStatusChange]);

  const runHealthCheck = useCallback(async () => {
    const retryDelay = settings.retry_delay ?? 500;
    try {
      let alive = await checkRouterStatus(baseUrl, settings.health_timeout);
      if (!alive) {
        await new Promise((r) => setTimeout(r, retryDelay));
        alive = await checkRouterStatus(baseUrl, settings.health_timeout);
      }
      setStatusAndNotify(alive ? "running" : "offline");
    } catch {
      setStatusAndNotify("offline");
    }
  }, [baseUrl, settings.health_timeout, settings.retry_delay, setStatusAndNotify]);

  useEffect(() => {
    let cancelled = false;
    loadRouterSettings().then(s => { if (!cancelled) setSettings(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    runHealthCheck();
    const intervalMs = Math.max(1, settings.health_check_interval) * 1000;
    let id: ReturnType<typeof setInterval> | null = setInterval(runHealthCheck, intervalMs);

    const handleVisibility = () => {
      if (document.hidden) {
        if (id) { clearInterval(id); id = null; }
      } else {
        void runHealthCheck();
        id = setInterval(runHealthCheck, intervalMs);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("focus", runHealthCheck);
    return () => {
      if (id) clearInterval(id);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("focus", runHealthCheck);
    };
  }, [runHealthCheck, settings.health_check_interval]);

  useEffect(() => {
    if (!settings.auto_start || autoStartAttempted.current) return;
    if (status === "offline") {
      autoStartAttempted.current = true;
      void handleStart();
    }
  }, [settings.auto_start, status]);

  const handleStart = useCallback(async () => {
    setBusy("start"); setStatusAndNotify("starting");
    try {
      await startRouter(settings.startup_command, baseUrl, settings.startup_timeout, settings.health_timeout);
      setStatusAndNotify("running");
    } catch { setStatusAndNotify("error"); } finally { setBusy(null); }
  }, [baseUrl, settings, setStatusAndNotify]);

  const handleStop = useCallback(async () => {
    setBusy("stop"); setStatusAndNotify("stopping");
    try { await stopRouter(baseUrl); setStatusAndNotify("offline"); } 
    catch { setStatusAndNotify("error"); } finally { setBusy(null); }
  }, [baseUrl, setStatusAndNotify]);

  const handleRestart = useCallback(async () => {
    setBusy("restart"); setStatusAndNotify("stopping");
    try {
      await restartRouter(settings.startup_command, baseUrl, settings.startup_timeout, settings.health_timeout);
      setStatusAndNotify("running");
    } catch { setStatusAndNotify("error"); } finally { setBusy(null); }
  }, [baseUrl, settings, setStatusAndNotify]);

  const persistSettings = useCallback(async (next: RouterSettings) => {
    setSettings(next);
    try { await saveRouterSettings(next); } catch { }
  }, []);

  const meta = STATUS_META[status];

  return (
    <div className="flex flex-col gap-4">
      {/* Horizontal Layout for Services Row */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-[hsl(var(--muted))]/10 border border-[hsl(var(--border))]/40 px-6 py-4 shadow-sm">
        
        {/* Left Side: Status and Toggle */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="relative flex size-2.5">
              {meta.pulse && <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", meta.dot)}></span>}
              <span className={cn("relative inline-flex size-2.5 rounded-full", meta.dot)}></span>
            </span>
            <span className={cn("text-xs font-bold w-16", meta.text)}>{meta.label}</span>
          </div>

          <div className="w-px h-6 bg-[hsl(var(--border))]/40"></div>

          <label className="flex cursor-pointer items-center gap-2.5 text-xs font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-colors">
            <Switch checked={settings.auto_start} onChange={(c) => persistSettings({ ...settings, auto_start: c })} />
            Auto-start with app
          </label>
        </div>
        
        {/* Right Side: Action Buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleStart} disabled={busy !== null || status === "running" || status === "starting"}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[hsl(var(--border))]/80 bg-[hsl(var(--background))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--primary))]/10 hover:border-[hsl(var(--primary))]/30 hover:text-[hsl(var(--primary))] disabled:opacity-40 shadow-sm transition-all"
            title="Start Router"
          >
            {busy === "start" ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
          </button>
          <button
            onClick={handleStop} disabled={busy !== null || status === "offline" || status === "stopping"}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[hsl(var(--border))]/80 bg-[hsl(var(--background))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--destructive))]/10 hover:border-[hsl(var(--destructive))]/30 hover:text-[hsl(var(--destructive))] disabled:opacity-40 shadow-sm transition-all"
            title="Stop Router"
          >
            {busy === "stop" ? <Loader2 size={14} className="animate-spin" /> : <Square size={14} />}
          </button>
          <button
            onClick={handleRestart} disabled={busy !== null}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-[hsl(var(--border))]/80 bg-[hsl(var(--background))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] disabled:opacity-40 shadow-sm transition-all"
            title="Restart Router"
          >
            {busy === "restart" ? <Loader2 size={14} className="animate-spin" /> : <RotateCw size={14} />}
          </button>
          <div className="w-px h-9 bg-[hsl(var(--border))]/40 mx-1"></div>
          <button
            onClick={() => setShowSettings((v) => !v)}
            className={cn("flex h-9 w-9 items-center justify-center rounded-xl border border-[hsl(var(--border))]/80 bg-[hsl(var(--background))] hover:bg-[hsl(var(--muted))] shadow-sm transition-all", showSettings && "bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]")}
            title="Settings"
          >
            <Settings2 size={14} />
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="flex flex-col gap-4 rounded-2xl border border-[hsl(var(--border))]/50 bg-[hsl(var(--muted))]/20 p-5 shadow-inner animate-in slide-in-from-top-1 fade-in">
          <div className="grid grid-cols-3 gap-6">
            <div className="col-span-1">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Command</label>
              <input
                type="text" value={settings.startup_command} onChange={(e) => persistSettings({ ...settings, startup_command: e.target.value })}
                className="h-10 w-full rounded-xl border border-[hsl(var(--border))]/60 bg-[hsl(var(--input))]/40 px-3 text-xs text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))]/50"
              />
            </div>
            <div className="col-span-1">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Poll (s)</label>
              <input
                type="number" min={1} value={settings.health_check_interval} onChange={(e) => persistSettings({ ...settings, health_check_interval: Math.max(1, Number(e.target.value) || 1) })}
                className="h-10 w-full rounded-xl border border-[hsl(var(--border))]/60 bg-[hsl(var(--input))]/40 px-3 text-xs text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))]/50"
              />
            </div>
            <div className="col-span-1">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Retry (ms)</label>
              <input
                type="number" min={0} value={settings.retry_delay} onChange={(e) => persistSettings({ ...settings, retry_delay: Math.max(0, Number(e.target.value) || 0) })}
                className="h-10 w-full rounded-xl border border-[hsl(var(--border))]/60 bg-[hsl(var(--input))]/40 px-3 text-xs text-[hsl(var(--foreground))] outline-none focus:border-[hsl(var(--primary))]/50"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
