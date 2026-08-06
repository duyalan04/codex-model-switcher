import { useMemo, useState } from "react";
import { ChevronDown, Star, X, Search } from "lucide-react";
import { cn } from "../lib/utils";

interface ModelSelectProps {
  models: string[];
  value: string;
  onChange: (model: string) => void;
  disabled?: boolean;
  /// Map of model name → "(effort)" suffix currently pinned in the combo DB.
  /// Displayed as a small badge next to the model in the dropdown only.
  effortByModel?: Record<string, string>;
}

const FAVORITES_KEY = "model-favorites";
function getFavorites(): string[] {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? "[]"); }
  catch { return []; }
}

export function ModelSelect({ models, value, onChange, disabled, effortByModel }: ModelSelectProps) {
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<string[]>(() => getFavorites());

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query ? models.filter((model) => model.toLowerCase().includes(query)) : models;
  }, [models, search]);

  const activeEffort = effortByModel?.[value];

  const toggleFavorite = () => {
    if (!value) return;
    const next = favorites.includes(value) ? favorites.filter((m) => m !== value) : [...favorites, value];
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(next));
    setFavorites(next);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Search Input - Using inline style paddingLeft to guarantee it works! */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" size={16} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          disabled={disabled || models.length === 0}
          placeholder="Filter models..."
          style={{ paddingLeft: "40px" }}
          className={cn(
            "h-10 w-full rounded-xl border border-[hsl(var(--border))]/80 bg-[hsl(var(--input))]/40",
            "pr-8 text-sm text-[hsl(var(--foreground))] outline-none transition-colors",
            "placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--primary))]/60 focus:ring-1 focus:ring-[hsl(var(--primary))]/20",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] transition-colors hover:text-[hsl(var(--foreground))]"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="flex gap-3">
        <div className="relative min-w-0 flex-1">
          <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={disabled || filtered.length === 0}
            className="peer absolute inset-0 h-full w-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10 outline-none appearance-none border-none bg-[hsl(var(--card))] text-[hsl(var(--foreground))]"
          >
            <option value="" disabled hidden>Select a model</option>
            {filtered.map((model) => {
              const eff = effortByModel?.[model];
              return (
                <option key={model} value={model}>
                  {eff ? `${model} (${eff})` : model}
                </option>
              );
            })}
          </select>

          <div 
            style={{ paddingLeft: "20px", paddingRight: "56px" }}
            className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-xl border border-[hsl(var(--border))]/80 bg-[hsl(var(--input))]/60",
            "text-sm font-semibold text-[hsl(var(--foreground))] transition-colors",
            "peer-focus:border-[hsl(var(--primary))]/60 peer-focus:ring-1 peer-focus:ring-[hsl(var(--primary))]/20",
            (disabled || filtered.length === 0) ? "opacity-50" : ""
          )}>
            <span className="truncate">
              {value || "Select a model"}
            </span>
            {activeEffort && (
              <span className="shrink-0 rounded-md bg-[hsl(var(--primary))]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--primary))]">
                {activeEffort}
              </span>
            )}
          </div>
          <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] z-0" size={16} />
        </div>
        <button
          onClick={toggleFavorite}
          disabled={!value}
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[hsl(var(--border))]/80 bg-[hsl(var(--input))]/60",
            "text-[hsl(var(--muted-foreground))] transition-all hover:bg-[hsl(var(--muted))] disabled:opacity-50",
            favorites.includes(value) && "border-[hsl(var(--primary))]/40 bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] hover:bg-[hsl(var(--primary))]/20 shadow-sm"
          )}
        >
          <Star size={18} className={cn(favorites.includes(value) && "fill-current")} />
        </button>
      </div>
    </div>
  );
}
