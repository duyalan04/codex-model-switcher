import { useEffect, useState, useCallback } from "react";
import { RefreshCw, BarChart2, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "../lib/utils";
import { getQuota, QuotaReport } from "../services/router";

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

function MiniBar({ value, max, showPercent, isRemaining }: { value: number; max: number; showPercent?: boolean; isRemaining?: boolean }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  let color = "bg-[hsl(var(--primary))]/60";
  if (isRemaining) {
    color = pct <= 10 ? "bg-red-500" : pct <= 30 ? "bg-yellow-500" : "bg-[hsl(var(--success))]/80";
  } else {
    color = pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-yellow-500" : "bg-[hsl(var(--primary))]/60";
  }
  return (
    <div className="flex items-center gap-1">
      <div className="h-1.5 w-16 rounded-full bg-[hsl(var(--muted))] overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all`}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showPercent && (
        <span className="text-[9px] font-mono text-[hsl(var(--muted-foreground))]">{pct.toFixed(0)}%</span>
      )}
    </div>
  );
}

export function QuotaPanel({ className }: QuotaPanelProps) {
  const [report, setReport] = useState<QuotaReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await getQuota();
      setReport(r);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const maxDailyCalls = report?.daily.reduce((m, d) => Math.max(m, d.calls), 0) ?? 1;

  return (
    <div className={cn("rounded-xl border border-[hsl(var(--border))]/50 bg-[hsl(var(--muted))]/5 p-3", className)}>
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <BarChart2 size={13} className="text-[hsl(var(--primary))]" />
          <span className="text-[11px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]">
            Actual Usage (DB)
          </span>
        </div>
        <div className="flex items-center gap-2">
          {report && (
            <span className="text-[10px] font-mono text-[hsl(var(--muted-foreground))]">
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

      {error && (
        <div className="text-[10px] text-[hsl(var(--destructive))] font-mono mb-2">{error}</div>
      )}

      {report && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            <div className="flex flex-col items-center rounded-lg bg-[hsl(var(--muted))]/30 p-2">
              <span className="text-[10px] font-medium text-[hsl(var(--muted-foreground))]">Total Calls</span>
              <span className="text-sm font-bold tabular-nums">{fmt(report.grand_total_calls)}</span>
            </div>
            <div className="flex flex-col items-center rounded-lg bg-[hsl(var(--muted))]/30 p-2">
              <span className="text-[10px] font-medium text-[hsl(var(--muted-foreground))]">Total Cost</span>
              <span className="text-sm font-bold tabular-nums">{fmtCost(report.grand_total_cost)}</span>
            </div>
            <div className="flex flex-col items-center rounded-lg bg-[hsl(var(--muted))]/30 p-2">
              <span className="text-[10px] font-medium text-[hsl(var(--muted-foreground))]">Total Tokens</span>
              <span className="text-sm font-bold tabular-nums">{fmt(report.grand_total_tokens)}</span>
            </div>
          </div>

          {report.quotas.length > 0 && (
            <div className="space-y-1.5 mb-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]/60">
                Remaining Quota
              </span>
              {report.quotas.map(quota => (
                <div key={quota.connection_id} className="rounded-md px-2 py-1.5 bg-[hsl(var(--muted))]/20 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium truncate">{quota.connection_name}</div>
                      <div className="text-[9px] text-[hsl(var(--muted-foreground))]">
                        {quota.plan_type} · {quota.is_active ? "active" : "inactive"}
                      </div>
                    </div>
                    {quota.primary_window && (
                      <span className="text-[10px] font-bold text-[hsl(var(--success))] tabular-nums">
                        {quota.primary_window.remaining_percent.toFixed(0)}% left
                      </span>
                    )}
                  </div>
                  {quota.primary_window && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] w-12 text-[hsl(var(--muted-foreground))]">Session</span>
                      <MiniBar value={quota.primary_window.remaining_percent} max={100} showPercent isRemaining />
                      <span className="text-[9px] font-mono text-[hsl(var(--muted-foreground))]">
                        {fmtReset(quota.primary_window.reset_after_seconds, quota.primary_window.reset_at)}
                      </span>
                    </div>
                  )}
                  {quota.secondary_window && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[9px] w-12 text-[hsl(var(--muted-foreground))]">Secondary</span>
                      <MiniBar value={quota.secondary_window.remaining_percent} max={100} showPercent isRemaining />
                      <span className="text-[9px] font-mono text-[hsl(var(--muted-foreground))]">
                        {fmtReset(quota.secondary_window.reset_after_seconds, quota.secondary_window.reset_at)}
                      </span>
                    </div>
                  )}
                  {quota.error && (
                    <div className="text-[9px] text-[hsl(var(--destructive))] truncate" title={quota.error}>
                      {quota.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Per-provider summary */}
          {report.providers.length > 0 && (
            <div className="space-y-1 mb-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]/60">
                Connections
              </span>
              {report.providers.map(p => (
                <div key={p.connection_id} className="flex items-center justify-between rounded-md px-2 py-1 bg-[hsl(var(--muted))]/20">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-medium truncate max-w-[140px]">
                      {p.connection_name || p.connection_id.slice(0, 8)}
                    </span>
                    <span className="text-[9px] text-[hsl(var(--muted-foreground))]">
                      {p.plan_type} · {p.days_active}d active
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-bold tabular-nums">{fmt(p.total_calls)} calls</span>
                    <span className="text-[9px] font-mono text-[hsl(var(--primary))]">
                      Spent: {fmtCost(p.total_cost)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Expanded: daily usage chart */}
          {expanded && report.daily.length > 0 && (
            <div className="mt-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-[hsl(var(--muted-foreground))]/60">
                Last {report.daily.length} days
              </span>
              <div className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
                {report.daily.map(d => (
                  <div key={d.date} className="flex items-center gap-2 rounded px-1.5 py-0.5 hover:bg-[hsl(var(--muted))]/20">
                    <span className="text-[9px] font-mono w-20 shrink-0 text-[hsl(var(--muted-foreground))]">
                      {d.date}
                    </span>
                    <MiniBar value={d.calls} max={maxDailyCalls} />
                    <span className="text-[9px] tabular-nums w-12 text-right shrink-0">
                      {fmt(d.calls)}c
                    </span>
                    <span className="text-[9px] tabular-nums w-16 text-right shrink-0">
                      {fmt(d.total_tokens)}t
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {!report && !error && !loading && (
        <div className="text-[10px] text-[hsl(var(--muted-foreground))] text-center py-2">
          Loading usage data...
        </div>
      )}
    </div>
  );
}
