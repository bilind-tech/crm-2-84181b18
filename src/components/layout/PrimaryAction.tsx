import * as React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface PrimaryActionProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon?: React.ComponentType<{ className?: string }>;
  label: string;
  /** "md" = Standard-Header (h-10), "lg" = Mobile/Vollbreite (h-12, größerer Text) */
  size?: "md" | "lg";
  /** Optional volle Breite — nützlich auf Mobile-Vollbreite-Layouts. */
  fullWidth?: boolean;
}

/**
 * Konsistenter primärer "Erstellen"-Button (Premium-Blue-Gradient).
 * Wird einheitlich in Page-Headern und auf der Mobile-Upload-Seite verwendet,
 * damit die gesamte App dieselbe primäre Action-Farbe spricht.
 */
export const PrimaryAction = React.forwardRef<HTMLButtonElement, PrimaryActionProps>(
  ({ icon: Icon = Plus, label, className, size = "md", fullWidth, ...props }, ref) => {
    return (
      <button
        ref={ref}
        {...props}
        className={cn(
          "group relative inline-flex items-center gap-2 rounded-lg font-semibold text-white",
          size === "lg" ? "h-12 px-5 text-base" : "h-10 px-4 text-sm",
          fullWidth && "w-full justify-center",
          // Premium blue gradient (helleres, sattes Blau)
          "bg-[linear-gradient(180deg,#3B82F6_0%,#2563EB_55%,#1D4ED8_100%)]",
          "shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_8px_22px_-8px_rgba(37,99,235,0.55),0_1px_2px_rgba(15,23,42,0.18)]",
          "ring-1 ring-inset ring-white/15",
          "transition-all duration-150 ease-out",
          "hover:shadow-[0_1px_0_rgba(255,255,255,0.3)_inset,0_12px_28px_-8px_rgba(37,99,235,0.7),0_1px_2px_rgba(15,23,42,0.2)]",
          "hover:brightness-[1.06] active:brightness-[0.96] active:translate-y-[0.5px]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "disabled:pointer-events-none disabled:opacity-60",
          className,
        )}
      >
        <Icon className={size === "lg" ? "h-5 w-5" : "h-4 w-4"} />
        <span>{label}</span>
      </button>
    );
  },
);
PrimaryAction.displayName = "PrimaryAction";
