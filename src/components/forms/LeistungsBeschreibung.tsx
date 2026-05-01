import { useEffect, useRef, type KeyboardEvent } from "react";
import { List } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Mindesthöhe in Zeilen (Default 2). „Pauschal"-Modus nutzt 5+. */
  minRows?: number;
  /** Maxhöhe in Zeilen, danach wird gescrollt (Default 16). */
  maxRows?: number;
  /** Toolbar oben rechts mit „Liste"-Button (Bullet einfügen). Default false. */
  withToolbar?: boolean;
  className?: string;
  id?: string;
}

const LINE_HEIGHT_PX = 22; // entspricht text-sm + leading-relaxed

/**
 * Auto-Resize-Textarea für Leistungsbeschreibungen.
 * - Wächst automatisch mit dem Inhalt zwischen min/max Zeilen.
 * - Enter auf einer Zeile, die mit „• " beginnt, fügt automatisch ein neues „• " ein.
 * - Tab rückt mit zwei Leerzeichen ein (kein Fokus-Sprung).
 * - Optional eine kleine Toolbar mit „Liste"-Button.
 */
export function LeistungsBeschreibung({
  value,
  onChange,
  placeholder,
  minRows = 2,
  maxRows = 16,
  withToolbar = false,
  className,
  id,
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Auto-Resize
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    const scroll = el.scrollHeight;
    const min = minRows * LINE_HEIGHT_PX + 16; // + Padding
    const max = maxRows * LINE_HEIGHT_PX + 16;
    const next = Math.max(min, Math.min(max, scroll + 2));
    el.style.height = `${next}px`;
    el.style.overflowY = scroll > max ? "auto" : "hidden";
  }, [value, minRows, maxRows]);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    const { selectionStart, selectionEnd, value: v } = el;

    // Enter → Bullet fortsetzen, wenn aktuelle Zeile mit "• " beginnt
    if (e.key === "Enter" && !e.shiftKey && selectionStart === selectionEnd) {
      const lineStart = v.lastIndexOf("\n", selectionStart - 1) + 1;
      const currentLine = v.slice(lineStart, selectionStart);
      const bulletMatch = currentLine.match(/^(\s*)([•\-*])\s+/);
      if (bulletMatch) {
        const rest = currentLine.slice(bulletMatch[0].length).trim();
        if (rest === "") {
          // Leerer Bullet → Bullet entfernen, normalen Umbruch erzeugen
          e.preventDefault();
          const before = v.slice(0, lineStart);
          const after = v.slice(selectionStart);
          const next = `${before}\n${after}`;
          onChange(next);
          requestAnimationFrame(() => {
            const pos = lineStart + 1;
            el.setSelectionRange(pos, pos);
          });
          return;
        }
        // Neuer Bullet
        e.preventDefault();
        const insert = `\n${bulletMatch[1]}• `;
        const before = v.slice(0, selectionStart);
        const after = v.slice(selectionStart);
        const next = `${before}${insert}${after}`;
        onChange(next);
        requestAnimationFrame(() => {
          const pos = selectionStart + insert.length;
          el.setSelectionRange(pos, pos);
        });
      }
      return;
    }

    // Tab → 2 Leerzeichen einfügen
    if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const before = v.slice(0, selectionStart);
      const after = v.slice(selectionEnd);
      const next = `${before}  ${after}`;
      onChange(next);
      requestAnimationFrame(() => {
        const pos = selectionStart + 2;
        el.setSelectionRange(pos, pos);
      });
    }
  }

  function bulletEinfuegen() {
    const el = ref.current;
    if (!el) return;
    const { selectionStart, value: v } = el;
    const lineStart = v.lastIndexOf("\n", selectionStart - 1) + 1;
    const currentLine = v.slice(lineStart, selectionStart);
    const before = v.slice(0, lineStart);
    const after = v.slice(lineStart);
    if (currentLine.trimStart().startsWith("• ")) return;
    const next = `${before}• ${after}`;
    onChange(next);
    requestAnimationFrame(() => {
      const pos = selectionStart + 2;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className={cn("relative", className)}>
      {withToolbar && (
        <div className="pointer-events-none absolute right-2 top-2 z-10 flex gap-1">
          <button
            type="button"
            onClick={bulletEinfuegen}
            className="pointer-events-auto inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background/95 px-2 text-[11px] font-medium text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
            title="Aufzählungs-Punkt einfügen (Enter setzt fort)"
          >
            <List className="h-3.5 w-3.5" />
            Liste
          </button>
        </div>
      )}
      <textarea
        ref={ref}
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={minRows}
        className={cn(
          "block w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed shadow-sm",
          "placeholder:text-muted-foreground",
          "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          withToolbar && "pr-20",
        )}
      />
    </div>
  );
}
