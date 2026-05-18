// MahnSektion: Timeline + Historie + Aktionen für eine einzelne Rechnung.
// Wird auf der Rechnungs-Detailseite gerendert, sobald die Rechnung mahnfähig ist.

import { useState } from "react";
import { Bell, Pause, Play, Gavel, Send, Clock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmailVersandDialog } from "@/components/email/EmailVersandDialog";
import {
  useInkassoMarkieren,
  useKunde,
  useMahnEinstellungen,
  useMahnungPausieren,
  useMahnungVersenden,
} from "@/hooks/useApi";
import { useRechnungPdf } from "@/hooks/useBelegPdf";
import { bestimmeMahnZustand, stufenLabel } from "@/lib/mahnung/regeln";
import { formatDate, formatEUR, todayISO, addDays } from "@/lib/format";
import type { Rechnung, MahnStufe } from "@/lib/api/types";
import { cn } from "@/lib/utils";

interface Props {
  rechnung: Rechnung;
}

export function MahnSektion({ rechnung }: Props) {
  const { data: einstellungen } = useMahnEinstellungen();
  const { data: kunde } = useKunde(rechnung.kundeId);
  const pdf = useRechnungPdf(rechnung);
  const pausieren = useMahnungPausieren(rechnung.id);
  const inkasso = useInkassoMarkieren(rechnung.id);
  const versenden = useMahnungVersenden(rechnung.id);

  const [confirmStufe, setConfirmStufe] = useState<MahnStufe | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [stufeFuerVersand, setStufeFuerVersand] = useState<MahnStufe>(1);
  const [pauseOpen, setPauseOpen] = useState(false);
  const [pauseDatum, setPauseDatum] = useState(addDays(todayISO(), 7));
  const [inkassoConfirm, setInkassoConfirm] = useState(false);

  if (!einstellungen) return null;

  const z = bestimmeMahnZustand(rechnung, einstellungen);
  if (!z.istMahnfaehig && (rechnung.mahnungen ?? []).length === 0) {
    return null;
  }

  const mahnungen = (rechnung.mahnungen ?? []).slice().sort((a, b) => a.stufe - b.stufe);
  const mahngebuehrenSumme = mahnungen.reduce((acc, m) => acc + m.gebuehr, 0);
  const gesamtForderung = z.offenEUR + mahngebuehrenSumme;

  const oeffneVersandConfirm = (stufe: MahnStufe) => setConfirmStufe(stufe);

  const oeffneEigeneVorlage = (stufe: MahnStufe) => {
    setStufeFuerVersand(stufe);
    setEmailOpen(true);
  };

  const handleConfirmVersand = () => {
    if (!confirmStufe) return;
    versenden.mutate(confirmStufe, {
      onSuccess: () => {
        toast.success(`${stufenLabel(confirmStufe, einstellungen)} versendet`);
        setConfirmStufe(null);
      },
      onError: () => toast.error("Versand fehlgeschlagen"),
    });
  };

  const handlePausieren = () => {
    pausieren.mutate(pauseDatum, {
      onSuccess: () => {
        toast.success(`Mahnverfahren bis ${formatDate(pauseDatum)} pausiert`);
        setPauseOpen(false);
      },
    });
  };

  const handlePauseAufheben = () => {
    pausieren.mutate(null, {
      onSuccess: () => toast.success("Pause aufgehoben"),
    });
  };

  const handleInkasso = () => {
    inkasso.mutate(undefined, {
      onSuccess: () => {
        toast.success("Rechnung für Inkasso markiert");
        setInkassoConfirm(false);
      },
    });
  };

  return (
    <>
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-warning" />
            <h2 className="text-base font-semibold">Mahnverfahren</h2>
          </div>
          {z.istPausiert && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
              <Pause className="h-3 w-3" /> Pausiert bis {formatDate(z.pausiertBis!)}
            </span>
          )}
          {rechnung.inkassoMarkiert && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
              <Gavel className="h-3 w-3" /> Inkasso übergeben
            </span>
          )}
        </div>

        {/* Stufen-Timeline */}
        <StufenTimeline
          aktuelleStufe={z.letzteVersendeteStufe}
          empfehlung={z.empfohleneStufe}
          istInkasso={!!rechnung.inkassoMarkiert}
        />

        {/* Statuszeile */}
        <div className="mt-4 grid gap-3 rounded-xl border border-border bg-muted/30 p-3 text-sm sm:grid-cols-3">
          <Stat
            label="Überfällig"
            value={
              z.tageUeberfaellig > 0
                ? `${z.tageUeberfaellig} Tage`
                : z.tageUeberfaellig === 0
                  ? "Heute fällig"
                  : `In ${Math.abs(z.tageUeberfaellig)} Tagen fällig`
            }
            tone={z.tageUeberfaellig > 14 ? "danger" : z.tageUeberfaellig > 0 ? "warning" : "muted"}
          />
          <Stat label="Offener Betrag" value={formatEUR(z.offenEUR)} />
          <Stat
            label="+ Mahngebühren"
            value={formatEUR(mahngebuehrenSumme)}
            sub={mahngebuehrenSumme > 0 ? `Gesamt ${formatEUR(gesamtForderung)}` : undefined}
          />
        </div>

        {/* Aktionen */}
        <div className="mt-4 flex flex-wrap gap-2">
          {z.empfohleneStufe && !z.istPausiert && (
            <Button onClick={() => oeffneVersandConfirm(z.empfohleneStufe!)} className="rounded-lg">
              <Send className="mr-1.5 h-4 w-4" />
              {stufenLabel(z.empfohleneStufe, einstellungen)} senden
            </Button>
          )}
          {/* Manueller Versand jeder Stufe (für Sonderfälle) */}
          {!z.istPausiert && !rechnung.inkassoMarkiert && (
            <ManuelleStufenAuswahl
              aktuell={z.letzteVersendeteStufe}
              vorgeschlagen={z.empfohleneStufe}
              einstellungen={einstellungen}
              onWaehlen={oeffneVersandConfirm}
            />
          )}
          {!z.istPausiert ? (
            <Button variant="outline" className="rounded-lg" onClick={() => setPauseOpen(true)}>
              <Pause className="mr-1.5 h-4 w-4" /> Pausieren
            </Button>
          ) : (
            <Button variant="outline" className="rounded-lg" onClick={handlePauseAufheben}>
              <Play className="mr-1.5 h-4 w-4" /> Pause aufheben
            </Button>
          )}
          {z.istInkassoReif && !rechnung.inkassoMarkiert && (
            <Button
              variant="outline"
              className="rounded-lg border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => setInkassoConfirm(true)}
            >
              <Gavel className="mr-1.5 h-4 w-4" /> An Inkasso übergeben
            </Button>
          )}
        </div>

        {/* Historie */}
        {mahnungen.length > 0 && (
          <div className="mt-5 border-t border-border pt-4">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Versendete Mahnungen
            </p>
            <ul className="space-y-2.5">
              {mahnungen.map((m) => (
                <li
                  key={m.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background p-3 text-sm"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="grid h-6 w-6 shrink-0 place-content-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {m.stufe}
                    </div>
                    <div>
                      <p className="font-medium">{stufenLabel(m.stufe, einstellungen)}</p>
                      <p className="text-xs text-muted-foreground">
                        Versendet {formatDate(m.versendetAm)} · neue Frist {formatDate(m.neueFrist)}
                      </p>
                    </div>
                  </div>
                  {m.gebuehr > 0 && (
                    <span className="shrink-0 text-xs font-medium text-muted-foreground">
                      Gebühr {formatEUR(m.gebuehr)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Confirm-Dialog: einfacher Direkt-Versand über Backend */}
      <Dialog open={confirmStufe !== null} onOpenChange={(o) => !o && setConfirmStufe(null)}>
        <DialogContent className="bg-background sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmStufe ? stufenLabel(confirmStufe, einstellungen) : "Mahnung"} senden?
            </DialogTitle>
            <DialogDescription>
              Die E-Mail wird automatisch mit der hinterlegten Vorlage versendet und die Mahnung in
              der Rechnung erfasst.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => {
                if (confirmStufe) {
                  oeffneEigeneVorlage(confirmStufe);
                  setConfirmStufe(null);
                }
              }}
            >
              Mit eigener Vorlage senden …
            </button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setConfirmStufe(null)}>
                Abbrechen
              </Button>
              <Button onClick={handleConfirmVersand} disabled={versenden.isPending}>
                <Send className="mr-1.5 h-4 w-4" />
                {versenden.isPending ? "Sende …" : "Senden"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Power-User-Pfad: E-Mail-Editor mit eigener Vorlage */}
      <EmailVersandDialog
        open={emailOpen}
        onOpenChange={setEmailOpen}
        kontext="mahnung"
        kunde={kunde ?? null}
        rechnung={rechnung}
        pdfBlobUrl={pdf.url}
        pdfDateiname={`${rechnung.nummer}.pdf`}
        mahnStufe={stufeFuerVersand}
      />

      {/* Pausieren-Dialog */}
      <Dialog open={pauseOpen} onOpenChange={setPauseOpen}>
        <DialogContent className="bg-background sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mahnverfahren pausieren</DialogTitle>
            <DialogDescription>
              Z.B. nach mündlicher Zahlungszusage. Bis zum gewählten Datum werden keine Mahnungen
              vorgeschlagen.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs font-medium">Pausieren bis</Label>
            <Input
              type="date"
              value={pauseDatum}
              min={todayISO()}
              onChange={(e) => setPauseDatum(e.target.value)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setPauseOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={handlePausieren} disabled={pausieren.isPending}>
              <Clock className="mr-1.5 h-4 w-4" /> Pausieren
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Inkasso-Bestätigung */}
      <Dialog open={inkassoConfirm} onOpenChange={setInkassoConfirm}>
        <DialogContent className="bg-background sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rechnung an Inkasso übergeben?</DialogTitle>
            <DialogDescription>
              Markiert die Rechnung als „an Inkasso übergeben". Die eigentliche Übergabe erfolgt
              manuell außerhalb des Systems.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setInkassoConfirm(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={handleInkasso}
              disabled={inkasso.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Gavel className="mr-1.5 h-4 w-4" /> Bestätigen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------- Sub-Komponenten ----------

function Stat({
  label,
  value,
  sub,
  tone = "muted",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "muted" | "warning" | "danger";
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          "mt-0.5 text-sm font-semibold",
          tone === "danger" && "text-destructive",
          tone === "warning" && "text-warning",
        )}
      >
        {value}
      </p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function StufenTimeline({
  aktuelleStufe,
  empfehlung,
  istInkasso,
}: {
  aktuelleStufe: 0 | MahnStufe;
  empfehlung: MahnStufe | null;
  istInkasso: boolean;
}) {
  const stufen: { num: MahnStufe; label: string }[] = [
    { num: 1, label: "Erinnerung" },
    { num: 2, label: "1. Mahnung" },
    { num: 3, label: "Letzte Mahnung" },
  ];
  return (
    <div className="flex items-center gap-0">
      {stufen.map((s, i) => {
        const versendet = aktuelleStufe >= s.num;
        const istEmpfehlung = empfehlung === s.num;
        const isLast = i === stufen.length - 1;
        const nextVersendet = !isLast && aktuelleStufe >= stufen[i + 1].num;
        return (
          <div key={s.num} className="flex flex-1 items-center">
            <div className="flex flex-1 flex-col items-center text-center">
              <div
                className={cn(
                  "grid h-9 w-9 place-content-center rounded-full border-2 text-sm font-semibold transition",
                  versendet
                    ? "border-success bg-success text-success-foreground"
                    : istEmpfehlung
                      ? "border-primary bg-primary/10 text-primary ring-4 ring-primary/15"
                      : "border-border bg-muted text-muted-foreground",
                )}
              >
                {versendet ? <CheckCircle2 className="h-4 w-4" /> : s.num}
              </div>
              <p
                className={cn(
                  "mt-1.5 text-[11px] font-medium",
                  versendet
                    ? "text-foreground"
                    : istEmpfehlung
                      ? "text-primary"
                      : "text-muted-foreground",
                )}
              >
                {s.label}
              </p>
              {istEmpfehlung && <p className="text-[10px] text-primary">empfohlen</p>}
            </div>
            {!isLast && (
              <div className={cn("h-0.5 flex-1", nextVersendet ? "bg-success" : "bg-border")} />
            )}
          </div>
        );
      })}
      <div className="flex flex-1 items-center">
        <div className={cn("h-0.5 flex-1", istInkasso ? "bg-destructive" : "bg-border")} />
        <div className="flex flex-col items-center">
          <div
            className={cn(
              "grid h-9 w-9 place-content-center rounded-full border-2",
              istInkasso
                ? "border-destructive bg-destructive text-destructive-foreground"
                : "border-border bg-muted text-muted-foreground",
            )}
          >
            <Gavel className="h-4 w-4" />
          </div>
          <p
            className={cn(
              "mt-1.5 text-[11px] font-medium",
              istInkasso ? "text-destructive" : "text-muted-foreground",
            )}
          >
            Inkasso
          </p>
        </div>
      </div>
    </div>
  );
}

function ManuelleStufenAuswahl({
  aktuell,
  vorgeschlagen,
  einstellungen,
  onWaehlen,
}: {
  aktuell: 0 | MahnStufe;
  vorgeschlagen: MahnStufe | null;
  einstellungen: { stufen: { stufe: MahnStufe; bezeichnung: string }[] };
  onWaehlen: (s: MahnStufe) => void;
}) {
  // Nur verfügbare Stufen ab "aktuell + 1" (außer der bereits vorgeschlagenen,
  // die schon prominent als Primary-Action erscheint).
  const verfuegbar = (einstellungen.stufen ?? []).filter(
    (s) => s.stufe > aktuell && s.stufe !== vorgeschlagen,
  );
  if (verfuegbar.length === 0) return null;
  return (
    <>
      {verfuegbar.map((s) => (
        <Button
          key={s.stufe}
          variant="outline"
          className="rounded-lg"
          onClick={() => onWaehlen(s.stufe)}
        >
          <Send className="mr-1.5 h-4 w-4" /> {s.bezeichnung}
        </Button>
      ))}
    </>
  );
}
