import { useCallback, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "../lib/utils";
import { useClickOutside } from "../hooks/useClickOutside";

const REASONING_EFFORTS = [
  { value: "minimal", label: "minimal" },
  { value: "low", label: "low" },
  { value: "medium", label: "medium" },
  { value: "high", label: "high" },
  { value: "xhigh", label: "extra high" },
  { value: "max", label: "max" },
] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number]["value"];

interface ReasoningSelectProps {
  value: string;
  onChange: (effort: string) => void;
}

export function ReasoningSelect({ value, onChange }: ReasoningSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setIsOpen(false), []);

  useClickOutside(containerRef, close);

  return (
    <div className="relative w-full" ref={containerRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
        "flex h-10 w-full cursor-pointer items-center rounded-xl border border-[hsl(var(--border))]/80 bg-[hsl(var(--input))]/60",
        "pl-5 pr-14",
        "text-sm font-semibold capitalize text-[hsl(var(--foreground))] transition-colors",
        "hover:border-[hsl(var(--primary))]/60 hover:ring-1 hover:ring-[hsl(var(--primary))]/20",
        isOpen && "border-[hsl(var(--primary))]/60 ring-1 ring-[hsl(var(--primary))]/20"
      )}>
        <span className="truncate">{value || "Select effort"}</span>
        <ChevronDown 
          className={cn("pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] transition-transform", isOpen && "rotate-180")} 
          size={16} 
        />
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 top-full mt-2 z-50 overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl animate-in fade-in-80 slide-in-from-top-2">
          <div className="max-h-60 overflow-y-auto p-1 custom-scrollbar">
            {REASONING_EFFORTS.map((effort) => (
              <div
                key={effort.value}
                onClick={() => {
                  onChange(effort.value);
                  setIsOpen(false);
                }}
                className={cn(
                  "relative flex cursor-pointer select-none items-center rounded-lg px-8 py-2.5 text-sm outline-none transition-colors",
                  "hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]",
                  value === effort.value ? "bg-[hsl(var(--primary))]/10 text-[hsl(var(--primary))] font-semibold" : "text-[hsl(var(--foreground))]"
                )}
              >
                <span className="capitalize">{effort.label}</span>
                {value === effort.value && (
                  <span className="absolute left-2.5 flex h-3.5 w-3.5 items-center justify-center">
                    <Check size={14} />
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
