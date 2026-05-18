// Dashboard-Karte: priorisierte Aktionsliste mit Ein-Klick-CTAs.
// Zahlungserinnerungen werden clientseitig aus offenen Rechnungen + Versand-Historie
// berechnet (siehe useErinnerungen).

import { useMemo, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Mail, FileCheck2, MailWarning, ArrowRight, ChevronRight } from "lucide-react";
import {
  useAngebote,
  useRechnungen,
  useKunden,
  useKunde,
  useAngebotInRechnung,
} from "@/hooks/useApi";
import { useRechnungPdf } from "@/hooks/useBelegPdf";
import { EmailVersandDialog } from "@/components/email/EmailVersandDialog";
import { berechneNaechsteSchritte, type NaechsterSchritt } from "@/lib/dashboard/naechsteSchritte";
import { useErinnerungen } from "@/hooks/useErinnerungen";
import { useErinnerungVorlageId } from "@/lib/erinnerung/seedVorlage";
import { toast } from "sonner";
import type { Angebot, Kunde, Rechnung } from "@/lib/api/types";

const MAX_SICHTBAR = 5;

function kundeName(k?: Kunde): string {
  if (!k) return "Unbekannter Kunde";
  if (k.firmenname) return k.firmenname;
  const n = [k.vorname, k.nachname].filter(Boolean).join(" ");
  return n || k.nummer || "Unbekannter Kunde";
}

export function NaechsteSchritteCard() {
  const { data: angebote = [] } = useAngebote();
  const { data: rechnungen = [] } = useRechnungen();
  const { data: kunden = [] } = useKunden();
  const erinnerungen = useErinnerungen();

  const schritte = useMemo(() => {
    const basis = berechneNaechsteSchritte(angebote, rechnungen, kunden);
    const kundeMap = new Map(kunden.map((k) => [k.id, k]));
    const rechnungMap = new Map(rechnungen.map((r) => [r.id, r]));
    const erinnerungSchritte: NaechsterSchritt[] = [];
    for (const e of erinnerungen.eintraege) {
      const r = rechnungMap.get(e.id);
      if (!r) continue;
      const k = kundeMap.get(r.kundeId);
      erinnerungSchritte.push({
        id: `erinnerung-${r.id}`,
        typ: "erinnerung_senden",
        prioritaet: 95 + Math.min(e.tageUeber, 30),
        kundeId: r.kundeId,
        kundeName: kundeName(k),
        belegNummer: r.nummer,
        belegId: r.id,
        ueberschrift: `Zahlungserinnerung an ${kundeName(k)}`,
        detail: `${r.nummer} · ${e.tageUeber} Tage überfällig${e.anzahlBisher > 0 ? ` · ${e.anzahlBisher}. Erinnerung` : ""}`,
        ctaLabel: "Erinnerung senden",
      });
    }

    return [...erinnerungSchritte, ...basis].sort((a, b) => b.prioritaet - a.prioritaet);
  }, [angebote, rechnungen, kunden, erinnerungen]);

  const sichtbar = schritte.slice(0, MAX_SICHTBAR);

  const [emailRechnung, setEmailRechnung] = useState<Rechnung | null>(null);
  const [emailMitErinnerung, setEmailMitErinnerung] = useState(false);

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Nächste Schritte</h2>
        </div>
        {schritte.length > MAX_SICHTBAR && (
          <Link
            to="/aktivitaet"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            Alle anzeigen <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      {sichtbar.length === 0 ? (
        <div className="py-8 text-center">
          <CheckCircle2 className="mx-auto h-6 w-6 text-success" />
          <p className="mt-2 text-sm text-muted-foreground">
            Alles erledigt — keine offenen Aufgaben.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {sichtbar.map((s) => (
            <SchrittRow
              key={s.id}
              schritt={s}
              angebote={angebote}
              rechnungen={rechnungen}
              onSendRechnung={setEmailRechnung}
            />
          ))}
        </ul>
      )}

      {emailRechnung && (
        <RechnungEmailLauncher
          rechnung={emailRechnung}
          mitErinnerung={emailMitErinnerung}
          onClose={() => {
            setEmailRechnung(null);
            setEmailMitErinnerung(false);
          }}
        />
      )}
    </div>
  );
}

function SchrittRow({
  schritt,
  angebote,
  rechnungen,
  onSendRechnung,
}: {
  schritt: NaechsterSchritt;
  angebote: Angebot[];
  rechnungen: Rechnung[];
  onSendRechnung: (r: Rechnung) => void;
}) {
  const navigate = useNavigate();
  const angebot = angebote.find((a) => a.id === schritt.belegId);
  const rechnung = rechnungen.find((r) => r.id === schritt.belegId);
  const inRechnung = useAngebotInRechnung(angebot?.id ?? "");

  const Icon = ikonFuer(schritt.typ);
  const tone = toneFuer(schritt.typ);

  const handleCta = () => {
    switch (schritt.typ) {
      case "rechnung_erstellen":
        if (!angebot) return;
        inRechnung.mutate(undefined, {
          onSuccess: (r) => {
            toast.success(`Rechnung ${r.nummer} erstellt`);
            navigate({ to: "/rechnungen/$id", params: { id: r.id } });
          },
        });
        break;
      case "rechnung_versenden":
        if (rechnung) onSendRechnung(rechnung);
        break;
      case "erinnerung_senden":
        if (rechnung) onSendRechnung(rechnung, true);
        break;
      case "angebot_nachfassen":
        if (angebot) navigate({ to: "/angebote/$id", params: { id: angebot.id } });
        break;
    }
  };

  return (
    <li className="flex items-center gap-3 py-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tone.bg}`}>
        <Icon className={`h-4 w-4 ${tone.fg}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{schritt.ueberschrift}</p>
        <p className="truncate text-xs text-muted-foreground">
          <span className="font-mono">{schritt.belegNummer}</span> · {schritt.detail}
        </p>
      </div>
      <button
        type="button"
        onClick={handleCta}
        disabled={inRechnung.isPending}
        className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {schritt.ctaLabel}
        <ChevronRight className="h-3 w-3" />
      </button>
    </li>
  );
}

function ikonFuer(typ: NaechsterSchritt["typ"]) {
  switch (typ) {
    case "rechnung_erstellen":
      return FileCheck2;
    case "rechnung_versenden":
      return Mail;
    case "erinnerung_senden":
      return MailWarning;
    case "angebot_nachfassen":
      return Mail;
  }
}

function toneFuer(typ: NaechsterSchritt["typ"]) {
  switch (typ) {
    case "erinnerung_senden":
      return { bg: "bg-warning/10", fg: "text-warning" };
    case "rechnung_erstellen":
      return { bg: "bg-primary/10", fg: "text-primary" };
    case "rechnung_versenden":
      return { bg: "bg-success/10", fg: "text-success" };
    case "angebot_nachfassen":
      return { bg: "bg-warning/10", fg: "text-warning" };
  }
}

function RechnungEmailLauncher({
  rechnung,
  mitErinnerung,
  onClose,
}: {
  rechnung: Rechnung;
  mitErinnerung?: boolean;
  onClose: () => void;
}) {
  const { data: kunde } = useKunde(rechnung.kundeId);
  const pdf = useRechnungPdf(rechnung);
  const erinnerungVorlageId = useErinnerungVorlageId();
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
      vorbelegteVorlageId={mitErinnerung ? erinnerungVorlageId : undefined}
    />
  );
}
