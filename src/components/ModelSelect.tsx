import { useCallback, useMemo, useRef, useState } from "react";
import { ChevronDown, Star, X, Search } from "lucide-react";
import { cn } from "../lib/utils";
import { useClickOutside } from "../hooks/useClickOutside";

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

  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setIsOpen(false), []);

  useClickOutside(containerRef, close);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" size={16} />
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setIsOpen(true);
          }}
          disabled={disabled || models.length === 0}
          placeholder="Filter models..."
          className={cn(
            "h-10 w-full rounded-xl border border-[hsl(var(--border))]/80 bg-[hsl(var(--input))]/40",
            "text-sm text-[hsl(var(--foreground))] outline-none transition-colors",
            "placeholder:text-[hsl(var(--muted-foreground))] focus:border-[hsl(var(--primary))]/60 focus:ring-1 focus:ring-[hsl(var(--primary))]/20",
            "disabled:opacity-50 disabled:cursor-not-allowed"
          )}
          style={{ paddingLeft: '40px', paddingRight: '32px' }}
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
        <div className="relative min-w-0 flex-1" ref={containerRef}>
          <div 
            onClick={() => { if (!disabled) setIsOpen(!isOpen); }}
            className={cn(
            "flex h-10 w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-[hsl(var(--border))]/80 bg-[hsl(var(--input))]/60",
            "text-sm font-semibold text-[hsl(var(--foreground))] transition-colors",
            "hover:border-[hsl(var(--primary))]/60 hover:ring-1 hover:ring-[hsl(var(--primary))]/20",
            isOpen && "border-[hsl(var(--primary))]/60 ring-1 ring-[hsl(var(--primary))]/20",
            disabled ? "opacity-50 cursor-not-allowed" : ""
          )}
          style={{ paddingLeft: '20px', paddingRight: '56px' }}>
            <span className="truncate">
              {value || "Select a model"}
            </span>
            {activeEffort && (
              <span className="shrink-0 rounded-md bg-[hsl(var(--primary))]/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[hsl(var(--primary))]">
                {activeEffort}
              </span>
            )}
            <ChevronDown 
              className={cn("pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] transition-transform", isOpen && "rotate-180")} 
              size={16} 
            />
          </div>

          {isOpen && (
            <div className="absolute left-0 right-0 top-full mt-2 z-50 overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl animate-in fade-in-80 slide-in-from-top-2">
              <div className="max-h-60 overflow-y-auto custom-scrollbar" style={{ padding: '4px' }}>
                {filtered.length === 0 && (
                  <div className="px-3 py-2 text-sm text-[hsl(var(--muted-foreground))]">
                    No models found
                  </div>
                )}
                {filtered.map((model) => {
                  const eff = effortByModel?.[model];
                  return (
                    <div
                      key={model}
                      onClick={() => {
                        onChange(model);
                        setIsOpen(false);
                      }}
                      className={cn(
                        "relative flex cursor-pointer select-none items-center justify-between rounded-lg text-sm outline-none transition-colors",
                        "hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]",
                        value === model ? "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] font-semibold" : "text-[hsl(var(--foreground))]"
                      )}
                      style={{ padding: '10px 12px' }}
                    >
                      <span className="truncate">{model}</span>
                      {eff && (
                        <span className={cn(
                          "shrink-0 rounded-md text-[10px] font-bold uppercase tracking-wide",
                          value === model ? "bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))]" : "bg-[hsl(var(--muted))]/80 text-[hsl(var(--muted-foreground))]"
                        )}
                        style={{ padding: '2px 6px' }}>
                          {eff}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
