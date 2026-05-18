// Auto-Pop-up oben rechts: warnt beim App-Start vor überfälligen Rechnungen.
// Nicht persistent — bei jedem Reload erneut sichtbar, solange überfällig.

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, X } from "lucide-react";
import { useUeberfaelligeRechnungen } from "@/hooks/useUeberfaelligeRechnungen";
import { formatEUR, formatDate } from "@/lib/format";

export function UeberfaelligPopup() {
  const { count, gesamtOffen, rechnungen } = useUeberfaelligeRechnungen();
  const [geschlossen, setGeschlossen] = useState(false);
  const [sichtbar, setSichtbar] = useState(false);

  // Slide-in nach Mount, wenn es etwas zu zeigen gibt
  useEffect(() => {
    if (count > 0 && !geschlossen) {
      const t = setTimeout(() => setSichtbar(true), 50);
      return () => clearTimeout(t);
    }
    setSichtbar(false);
  }, [count, geschlossen]);

  if (count === 0 || geschlossen) return null;

  const anzeigen = rechnungen.slice(0, 3);
  const weitere = count - anzeigen.length;

  return (
    <div
      role="alert"
      aria-live="polite"
      className={`pointer-events-none fixed right-3 top-20 z-50 w-[calc(100vw-1.5rem)] max-w-sm transition-all duration-300 sm:right-4 ${
        sichtbar ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"
      }`}
    >
      <div className="pointer-events-auto overflow-hidden rounded-2xl border-2 border-destructive/40 bg-card shadow-lg">
        <div className="flex items-start gap-3 border-b border-border bg-destructive/5 px-4 py-3">
          <div className="grid h-9 w-9 shrink-0 place-content-center rounded-full bg-destructive/15 text-destructive">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">
              {count === 1 ? "1 überfällige Rechnung" : `${count} überfällige Rechnungen`}
            </p>
            <p className="text-xs text-muted-foreground">
              Offen: <span className="font-medium text-destructive">{formatEUR(gesamtOffen)}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => setGeschlossen(true)}
            aria-label="Schließen"
            className="grid h-7 w-7 shrink-0 place-content-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="divide-y divide-border">
          {anzeigen.map((r) => (
            <li key={r.id}>
              <Link
                to="/rechnungen/$id"
                params={{ id: r.id }}
                onClick={() => setGeschlossen(true)}
                className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm hover:bg-accent/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{r.kundeName}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    <span className="font-mono">{r.nummer}</span> · fällig{" "}
                    {formatDate(r.faelligkeitsdatum)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-destructive">{formatEUR(r.offen)}</p>
                  <p className="text-[11px] text-destructive/80">
                    +{r.tageUeber} {r.tageUeber === 1 ? "Tag" : "Tage"}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between gap-2 border-t border-border bg-muted/30 px-4 py-2.5">
          {weitere > 0 ? (
            <span className="text-xs text-muted-foreground">+ {weitere} weitere</span>
          ) : (
            <span />
          )}
          <Link
            to="/rechnungen"
            onClick={() => setGeschlossen(true)}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Alle ansehen →
          </Link>
        </div>
      </div>
    </div>
  );
}
