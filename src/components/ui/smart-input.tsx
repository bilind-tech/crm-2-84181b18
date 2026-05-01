import * as React from "react";
import { Input } from "@/components/ui/input";

interface SmartInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> {
  /** Präfix, das beim ersten Mount automatisch eingesetzt wird. z.B. "+49 " oder "https://" */
  prefix: string;
  value: string;
  onChange: (value: string) => void;
}

/**
 * Input mit Smart-Prefill: setzt beim ersten Mount ein Präfix (z.B. "+49 " oder "https://")
 * in den Wert. Nutzer kann das Präfix jederzeit per Backspace löschen oder ersetzen.
 */
export const SmartInput = React.forwardRef<HTMLInputElement, SmartInputProps>(
  ({ prefix, value, onChange, onFocus, ...rest }, ref) => {
    const initRan = React.useRef(false);

    React.useEffect(() => {
      if (initRan.current) return;
      initRan.current = true;
      if (!value) onChange(prefix);
    }, [prefix, value, onChange]);

    function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
      // Cursor ans Ende, wenn nur das Präfix drinsteht
      if (e.target.value.trim() === prefix.trim()) {
        const len = e.target.value.length;
        requestAnimationFrame(() => {
          try {
            e.target.setSelectionRange(len, len);
          } catch {
            /* noop */
          }
        });
      }
      onFocus?.(e);
    }

    // Auto-inputMode: passende Mobil-Tastatur ableiten
    const autoInputMode: React.HTMLAttributes<HTMLInputElement>["inputMode"] =
      rest.inputMode ??
      (prefix.startsWith("+") ? "tel" : prefix.startsWith("http") ? "url" : undefined);
    const autoType = rest.type ?? (prefix.startsWith("+") ? "tel" : prefix.startsWith("http") ? "url" : undefined);

    return (
      <Input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={handleFocus}
        inputMode={autoInputMode}
        type={autoType}
        {...rest}
      />
    );
  }
);
SmartInput.displayName = "SmartInput";

/** Hilfsfunktion: behandelt einen Smart-Prefix-Wert als „leer", wenn nur das Präfix drinsteht. */
export function smartValue(value: string, prefix: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed === prefix.trim()) return undefined;
  return trimmed;
}
