import { useEffect, useState, useCallback } from "react";
import { RefreshCw, BarChart2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../lib/utils";
import { getQuota, QuotaReport, setConnectionActive } from "../services/router";

interface QuotaPanelProps {
  className?: string;
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtCost(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

function fmtReset(seconds: number | null, resetAt: number | null): string {
  const remaining = seconds ?? (resetAt ? resetAt - Math.floor(Date.now() / 1000) : 0);
  if (remaining <= 0) return "resetting";
  const days = Math.floor(remaining / 86400);
  const hours = Math.floor((remaining % 86400) / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function MiniBar({ value, max, showPercent, isRemaining, className }: { value: number; max: number; showPercent?: boolean; isRemaining?: boolean; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  let color = "bg-[hsl(var(--primary))]/60";
  if (isRemaining) {
    color = pct <= 10 ? "bg-red-500" : pct <= 30 ? "bg-yellow-500" : "bg-[hsl(var(--success))]/80";
  } else {
    color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-500" : "bg-[hsl(var(--primary))]/60";
  }
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-1.5 flex-1 rounded-full bg-[hsl(var(--muted))] overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showPercent && (
        <span className="text-[13px] font-mono text-[hsl(var(--muted-foreground))] w-10 text-right">{pct.toFixed(0)}%</span>
      )}
    </div>
  );
}

export function QuotaPanel({ className }: QuotaPanelProps) {
  const [date, setDate] = useState("");
  const [report, setReport] = useState<QuotaReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await getQuota(date);
      setReport(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => { void load(); }, [load]);

  const toggleConnection = useCallback(async (connectionId: string, active: boolean) => {
    setTogglingId(connectionId);
    setError(null);
    setReport(current => current && {
      ...current,
      quotas: current.quotas.map(quota => quota.connection_id === connectionId ? { ...quota, is_active: active } : quota),
    });
    try {
      await setConnectionActive(connectionId, active);
    } catch (e) {
      setReport(current => current && {
        ...current,
        quotas: current.quotas.map(quota => quota.connection_id === connectionId ? { ...quota, is_active: !active } : quota),
      });
      setError(String(e));
    } finally {
      setTogglingId(null);
    }
  }, []);


  return (
    <div className={cn("rounded-xl border border-[hsl(var(--border))]/50 bg-[hsl(var(--muted))]/5", className)} style={{ padding: '24px' }}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <BarChart2 size={13} className="text-[hsl(var(--primary))]" />
          <span className="text-[13px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            Daily Usage (DB)
          </span>
        </div>
        <div className="flex items-center gap-2">
          {report && (
            <span className="text-[12px] font-mono text-[hsl(var(--muted-foreground))]">
              {report.report_date}
            </span>
          )}
          <button
            onClick={() => void load()}
            disabled={loading}
            className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-[hsl(var(--muted))] transition-colors disabled:opacity-50"
            title="Refresh quota"
          >
            <RefreshCw size={11} className={cn(loading && "animate-spin")} />
          </button>
          <button
            onClick={() => setExpanded(x => !x)}
            className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-[hsl(var(--muted))] transition-colors"
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-2">
        <button
          type="button"
          disabled={loading}
          aria-pressed={!date}
          onClick={() => { setReport(null); setDate(""); if (!date) void load(); }}
          className="rounded-md border border-[hsl(var(--border))] px-2 py-1 text-xs disabled:opacity-50"
        >Today</button>
        <label className="flex items-center gap-2 text-xs">
          Date
          <input
            type="date"
            value={date || report?.selected_usage.date || ""}
            disabled={loading}
            onChange={event => { setReport(null); setDate(event.target.value); }}
            className="min-w-0 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1 disabled:opacity-50"
          />
        </label>
        <span className="text-xs text-[hsl(var(--muted-foreground))]">Local time</span>
      </div>

      {error && (
        <div className="text-[12px] text-[hsl(var(--destructive))] font-mono mb-2">{error}</div>
      )}

      {report && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-6 gap-2 mb-2">
            {[
              ["Requests", report.selected_usage.calls.toLocaleString(), "col-span-2"],
              ["Input", report.selected_usage.prompt_tokens.toLocaleString(), "col-span-2"],
              ["Cached", report.selected_usage.cached_tokens.toLocaleString(), "col-span-2"],
              ["Output", report.selected_usage.completion_tokens.toLocaleString(), "col-span-3"],
              ["Est. Cost", fmtCost(report.selected_usage.cost), "col-span-3"],
            ].map(([label, value, colClass]) => (
              <div key={label} className={cn("flex min-w-0 flex-col items-center rounded-lg bg-[hsl(var(--muted))]/30 p-2", colClass)}>
                <span className="text-[12px] font-medium text-[hsl(var(--muted-foreground))]">{label}</span>
                <span className="text-sm font-bold tabular-nums break-all">{value}</span>
              </div>
            ))}
          </div>


          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar space-y-4 pr-1" style={{ overflowY: 'auto' }}>
            {report.quotas.length > 0 && (
              <div className="flex flex-col gap-3 mb-2">
                <span className="text-[13px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]/60">
                  Remaining Quota
                </span>
                {report.quotas.map(quota => (
                  <div key={quota.connection_id} className="rounded-lg space-y-1.5 border border-[hsl(var(--border))]/50" style={{ padding: '10px 12px', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-[13px] font-medium truncate min-w-0 flex-1">
                          {quota.connection_name}
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={quota.is_active}
                          disabled={togglingId === quota.connection_id}
                          onClick={() => void toggleConnection(quota.connection_id, !quota.is_active)}
                          className={cn(
                            "relative shrink-0 h-5 w-9 rounded-full transition-colors disabled:opacity-50",
                            quota.is_active ? "bg-[hsl(var(--primary))]" : "bg-[hsl(var(--muted))]"
                          )}
                          title={quota.is_active ? "Turn off account" : "Turn on account"}
                        >
                          <span
                            className="absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all duration-200"
                            style={{ left: quota.is_active ? '18px' : '2px' }}
                          />
                        </button>
                      </div>
                      <div className="text-[13px] text-[hsl(var(--muted-foreground))]">
                        {quota.plan_type} • {quota.is_active ? "active" : "inactive"}
                      </div>
                    </div>
                    {quota.primary_window && (
                      <div className="flex items-center gap-3">
                        <span className="shrink-0 text-[13px] w-16 text-[hsl(var(--muted-foreground))]">Session</span>
                        <MiniBar className="flex-1" value={quota.primary_window.remaining_percent} max={100} showPercent isRemaining />
                        <span className="shrink-0 text-[13px] font-mono text-[hsl(var(--muted-foreground))] tabular-nums text-right w-16">
                          {fmtReset(quota.primary_window.reset_after_seconds, quota.primary_window.reset_at)}
                        </span>
                      </div>
                    )}
                    {quota.secondary_window && (
                      <div className="flex items-center gap-3">
                        <span className="shrink-0 text-[13px] w-16 text-[hsl(var(--muted-foreground))]">Secondary</span>
                        <MiniBar className="flex-1" value={quota.secondary_window.remaining_percent} max={100} showPercent isRemaining />
                        <span className="shrink-0 text-[13px] font-mono text-[hsl(var(--muted-foreground))] tabular-nums text-right w-16">
                          {fmtReset(quota.secondary_window.reset_after_seconds, quota.secondary_window.reset_at)}
                        </span>
                      </div>
                    )}
                    {quota.error && (
                      <div className="text-[13px] text-[hsl(var(--destructive))] truncate" title={quota.error}>
                        {quota.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Per-provider summary */}
            {expanded && report.providers.length > 0 && (
              <div className="flex flex-col gap-2 mb-2 mt-4">
                <span className="text-[13px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]/60">
                  Connections
                </span>
                {report.providers.map(p => (
                  <div key={p.connection_id} className="flex items-center justify-between rounded-lg border border-[hsl(var(--border))]/50" style={{ padding: '8px 12px', backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-[13px] font-medium truncate">
                        {p.connection_name || p.connection_id.slice(0, 8)}
                      </span>
                      <span className="text-[13px] text-[hsl(var(--muted-foreground))]">
                        {p.plan_type} • {p.days_active}d active
                      </span>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className="text-[12px] font-bold tabular-nums">{fmt(p.total_calls)} calls</span>
                      <span className="text-[13px] font-mono text-[hsl(var(--primary))]">
                        All-time est.: {fmtCost(p.total_cost)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {!report && !error && !loading && (
        <div className="text-[12px] text-[hsl(var(--muted-foreground))] text-center py-2">
          Loading usage data...
        </div>
      )}
    </div>
  );
}
