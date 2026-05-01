import { createFileRoute, Link } from "@tanstack/react-router";
import { DetailSkeleton } from "@/components/layout/DetailSkeleton";
import { NotFoundState } from "@/components/layout/NotFoundState";
import { useState } from "react";
import { Download, Send, CheckCircle2, Wallet, Trash2 } from "lucide-react";
import { useRechnung, useAngebot, useKunde, useDeleteZahlung } from "@/hooks/useApi";
import { useConfirm } from "@/hooks/useConfirm";
import { useRechnungPdf } from "@/hooks/useBelegPdf";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/PageHeader";
import { FlowBar } from "@/components/flow/FlowBar";
import { rechnungFlow } from "@/lib/flow/flows";
import { ZahlungErfassenDialog } from "@/components/forms/ZahlungErfassenDialog";
import { EmailVersandDialog } from "@/components/email/EmailVersandDialog";
import { EmailVersandHistorie } from "@/components/email/EmailVersandHistorie";
import { MahnSektion } from "@/components/mahnung/MahnSektion";
import { PdfViewButton } from "@/components/pdf/PdfViewButton";
import { PdfPreviewCard } from "@/components/pdf/PdfPreviewCard";
import { formatEUR, formatDate } from "@/lib/format";
import { summenRechnung } from "@/lib/mock/backend";
import { formatWiederkehrend } from "@/components/forms/DauerauftragKonfig";
import { Repeat } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/rechnungen/$id")({ component: Page });

function Page() {
  const { id } = Route.useParams();
  const { data: r, isLoading } = useRechnung(id);
  const pdf = useRechnungPdf(r);
  const [zahlungOpen, setZahlungOpen] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const { data: quellAngebot } = useAngebot(r?.quellAngebotId ?? "");
  const { data: kunde } = useKunde(r?.kundeId ?? "");
  const delZahlung = useDeleteZahlung(id);
  const { confirm, dialog: confirmDialog } = useConfirm();

  if (isLoading) return <DetailSkeleton variant="beleg" />;
  if (!r) {
    return (
      <NotFoundState
        title="Rechnung nicht gefunden"
        description="Diese Rechnung wurde gelöscht oder die Adresse ist ungültig."
        backTo="/rechnungen"
        backLabel="Zurück zu den Rechnungen"
      />
    );
  }
  const s = summenRechnung(r.positionen, r.rabattGesamt);
  const bezahlt = r.zahlungen.reduce((a, z) => a + z.betrag, 0);
  const offen = Math.max(0, s.brutto - bezahlt);
  const flow = rechnungFlow(r);

  const renderPrimaryAction = () => {
    if (r.status === "entwurf") {
      return (
        <Button className="rounded-lg" onClick={() => setEmailOpen(true)}>
          <Send className="mr-1.5 h-4 w-4" /> Per E-Mail versenden
        </Button>
      );
    }
    if (r.status === "versendet" || r.status === "ueberfaellig" || r.status === "teilbezahlt") {
      // weiter unten regulärer Zahlung-Button — zusätzlich Mahnung anbieten bei überfällig
      // (rendern wir später in einem zweiten Block, hier primär)
    }
    if (r.status === "bezahlt") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-sm font-medium text-success">
          <CheckCircle2 className="h-4 w-4" /> Vollständig bezahlt
        </span>
      );
    }
    if (offen > 0) {
      return (
        <Button className="rounded-lg" onClick={() => setZahlungOpen(true)}>
          <Wallet className="mr-1.5 h-4 w-4" /> Zahlung erfassen
        </Button>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={r.titel}
        subtitle={
          <>
            <span className="font-mono">{r.nummer}</span> ·{" "}
            {formatDate(r.rechnungsdatum)} · fällig{" "}
            {formatDate(r.faelligkeitsdatum)} · Status{" "}
            <span className="capitalize">{r.status}</span>
          </>
        }
        actions={
          <>
            {pdf.url && (
              <Button asChild variant="outline" className="rounded-lg">
                <a href={pdf.url} download={`${r.nummer}.pdf`}>
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

      {/* Quell-Angebot-Hinweis */}
      {quellAngebot && (
        <div className="flex items-center justify-between rounded-2xl border border-border bg-muted/30 p-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Erstellt aus Angebot</p>
            <p className="mt-0.5 text-sm">
              <span className="font-mono font-semibold">{quellAngebot.nummer}</span> · {quellAngebot.titel}
            </p>
          </div>
          <Link
            to="/angebote/$id"
            params={{ id: quellAngebot.id }}
            className="text-sm font-medium text-primary hover:underline"
          >
            Zum Angebot →
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Beträge</p>
            <Row label="Netto" value={formatEUR(s.netto)} />
            <Row label={`MwSt ${r.steuersatz}%`} value={formatEUR(s.steuer)} />
            <div className="my-2 h-px bg-border" />
            <Row label="Brutto" value={formatEUR(s.brutto)} />
            <Row label="Bezahlt" value={formatEUR(bezahlt)} />
            <Row label="Offen" value={formatEUR(offen)} bold />
            {offen > 0 && (
              <Button
                size="sm"
                className="mt-3 w-full rounded-lg"
                onClick={() => setZahlungOpen(true)}
              >
                <Wallet className="mr-1.5 h-4 w-4" /> Zahlung erfassen
              </Button>
            )}
          </div>

          {r.zahlungen.length > 0 && (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Zahlungen</p>
              <ul className="space-y-2 text-sm">
                {r.zahlungen.map((z) => {
                  return (
                    <li key={z.id} className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-muted-foreground">
                            {formatDate(z.datum)} · {z.methode}
                          </span>
                        </div>
                        {z.notiz && (
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground/80">
                            {z.notiz}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <span className="font-medium">{formatEUR(z.betrag)}</span>
                        <button
                          type="button"
                          aria-label="Zahlung löschen"
                          className="rounded-md p-1 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                          onClick={() =>
                            confirm(
                              {
                                title: "Zahlung löschen?",
                                description: `${formatEUR(z.betrag)} vom ${formatDate(z.datum)} entfernen. Der Rechnungsstatus wird neu berechnet.`,
                                variant: "destructive",
                                confirmLabel: "Löschen",
                              },
                              () =>
                                delZahlung.mutate(z.id, {
                                  onSuccess: () => toast.success("Zahlung gelöscht"),
                                  onError: (e) =>
                                    toast.error(e instanceof Error ? e.message : "Löschen fehlgeschlagen"),
                                }),
                            )
                          }
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Positionen</p>
            <ul className="space-y-3">
              {r.positionen.map((p, i) => {
                const istPauschal = p.modus === "pauschal";
                const summe = istPauschal
                  ? (p.pauschalpreisNetto ?? 0) * (1 - (p.rabatt || 0) / 100)
                  : p.menge * p.einzelpreisNetto * (1 - (p.rabatt || 0) / 100);
                return (
                  <li key={p.id} className="text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 font-medium">
                        {i + 1}. {istPauschal ? (p.beschreibung.split("\n")[0] || "Pauschal") : p.beschreibung}
                      </span>
                      <span className="whitespace-nowrap font-semibold tabular-nums">
                        {formatEUR(summe)}
                      </span>
                    </div>
                    {istPauschal ? (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {p.ausfuehrung && <span>{p.ausfuehrung} · </span>}
                        Pauschal
                      </div>
                    ) : (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {p.menge} × {formatEUR(p.einzelpreisNetto)}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {r.optionen && (
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Optionen</p>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                <li>{r.optionen.materialBereitgestellt ? "✓" : "✗"} Material bereitgestellt</li>
                <li>{r.optionen.standardAnschreiben ? "✓" : "✗"} Standard-Anschreiben</li>
                {r.optionen.wiederkehrend && (
                  <li className="flex items-center gap-1.5 text-foreground">
                    <Repeat className="h-3.5 w-3.5 text-primary" />
                    Dauerauftrag
                    {r.optionen.wiederkehrendDetails && (
                      <span className="text-muted-foreground">
                        · {formatWiederkehrend(r.optionen.wiederkehrendDetails)}
                      </span>
                    )}
                  </li>
                )}
              </ul>
            </div>
          )}

          <EmailVersandHistorie belegId={r.id} belegTyp="rechnung" />
        </div>

        <PdfPreviewCard
          title={`Rechnung ${r.nummer}`}
          status={pdf.status}
          errorMessage={pdf.error}
          drive={r.drive}
          viewButton={<PdfViewButton kind="rechnung" beleg={r} variant="icon-text" label="PDF ansehen" />}
        />
      </div>

      {/* Mahnverfahren — eigene Sektion unter den Beträgen */}
      <MahnSektion rechnung={r} />

      <ZahlungErfassenDialog open={zahlungOpen} onOpenChange={setZahlungOpen} rechnung={r} />
      <EmailVersandDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        kontext="rechnung"
        kunde={kunde}
        rechnung={r}
        pdfBlobUrl={pdf.url}
        pdfDateiname={`${r.nummer}.pdf`}
      />
      {confirmDialog}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={bold ? "text-lg font-semibold text-primary" : "font-medium"}>{value}</span>
    </div>
  );
}
