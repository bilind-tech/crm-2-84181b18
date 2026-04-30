import * as React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface PrimaryActionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
}

/**
 * Konsistenter primärer "Erstellen"-Button für die Page-Header.
 * Leichte Abrundung (rounded-lg), Gradient + sanftes Glow.
 */
export const PrimaryAction = React.forwardRef<HTMLButtonElement, PrimaryActionProps>(
  ({ icon: Icon = Plus, label, className, ...props }, ref) => {
    return (
      <button
        ref={ref}
        {...props}
        className={cn(
          "group relative inline-flex h-10 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-primary-foreground",
          "bg-gradient-to-b from-primary to-[color-mix(in_oklab,var(--primary)_85%,black)]",
          "shadow-[0_1px_0_rgba(255,255,255,0.18)_inset,0_6px_18px_-6px_color-mix(in_oklab,var(--primary)_55%,transparent),0_1px_2px_rgba(15,23,42,0.18)]",
          "ring-1 ring-inset ring-white/10",
          "transition-all duration-150 ease-out",
          "hover:shadow-[0_1px_0_rgba(255,255,255,0.22)_inset,0_10px_24px_-8px_color-mix(in_oklab,var(--primary)_70%,transparent),0_1px_2px_rgba(15,23,42,0.22)]",
          "hover:brightness-[1.04] active:brightness-[0.97] active:translate-y-[0.5px]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:pointer-events-none disabled:opacity-60",
          className,
        )}
      >
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </button>
    );
  },
);
PrimaryAction.displayName = "PrimaryAction";
