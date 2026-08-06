import { Moon, Sun } from "lucide-react";
import { cn } from "../lib/utils";

interface ThemeToggleProps {
  theme: "dark" | "light";
  onToggle: () => void;
}

export function ThemeToggle({ theme, onToggle }: ThemeToggleProps) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "flex h-9 w-9 items-center justify-center rounded-lg border border-[hsl(var(--border))]",
        "bg-[hsl(var(--input))] text-[hsl(var(--muted-foreground))]",
        "transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
      )}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}

