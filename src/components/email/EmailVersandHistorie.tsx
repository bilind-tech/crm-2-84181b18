// Kompakter Versand-Status für Beleg-Detailseiten.
// Zeigt nur EINE Zeile (letzter Stand), nicht jede Mail einzeln.
// Volle Historie bleibt in der zentralen Aktivitäts-/Versand-Liste.

import { CheckCircle2, XCircle, Clock, Loader2, Mail } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useEmailVersand } from "@/hooks/useApi";
import { formatDateTime } from "@/lib/format";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { EmailVersand } from "@/lib/api/types";

interface Props {
  belegId: string;
  belegTyp: "angebot" | "rechnung";
}

export function EmailVersandHistorie({ belegId, belegTyp }: Props) {
  const { data: rawListe = [], isLoading } = useEmailVersand({ belegId, belegTyp });
  // Defensiv: auch client-seitig strikt auf den aktuellen Beleg filtern,
  // damit eine versehentlich ungefilterte Backend-Antwort niemals einen
  // fremden „gesendet"-Eintrag auf dieser Seite anzeigt.
  const liste = rawListe.filter(
    (v) => v.belegId === belegId && v.belegArt === belegTyp,
  );
  const qc = useQueryClient();
  const [retrying, setRetrying] = useState(false);

  const Card = ({ children }: { children: React.ReactNode }) => (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        E-Mail-Versand
      </p>
      {children}
    </div>
  );

  if (isLoading) {
    return <Card><p className="text-sm text-muted-foreground">Lade …</p></Card>;
  }

  if (liste.length === 0) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Mail className="h-4 w-4" />
          Noch nicht versendet
        </div>
      </Card>
    );
  }

  // Liste kommt vom Backend sortiert DESC nach erstellt_am.
  const letzterVersuch = liste[0];
  const letzterErfolg = liste.find((v) => v.status === "gesendet");

  // Wird gerade gesendet?
  if (letzterVersuch.status === "sending" || letzterVersuch.status === "pending") {
    return (
      <Card>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Wird gesendet …
        </span>
      </Card>
    );
  }

  // Letzter Versuch fehlgeschlagen, kein neuerer Erfolg → Fehler-Zustand.
  const erfolgIstNeuer =
    letzterErfolg && letzterErfolg.id === letzterVersuch.id;

  if (letzterVersuch.status === "manuell" && !erfolgIstNeuer) {
    return (
      <Card>
        <div className="flex flex-col gap-2">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-1 text-xs font-medium text-destructive">
            <XCircle className="h-3.5 w-3.5" /> Versand fehlgeschlagen
          </span>
          {letzterVersuch.fehlerText && (
            <p className="line-clamp-2 text-xs text-muted-foreground">
              {letzterVersuch.fehlerText}
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={retrying}
            className="w-fit"
            onClick={async () => {
              setRetrying(true);
              try {
                await api.post<EmailVersand>(`/email/versand/${letzterVersuch.id}/retry`);
                qc.invalidateQueries({ queryKey: ["email", "versand"] });
                toast.success("Versand erneut gestartet");
              } catch (e) {
                toast.error((e as Error).message ?? "Versand fehlgeschlagen");
              } finally {
                setRetrying(false);
              }
            }}
          >
            {retrying ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Erneut senden
          </Button>
        </div>
      </Card>
    );
  }

  // Erfolg.
  if (letzterErfolg) {
    return (
      <Card>
        <div className="flex flex-col gap-1">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-success/30 bg-success/10 px-2.5 py-1 text-xs font-medium text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> E-Mail versendet
          </span>
          {letzterErfolg.versendetAm && (
            <p className="text-xs text-muted-foreground">
              am {formatDateTime(letzterErfolg.versendetAm)}
            </p>
          )}
        </div>
      </Card>
    );
  }

  // Fallback (sollte nicht eintreten).
  return (
    <Card>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
        <Clock className="h-3.5 w-3.5" /> Unbekannter Status
      </span>
    </Card>
  );
}
