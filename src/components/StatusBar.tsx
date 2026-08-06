import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { cn } from "../lib/utils";

export type StatusState = "idle" | "loading" | "success" | "error";

export interface StatusItem {
  key: string;
  label: string;
  state: StatusState;
}

interface StatusBarProps {
  items: StatusItem[];
}

function StatusIcon({ state }: { state: StatusState }) {
  if (state === "loading") {
    return <Loader2 size={14} className="animate-spin text-[hsl(var(--primary))]" />;
  }
  if (state === "success") {
    return <CheckCircle2 size={14} className="text-[hsl(var(--success))]" />;
  }
  if (state === "error") {
    return <XCircle size={14} className="text-[hsl(var(--destructive))]" />;
  }
  return <div className="size-2 rounded-full bg-[hsl(var(--muted-foreground))]/30" />;
}

export function StatusBar({ items }: StatusBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-6">
      {items.map((item) => (
        <div
          key={item.key}
          className="flex items-center gap-2 text-xs font-medium"
        >
          <StatusIcon state={item.state} />
          <span
            className={cn(
              item.state === "success" && "text-[hsl(var(--muted-foreground))]",
              item.state === "error" && "text-[hsl(var(--destructive))]",
              item.state === "loading" && "text-[hsl(var(--primary))]",
              item.state === "idle" && "text-[hsl(var(--muted-foreground))]/50"
            )}
          >
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
