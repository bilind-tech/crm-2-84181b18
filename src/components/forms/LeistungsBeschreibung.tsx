import { useEffect, useRef, type KeyboardEvent } from "react";
import { Bold, Italic, List, Underline } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  /** Mindesthöhe in Zeilen (Default 2). „Pauschal"-Modus nutzt 5+. */
  minRows?: number;
  /** Maxhöhe in Zeilen, danach wird gescrollt (Default 16). */
  maxRows?: number;
  /** Toolbar oben rechts mit B / I / U / Liste. Default false. */
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
 * - Optional eine kleine Toolbar mit B / I / U / Liste.
 *
 * Format-Marker (Markdown-kompatibel, vom Backend / PDF-Renderer interpretiert):
 *   **fett** · *kursiv* · __unterstrichen__
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

  /** Wickelt Markdown-Marker um die aktuelle Auswahl. Toggle bei bereits umschlossener Auswahl. */
  function wrapMarker(marker: string) {
    const el = ref.current;
    if (!el) return;
    const { selectionStart, selectionEnd, value: v } = el;
    const sel = v.slice(selectionStart, selectionEnd);
    const before = v.slice(0, selectionStart);
    const after = v.slice(selectionEnd);
    const len = marker.length;
    const innerLen = sel.length;
    const surrounded = innerLen > 0 && before.endsWith(marker) && after.startsWith(marker);
    if (surrounded) {
      const next = before.slice(0, -len) + sel + after.slice(len);
      onChange(next);
      requestAnimationFrame(() => {
        el.focus();
        const a = selectionStart - len;
        el.setSelectionRange(a, a + innerLen);
      });
      return;
    }
    const next = `${before}${marker}${sel}${marker}${after}`;
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      if (sel.length === 0) {
        const pos = selectionStart + marker.length;
        el.setSelectionRange(pos, pos);
      } else {
        el.setSelectionRange(selectionStart + marker.length, selectionEnd + marker.length);
      }
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl + B / I / U → Markdown-Wrap
    if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === "b") {
        e.preventDefault();
        wrapMarker("**");
        return;
      }
      if (k === "i") {
        e.preventDefault();
        wrapMarker("*");
        return;
      }
      if (k === "u") {
        e.preventDefault();
        wrapMarker("__");
        return;
      }
    }
    // Kein Auto-Bullet, kein Tab-Einrücken: Formatierung erfolgt manuell über
    // die Toolbar (B/I/U/Liste). Enter erzeugt nur einen normalen Zeilenumbruch.
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
          <ToolbarBtn onClick={() => wrapMarker("**")} title="Fett (Cmd/Ctrl+B)">
            <Bold className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => wrapMarker("*")} title="Kursiv (Cmd/Ctrl+I)">
            <Italic className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn onClick={() => wrapMarker("__")} title="Unterstrichen (Cmd/Ctrl+U)">
            <Underline className="h-3.5 w-3.5" />
          </ToolbarBtn>
          <ToolbarBtn onClick={bulletEinfuegen} title="Aufzählungs-Punkt einfügen">
            <List className="h-3.5 w-3.5" />
          </ToolbarBtn>
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
          withToolbar && "pr-32",
        )}
      />
    </div>
  );
}

function ToolbarBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background/95 text-muted-foreground shadow-sm hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  );
}
