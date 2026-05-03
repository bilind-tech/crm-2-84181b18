// Detail-Ansicht eines Protokolls: Meta links, Live-PDF-Vorschau rechts.
// Aktionen: Drucken, PDF herunterladen, Bearbeiten, Abschließen, Löschen.
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Download, FileCheck2, Loader2, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { NotFoundState } from "@/components/layout/NotFoundState";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PdfPreviewCard } from "@/components/pdf/PdfPreviewCard";
import { PrintButton } from "@/components/pdf/PrintButton";
import {
  useAbschliessenProtokoll, useDeleteProtokoll, useFirmendaten, useKunde, useObjekte, useProtokoll,
} from "@/hooks/useApi";
import { useProtokollPdf } from "@/hooks/useProtokollPdf";
import { downloadBlob, protokollDateiname, protokollTitel } from "@/lib/pdf/werkzeugePdf";
import { blobToDataUrl } from "@/lib/dokumente/blobToDataUrl";

export const Route = createFileRoute("/protokolle/$id")({ component: Page });

function Page() {
  const router = useRouter();
  const { id } = Route.useParams();
  const protokollQ = useProtokoll(id);
  const p = protokollQ.data;
  const kundeQ = useKunde(p?.kundeId ?? "");
  const objekteQ = useObjekte(p?.kundeId);
  const firmaQ = useFirmendaten();
  const objekt = p?.objektId ? objekteQ.data?.find((o) => o.id === p.objektId) : undefined;
  const pdf = useProtokollPdf(p, kundeQ.data, objekt, firmaQ.data);

  const abschliessen = useAbschliessenProtokoll(id);
  const del = useDeleteProtokoll();
  const [busy, setBusy] = useState(false);

  if (protokollQ.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />Lade …
      </div>
    );
  }
  if (!p) {
    return (
      <NotFoundState
        title="Protokoll nicht gefunden"
        description="Dieses Protokoll wurde gelöscht oder die Adresse ist ungültig."
        backTo="/protokolle"
        backLabel="Zurück zu Protokollen"
      />
    );
  }

  const dateiname = protokollDateiname(p, kundeQ.data);
  const kundenName = kundeQ.data
    ? (kundeQ.data.firmenname || [kundeQ.data.vorname, kundeQ.data.nachname].filter(Boolean).join(" "))
    : "—";

  const onDownload = () => {
    if (!pdf.blob) { toast.error("PDF noch nicht bereit"); return; }
    downloadBlob(pdf.blob, dateiname);
  };

  const onAbschliessen = async () => {
    if (!p.kundeId) { toast.error("Bitte zuerst einen Kunden auswählen."); return; }
    if (!pdf.blob) { toast.error("PDF wird noch erzeugt …"); return; }
    setBusy(true);
    try {
      const url = await blobToDataUrl(pdf.blob);
      await abschliessen.mutateAsync({
        dateiname,
        mimeType: "application/pdf",
        groesseBytes: pdf.blob.size,
        url,
      });
      toast.success("Abgeschlossen — in Dokumenten gespeichert");
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "Konnte nicht abschließen");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    try {
      await del.mutateAsync(id);
      toast.success("Protokoll gelöscht");
      void router.navigate({ to: "/protokolle" });
    } catch {
      toast.error("Löschen fehlgeschlagen");
    }
  };

  const istEntwurf = p.status !== "abgeschlossen";

  return (
    <div className="space-y-6 pb-12">
      <PageHeader
        title={protokollTitel(p)}
        subtitle={
          <>
            <span className="font-mono">{p.nummer}</span> · {p.datum} · {p.uhrzeit} ·{" "}
            <span className="capitalize">{p.status}</span>
          </>
        }
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/protokolle"><ArrowLeft className="mr-1.5 h-4 w-4" />Zurück</Link>
            </Button>
            <Button variant="outline" onClick={onDownload} disabled={!pdf.blob} className="rounded-lg">
              <Download className="mr-1.5 h-4 w-4" />PDF
            </Button>
            <PrintButton url={pdf.url} variant="outline" size="default" />
            {istEntwurf && (
              <Button variant="outline" asChild className="rounded-lg">
                <Link to="/protokolle/$id/bearbeiten" params={{ id }}>
                  <Pencil className="mr-1.5 h-4 w-4" />Bearbeiten
                </Link>
              </Button>
            )}
            {istEntwurf && (
              <Button onClick={onAbschliessen} disabled={busy || !p.kundeId || !pdf.blob} className="rounded-lg">
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-4 w-4" />}
                Abschließen
              </Button>
            )}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" className="text-destructive">
                  <Trash2 className="mr-1.5 h-4 w-4" />Löschen
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Protokoll löschen?</AlertDialogTitle>
                  <AlertDialogDescription>Dies kann nicht rückgängig gemacht werden. Verknüpfte Dokumente bleiben erhalten.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete}>Löschen</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <InfoCard label="Kunde" value={kundenName} />
          <InfoCard label="Objekt" value={objekt?.name ?? "—"} />
          <InfoCard label="Datum / Uhrzeit" value={`${p.datum} · ${p.uhrzeit}`} />
          {p.kind === "uebergabe" ? (
            <>
              <InfoCard label="Art" value={
                p.art === "abnahme" ? "Abnahme" : p.art === "beides" ? "Übergabe & Abnahme" : "Übergabe"
              } />
              <InfoCard label="Leistungsumfang" value={p.leistungsumfang || "—"} />
              {p.bemerkungen && <InfoCard label="Bemerkungen" value={p.bemerkungen} />}
            </>
          ) : (
            <>
              <InfoCard label="Richtung" value={p.richtung === "ausgabe" ? "Ausgabe" : "Rücknahme"} />
              <InfoCard label="Schlüssel" value={`${(p.schluessel ?? []).length} Position(en)`} />
              {p.pfandEur != null && p.pfandEur > 0 && (
                <InfoCard label="Pfand" value={`${p.pfandEur.toLocaleString("de-DE", { minimumFractionDigits: 2 })} €`} />
              )}
            </>
          )}
          {!istEntwurf && p.dokumentId && (
            <div className="rounded-2xl border bg-card p-4 text-sm">
              <div className="flex items-start gap-3">
                <FileCheck2 className="mt-0.5 h-4 w-4 text-primary" />
                <div>
                  <p className="font-medium">Im Bereich „Dokumente" archiviert</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Diese Version ist dauerhaft gespeichert und{" "}
                    <Link to="/dokumente" className="text-primary underline">in Dokumenten einsehbar</Link>.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <PdfPreviewCard
          title={`${protokollTitel(p)} ${p.nummer}`}
          status={pdf.status}
          errorMessage={pdf.error}
          pdfUrl={pdf.url}
          fileName={dateiname}
          viewButton={
            <Button variant="outline" size="sm" onClick={onDownload} disabled={!pdf.blob}>
              <Download className="mr-1.5 h-4 w-4" />PDF
            </Button>
          }
        />
      </div>
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 whitespace-pre-wrap text-sm font-medium">{value}</p>
    </div>
  );
}
