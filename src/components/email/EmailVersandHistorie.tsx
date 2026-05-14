// Liste aller versendeten E-Mails zu einem Beleg.
// Kompakt — wird auf Angebot-/Rechnung-Detailseiten eingebettet.

import { CheckCircle2, XCircle, Clock, Loader2, Paperclip } from "lucide-react";
import { useEmailVersand } from "@/hooks/useApi";
import { formatDateTime } from "@/lib/format";

interface Props {
  belegId: string;
  belegTyp: "angebot" | "rechnung";
}

export function EmailVersandHistorie({ belegId, belegTyp }: Props) {
  const { data: liste = [], isLoading } = useEmailVersand({ belegId, belegTyp });

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <p className="text-sm text-muted-foreground">Lade Versand-Historie …</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        E-Mail-Versand ({liste.length})
      </p>
      {liste.length === 0 ? (
        <p className="text-sm text-muted-foreground">Noch keine E-Mails versendet.</p>
      ) : (
        <ul className="divide-y divide-border">
          {liste.map((v) => (
            <li key={v.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{v.betreff}</p>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    An: {(v.empfaenger ?? []).join(", ") || "—"}
                  </p>
                  <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span>{v.versendetAm ? formatDateTime(v.versendetAm) : "—"}</span>
                    {(v.anhaenge?.length ?? 0) > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <Paperclip className="h-3 w-3" />
                        {v.anhaenge!.length}
                      </span>
                    )}
                  </div>
                  {v.fehlerGrund && (
                    <p className="mt-1 text-xs text-destructive">{v.fehlerGrund}</p>
                  )}
                </div>
                <StatusBadge status={v.status} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: "queued" | "sending" | "sent" | "failed" }) {
  if (status === "sent") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-success/30 bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success">
        <CheckCircle2 className="h-3 w-3" /> Gesendet
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
        <XCircle className="h-3 w-3" /> Fehler
      </span>
    );
  }
  if (status === "sending") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
        <Loader2 className="h-3 w-3 animate-spin" /> Wird gesendet
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <Clock className="h-3 w-3" /> Wartend
    </span>
  );
}
