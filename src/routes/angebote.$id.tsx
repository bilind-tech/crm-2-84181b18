import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Download, Send, FileCheck2, ThumbsUp, ThumbsDown } from "lucide-react";
import {
  useAngebot,
  useAngebotInRechnung,
  useUpdateAngebot,
  useRechnungen,
  useKunde,
} from "@/hooks/useApi";
import { useAngebotPdf } from "@/hooks/useBelegPdf";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { FlowBar } from "@/components/flow/FlowBar";
import { angebotFlow } from "@/lib/flow/flows";
import { EmailVersandDialog } from "@/components/email/EmailVersandDialog";
import { EmailVersandHistorie } from "@/components/email/EmailVersandHistorie";
import { formatEUR, formatDate } from "@/lib/format";
import { summenRechnung } from "@/lib/mock/backend";
import { toast } from "sonner";
import { useNavigate, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/angebote/$id")({ component: Page });

function Page() {
  const navigate = useNavigate();
  const { id } = Route.useParams();
  const { data: a } = useAngebot(id);
  const { data: kunde } = useKunde(a?.kundeId ?? "");
  const inRechnung = useAngebotInRechnung(id);
  const updateAngebot = useUpdateAngebot(id);
  const pdf = useAngebotPdf(a);
  const { data: alleRechnungen = [] } = useRechnungen();
  const [emailOpen, setEmailOpen] = useState(false);

  if (!a) return <p className="text-sm text-muted-foreground">Lade …</p>;

  const folgeRechnung = alleRechnungen.find((r) => r.quellAngebotId === a.id);
  const hatRechnung = !!folgeRechnung;
  const flow = angebotFlow(a, hatRechnung);
  const s = summenRechnung(a.positionen, a.rabattGesamt);

  const setStatus = (status: "angenommen" | "abgelehnt") => {
    updateAngebot.mutate(
      { status },
      {
        onSuccess: () =>
          toast.success(status === "angenommen" ? "Als angenommen markiert" : "Als abgelehnt markiert"),
      }
    );
  };

  // Primary-Action je nach Status
  const renderPrimaryAction = () => {
    if (a.status === "entwurf") {
      return (
        <Button className="rounded-lg" onClick={() => setEmailOpen(true)}>
          <Send className="mr-1.5 h-4 w-4" /> Per E-Mail versenden
        </Button>
      );
    }
    if (a.status === "versendet") {
      return (
        <div className="flex flex-wrap gap-2">
          <Button
            className="rounded-lg bg-success text-success-foreground hover:bg-success/90"
            onClick={() => setStatus("angenommen")}
          >
            <ThumbsUp className="mr-1.5 h-4 w-4" /> Angenommen
          </Button>
          <Button variant="outline" className="rounded-lg" onClick={() => setStatus("abgelehnt")}>
            <ThumbsDown className="mr-1.5 h-4 w-4" /> Abgelehnt
          </Button>
        </div>
      );
    }
    if (a.status === "angenommen" && !hatRechnung) {
      return (
        <Button
          className="rounded-lg"
          onClick={() =>
            inRechnung.mutate(undefined, {
              onSuccess: (r) => {
                toast.success(`Rechnung ${r.nummer} erstellt`);
                navigate({ to: "/rechnungen/$id", params: { id: r.id } });
              },
            })
          }
        >
          <FileCheck2 className="mr-1.5 h-4 w-4" /> In Rechnung umwandeln
        </Button>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumb={[
          { label: "Angebote", to: "/angebote" },
          { label: a.nummer },
        ]}
        title={a.titel}
        subtitle={
          <>
            <span className="font-mono">{a.nummer}</span> · Status{" "}
            <span className="capitalize">{a.status}</span>
            {a.gueltigBis ? ` · gültig bis ${formatDate(a.gueltigBis)}` : ""}
          </>
        }
        actions={
          <>
            {pdf.url && (
              <Button asChild variant="outline" className="rounded-lg">
                <a href={pdf.url} download={`${a.nummer}.pdf`}>
                  <Download className="mr-1.5 h-4 w-4" /> PDF
                </a>
              </Button>
            )}
            {renderPrimaryAction()}
          </>
        }
      />

      {/* Lebenszyklus-Balken */}
      <FlowBar steps={flow.steps} size="lg" />

      {/* Folge-Rechnung Hinweis */}
      {folgeRechnung && (
        <div className="flex items-center justify-between rounded-2xl border border-success/30 bg-success/5 p-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-success">In Rechnung umgewandelt</p>
            <p className="mt-0.5 text-sm">
              Rechnung <span className="font-mono font-semibold">{folgeRechnung.nummer}</span> wurde aus
              diesem Angebot erstellt.
            </p>
          </div>
          <Link
            to="/rechnungen/$id"
            params={{ id: folgeRechnung.id }}
            className="text-sm font-medium text-primary hover:underline"
          >
            Zur Rechnung →
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Beträge</p>
            <Row label="Netto" value={formatEUR(s.netto)} />
            <Row label={`MwSt ${a.steuersatz}%`} value={formatEUR(s.steuer)} />
            <div className="my-2 h-px bg-border" />
            <Row label="Brutto" value={formatEUR(s.brutto)} bold />
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Positionen</p>
            <ul className="space-y-2">
              {a.positionen.map((p, i) => (
                <li key={p.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    {i + 1}. {p.beschreibung}
                  </span>
                  <span className="font-medium whitespace-nowrap">
                    {p.menge} × {formatEUR(p.einzelpreisNetto)}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {a.optionen && (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Optionen</p>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li>{a.optionen.materialBereitgestellt ? "✓" : "✗"} Material bereitgestellt</li>
                <li>{a.optionen.standardAnschreiben ? "✓" : "✗"} Standard-Anschreiben</li>
                <li>{a.optionen.wiederkehrend ? "✓" : "✗"} Wiederkehrend</li>
              </ul>
            </div>
          )}

          <EmailVersandHistorie belegId={a.id} belegTyp="angebot" />
        </div>

        <div className="overflow-hidden rounded-2xl border border-border bg-muted/40 shadow-sm">
          {pdf.status === "loading" && (
            <div className="grid h-[800px] place-content-center text-sm text-muted-foreground">PDF wird erzeugt …</div>
          )}
          {pdf.status === "error" && (
            <div className="grid h-[800px] place-content-center px-6 text-center text-sm text-destructive">
              PDF konnte nicht erzeugt werden.<br />{pdf.error}
            </div>
          )}
          {pdf.url && (
            <iframe title="Angebot PDF" src={pdf.url} className="block h-[900px] w-full border-0" />
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 text-sm ${bold ? "text-base" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? "text-lg font-semibold text-primary" : "font-medium"}>{value}</span>
    </div>
  );
}
