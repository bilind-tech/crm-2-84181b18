import * as React from "react";
import { Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface DateInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "onChange"
> {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Schlicht gestylte Variante des nativen Date-Inputs:
 * - Größere Höhe (h-12) und gut lesbare Schrift
 * - Eigenes Kalender-Icon rechts (lucide), nativer Indicator versteckt
 * - Klick auf Icon (oder Feld) öffnet den Picker via showPicker()
 */
export const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  ({ value, onChange, className, ...props }, ref) => {
    const innerRef = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement);

    function openPicker() {
      const el = innerRef.current;
      if (!el) return;
      // showPicker() wird von Safari 16+/Chrome/Firefox unterstützt
      type WithPicker = HTMLInputElement & { showPicker?: () => void };
      const withPicker = el as WithPicker;
      try {
        if (typeof withPicker.showPicker === "function") {
          withPicker.showPicker();
        } else {
          el.focus();
          el.click();
        }
      } catch {
        el.focus();
      }
    }

    return (
      <div className="relative">
        <Input
          ref={innerRef}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          {...props}
          className={cn(
            "h-12 pr-11 text-base font-medium tabular-nums",
            // Nativen Calendar-Indicator ausblenden (Safari/Chrome/Edge)
            "[&::-webkit-calendar-picker-indicator]:opacity-0",
            "[&::-webkit-calendar-picker-indicator]:absolute",
            "[&::-webkit-calendar-picker-indicator]:right-0",
            "[&::-webkit-calendar-picker-indicator]:w-11",
            "[&::-webkit-calendar-picker-indicator]:h-full",
            "[&::-webkit-calendar-picker-indicator]:cursor-pointer",
            className,
          )}
        />
        <button
          type="button"
          onClick={openPicker}
          aria-label="Datum auswählen"
          tabIndex={-1}
          className="pointer-events-none absolute right-1.5 top-1/2 inline-flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground"
        >
          <Calendar className="h-4 w-4" />
        </button>
      </div>
    );
  },
);
DateInput.displayName = "DateInput";
