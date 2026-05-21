import { createFileRoute } from "@tanstack/react-router";
import { DetailSkeleton } from "@/components/layout/DetailSkeleton";
import { NotFoundState } from "@/components/layout/NotFoundState";
import { useState } from "react";
import { Download, Send, FileCheck2, ThumbsUp, ThumbsDown, Pencil, Trash2 } from "lucide-react";
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
import { DriveSyncBadge } from "@/components/DriveSyncBadge";
import { FlowBar } from "@/components/flow/FlowBar";
import { PdfViewButton } from "@/components/pdf/PdfViewButton";
import { PdfPreviewCard } from "@/components/pdf/PdfPreviewCard";
import { PrintButton } from "@/components/pdf/PrintButton";
import { PrimaryAction } from "@/components/layout/PrimaryAction";
import { angebotFlow } from "@/lib/flow/flows";
import { EmailVersandDialog } from "@/components/email/EmailVersandDialog";
import { EmailVersandHistorie } from "@/components/email/EmailVersandHistorie";
import { formatEUR, formatDate } from "@/lib/format";
import { summenRechnung } from "@/lib/belege/summen";
import { DauerauftragVerwaltungCard } from "@/components/dauerauftrag/DauerauftragVerwaltungCard";
import { toast } from "sonner";
import { useNavigate, Link, Outlet, useMatches } from "@tanstack/react-router";
import { BelegLoeschenDialog } from "@/components/forms/BelegLoeschenDialog";

export const Route = createFileRoute("/angebote/$id")({ component: RouteShell });

function RouteShell() {
  const matches = useMatches();
  const isChild = matches.some((m) => m.routeId === "/angebote/$id/bearbeiten");
  if (isChild) return <Outlet />;
  return <Page />;
}

function Page() {
  const navigate = useNavigate();
  const { id } = Route.useParams();
  const { data: angebot, isLoading } = useAngebot(id);
  const a = angebot
    ? { ...angebot, positionen: angebot.positionen ?? [], rabattGesamt: angebot.rabattGesamt ?? 0 }
    : undefined;
  const { data: kunde } = useKunde(a?.kundeId ?? "");
  const inRechnung = useAngebotInRechnung(id);
  const updateAngebot = useUpdateAngebot(id);
  const pdf = useAngebotPdf(a);
  const { data: alleRechnungen = [] } = useRechnungen();
  const [emailOpen, setEmailOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  if (isLoading) return <DetailSkeleton variant="beleg" />;
  if (!a) {
    return (
      <NotFoundState
        title="Angebot nicht gefunden"
        description="Dieses Angebot wurde gelöscht oder die Adresse ist ungültig."
        backTo="/angebote"
        backLabel="Zurück zu den Angeboten"
      />
    );
  }

  const folgeRechnung = alleRechnungen.find((r) => r.quellAngebotId === a.id);
  const hatRechnung = !!folgeRechnung;
  const flow = angebotFlow(a, hatRechnung);
  const s = summenRechnung(a.positionen, a.rabattGesamt);

  const setStatus = (status: "angenommen" | "abgelehnt") => {
    updateAngebot.mutate(
      { status },
      {
        onSuccess: () =>
          toast.success(
            status === "angenommen" ? "Als angenommen markiert" : "Als abgelehnt markiert",
          ),
      },
    );
  };

  // Primary-Action je nach Status
  const renderPrimaryAction = () => {
    if (a.status === "entwurf") {
      return (
        <PrimaryAction
          icon={Send}
          label="Per E-Mail versenden"
          onClick={() => setEmailOpen(true)}
        />
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
            <PrintButton blob={pdf.blob} url={pdf.url} variant="outline" size="default" />
            {a.status === "entwurf" ? (
              <Button asChild variant="outline" className="rounded-lg">
                <Link to="/angebote/$id/bearbeiten" params={{ id: a.id }}>
                  <Pencil className="mr-1.5 h-4 w-4" /> PDF bearbeiten
                </Link>
              </Button>
            ) : (
              <Button
                variant="outline"
                className="rounded-lg disabled:opacity-50"
                disabled
                title="PDF kann nicht mehr bearbeitet werden — das Angebot wurde bereits versendet."
              >
                <Pencil className="mr-1.5 h-4 w-4" /> PDF bearbeiten
              </Button>
            )}
            <Button
              variant="outline"
              className="rounded-lg text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => setDelOpen(true)}
              title="Löschen"
            >
              <Trash2 className="mr-1.5 h-4 w-4" /> Löschen
            </Button>
            {renderPrimaryAction()}
          </>
        }
      />

      {/* Lebenszyklus-Balken */}
      <FlowBar steps={flow.steps} size="lg" />

      {/* Drive-Sync-Status: zeigt klar an, ob das Angebot-PDF in Google Drive ist */}
      <div className="flex items-center justify-end">
        <DriveSyncBadge belegArt="angebot" belegId={a.id} />
      </div>

      {/* Annahme-Banner: Angebot wurde angenommen, aber noch keine Rechnung */}
      {a.status === "angenommen" && !folgeRechnung && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-primary/40 bg-primary/5 p-5 shadow-sm">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">
              Angebot angenommen
            </p>
            <p className="mt-1 text-sm">
              Schick jetzt die Rechnung an{" "}
              <span className="font-semibold">
                {kunde?.firmenname ||
                  [kunde?.vorname, kunde?.nachname].filter(Boolean).join(" ") ||
                  "den Kunden"}
              </span>
              .
            </p>
          </div>
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
        </div>
      )}

      {/* Abgelehnt-Hinweis */}
      {a.status === "abgelehnt" && (
        <div className="rounded-2xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          Dieses Angebot wurde abgelehnt.
        </div>
      )}

      {/* Folge-Rechnung Hinweis */}
      {folgeRechnung && (
        <div className="flex items-center justify-between rounded-2xl border border-success/30 bg-success/5 p-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-success">In Rechnung umgewandelt</p>
            <p className="mt-0.5 text-sm">
              Rechnung <span className="font-mono font-semibold">{folgeRechnung.nummer}</span> wurde
              aus diesem Angebot erstellt.
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
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Beträge
            </p>
            <Row label="Netto" value={formatEUR(s.netto)} />
            <Row label={`MwSt ${a.steuersatz}%`} value={formatEUR(s.steuer)} />
            <div className="my-2 h-px bg-border" />
            <Row label="Brutto" value={formatEUR(s.brutto)} bold />
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Positionen
            </p>
            <ul className="space-y-3">
              {a.positionen.map((p, i) => {
                const istPauschal = p.modus === "pauschal";
                const beschreibung = p.beschreibung ?? "";
                const menge = p.menge ?? 0;
                const einzel = p.einzelpreisNetto ?? 0;
                const summe = istPauschal
                  ? (p.pauschalpreisNetto ?? 0) * (1 - (p.rabatt || 0) / 100)
                  : menge * einzel * (1 - (p.rabatt || 0) / 100);
                return (
                  <li key={p.id} className="text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 font-medium">
                        {i + 1}.{" "}
                        {istPauschal ? beschreibung.split("\n")[0] || "Pauschal" : beschreibung}
                      </span>
                      <span className="whitespace-nowrap font-semibold tabular-nums">
                        {formatEUR(summe)}
                      </span>
                    </div>
                    {istPauschal ? (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        Pauschal
                      </div>
                    ) : (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {menge} × {formatEUR(einzel)}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {a.optionen && (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Optionen
              </p>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li>{a.optionen.materialBereitgestellt ? "✓" : "✗"} Material bereitgestellt</li>
                <li>{a.optionen.standardAnschreiben ? "✓" : "✗"} Standard-Anschreiben</li>
              </ul>
            </div>
          )}

          {a.optionen?.wiederkehrend && (
            <DauerauftragVerwaltungCard
              rechnungId={folgeRechnung?.id}
              details={a.optionen.wiederkehrendDetails}
            />
          )}

          <EmailVersandHistorie belegId={a.id} belegTyp="angebot" />
        </div>

        <PdfPreviewCard
          title={`Angebot ${a.nummer}`}
          status={pdf.status}
          errorMessage={pdf.error}
          drive={a.drive}
          pdfUrl={pdf.url}
          pdfBlob={pdf.blob}
          viewButton={
            <PdfViewButton kind="angebot" beleg={a} variant="icon-text" label="PDF ansehen" />
          }
        />
      </div>

      <EmailVersandDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        kontext="angebot"
        kunde={kunde}
        angebot={a}
        pdfBlobUrl={pdf.url}
        pdfBlob={pdf.blob}
        pdfDateiname={`${a.nummer}.pdf`}
      />
      <BelegLoeschenDialog
        art="angebot"
        id={a.id}
        nummer={a.nummer}
        status={a.status}
        open={delOpen}
        onOpenChange={setDelOpen}
        onDeleted={(mode) => {
          if (mode === "hard") navigate({ to: "/angebote" });
        }}
      />
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
