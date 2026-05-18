// Dezenter Vorschlag oben rechts: zeigt erinnerungsreife Rechnungen.
// Versand ist KEIN Auto-Versand — User klickt aktiv "Erinnern", wir öffnen
// dann den normalen EmailVersandDialog mit der Vorlage "rechnung.erinnerung".

import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, X, Mail } from "lucide-react";
import { useErinnerungsKandidaten } from "@/hooks/useErinnerungsKandidaten";
import {
  useEmailVorlagen,
  useKunde,
  useRechnungen,
} from "@/hooks/useApi";
import { useRechnungPdf } from "@/hooks/useBelegPdf";
import { EmailVersandDialog } from "@/components/email/EmailVersandDialog";
import { formatEUR, formatDate } from "@/lib/format";
import type { Rechnung } from "@/lib/api/types";

export function ErinnerungsPopup() {
  const { count, gesamtOffen, kandidaten } = useErinnerungsKandidaten();
  const [geschlossen, setGeschlossen] = useState(false);
  const [sichtbar, setSichtbar] = useState(false);
  const [emailRechnung, setEmailRechnung] = useState<Rechnung | null>(null);

  const { data: rechnungen = [] } = useRechnungen();

  useEffect(() => {
    if (count > 0 && !geschlossen) {
      const t = setTimeout(() => setSichtbar(true), 50);
      return () => clearTimeout(t);
    }
    setSichtbar(false);
  }, [count, geschlossen]);

  if (count === 0 || geschlossen) {
    return emailRechnung ? (
      <RechnungEmailLauncher
        rechnung={emailRechnung}
        onClose={() => setEmailRechnung(null)}
      />
    ) : null;
  }

  const anzeigen = kandidaten.slice(0, 3);
  const weitere = count - anzeigen.length;

  return (
    <>
      <div
        role="status"
        aria-live="polite"
        className={`pointer-events-none fixed right-3 top-20 z-50 w-[calc(100vw-1.5rem)] max-w-sm transition-all duration-300 sm:right-4 ${
          sichtbar ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0"
        }`}
      >
        <div className="pointer-events-auto overflow-hidden rounded-2xl border border-warning/40 bg-card shadow-lg">
          <div className="flex items-start gap-3 border-b border-border bg-warning/5 px-4 py-3">
            <div className="grid h-9 w-9 shrink-0 place-content-center rounded-full bg-warning/15 text-warning">
              <Bell className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">
                {count === 1
                  ? "1 Zahlungserinnerung empfohlen"
                  : `${count} Zahlungserinnerungen empfohlen`}
              </p>
              <p className="text-xs text-muted-foreground">
                Offen: <span className="font-medium text-foreground">{formatEUR(gesamtOffen)}</span>
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
            {anzeigen.map((k) => {
              const r = rechnungen.find((x) => x.id === k.id);
              return (
                <li key={k.id} className="flex items-center gap-2 px-3 py-2.5">
                  <Link
                    to="/rechnungen/$id"
                    params={{ id: k.id }}
                    className="min-w-0 flex-1 hover:text-primary"
                  >
                    <p className="truncate text-sm font-medium text-foreground">{k.kundeName}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="font-mono">{k.nummer}</span> · fällig{" "}
                      {formatDate(k.faelligkeitsdatum)}
                    </p>
                  </Link>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-semibold text-warning">{formatEUR(k.offen)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      +{k.tageUeber} {k.tageUeber === 1 ? "Tag" : "Tage"}
                    </p>
                  </div>
                  {r && (
                    <button
                      type="button"
                      onClick={() => setEmailRechnung(r)}
                      className="ml-1 inline-flex h-8 shrink-0 items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 text-xs font-medium text-primary hover:bg-primary/10"
                      title="Erinnerung per E-Mail senden"
                    >
                      <Mail className="h-3.5 w-3.5" />
                      Erinnern
                    </button>
                  )}
                </li>
              );
            })}
          </ul>

          {weitere > 0 && (
            <div className="border-t border-border bg-muted/30 px-4 py-2 text-right">
              <Link
                to="/rechnungen"
                onClick={() => setGeschlossen(true)}
                className="text-xs font-semibold text-primary hover:underline"
              >
                + {weitere} weitere ansehen →
              </Link>
            </div>
          )}
        </div>
      </div>

      {emailRechnung && (
        <RechnungEmailLauncher
          rechnung={emailRechnung}
          onClose={() => setEmailRechnung(null)}
        />
      )}
    </>
  );
}

function RechnungEmailLauncher({
  rechnung,
  onClose,
}: {
  rechnung: Rechnung;
  onClose: () => void;
}) {
  const { data: kunde } = useKunde(rechnung.kundeId);
  const { data: vorlagen = [] } = useEmailVorlagen();
  const pdf = useRechnungPdf(rechnung);

  const vorbelegteVorlageId = useMemo(() => {
    const erin = vorlagen.find((v) => v.seedKey === "rechnung.erinnerung");
    return erin?.id;
  }, [vorlagen]);

  return (
    <EmailVersandDialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
      kontext="rechnung"
      kunde={kunde}
      rechnung={rechnung}
      pdfBlobUrl={pdf.url}
      pdfDateiname={`${rechnung.nummer}.pdf`}
      pdfStatus={pdf.status}
      vorbelegteVorlageId={vorbelegteVorlageId}
    />
  );
}