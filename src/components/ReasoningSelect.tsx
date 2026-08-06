import { ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";

const REASONING_EFFORTS = [
  { value: "minimal", label: "minimal" },
  { value: "low", label: "low" },
  { value: "medium", label: "medium" },
  { value: "high", label: "high" },
  { value: "xhigh", label: "extra high" },
] as const;
export type ReasoningEffort = (typeof REASONING_EFFORTS)[number]["value"];

interface ReasoningSelectProps {
  value: string;
  onChange: (effort: string) => void;
}

export function ReasoningSelect({ value, onChange }: ReasoningSelectProps) {
  return (
    <div className="relative w-full">
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="peer absolute inset-0 h-full w-full opacity-0 cursor-pointer z-10 outline-none appearance-none border-none bg-[hsl(var(--card))] text-[hsl(var(--foreground))]"
      >
        {REASONING_EFFORTS.map((effort) => (
          <option key={effort.value} value={effort.value}>
            {effort.label}
          </option>
        ))}
      </select>
      
      <div 
        style={{ paddingLeft: "20px", paddingRight: "56px" }}
        className={cn(
        "flex h-10 w-full items-center rounded-xl border border-[hsl(var(--border))]/80 bg-[hsl(var(--input))]/60",
        "text-sm font-semibold capitalize text-[hsl(var(--foreground))] transition-colors",
        "peer-focus:border-[hsl(var(--primary))]/60 peer-focus:ring-1 peer-focus:ring-[hsl(var(--primary))]/20"
      )}>
        <span className="truncate">{value}</span>
      </div>
      <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] z-0" size={16} />
    </div>
  );
}
