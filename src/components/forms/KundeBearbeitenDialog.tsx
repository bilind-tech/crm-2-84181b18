// Dialog zum Bearbeiten eines bestehenden Kunden.
// Fokus: Stammdaten + Belegnummern (Kürzel + Monatszähler-Override).
// Bestehende Rechnungen/Angebote werden NICHT angefasst — nur der Zähler
// für den aktuellen Monat wird neu gesetzt, damit neue Belege ab der
// gewünschten Nummer weitergehen.

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useKundenZaehler, useUpdateKunde, useKuerzelFrei } from "@/hooks/useApi";
import type { Kunde } from "@/lib/api/types";
import { VertraegeTab } from "@/components/kunden/VertraegeTab";

function sanitizeKuerzel(v: string): string {
  return v
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

interface Props {
  kunde: Kunde;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function KundeBearbeitenDialog({ kunde, open, onOpenChange }: Props) {
  const update = useUpdateKunde(kunde.id);
  const zaehlerQ = useKundenZaehler(kunde.id);

  const [firmenname, setFirmenname] = useState(kunde.firmenname ?? "");
  const [vorname, setVorname] = useState(kunde.vorname ?? "");
  const [nachname, setNachname] = useState(kunde.nachname ?? "");
  const [email, setEmail] = useState(kunde.email ?? "");
  const [telefon, setTelefon] = useState(kunde.telefon ?? "");
  const [strasse, setStrasse] = useState(kunde.strasse ?? "");
  const [plz, setPlz] = useState(kunde.plz ?? "");
  const [ort, setOrt] = useState(kunde.ort ?? "");
  const [status, setStatus] = useState<Kunde["status"]>(kunde.status);
  const [notizen, setNotizen] = useState(kunde.notizen ?? "");

  const [kuerzel, setKuerzel] = useState(kunde.kuerzel ?? "");
  const [startNummer, setStartNummer] = useState<number>(1);
  const [startNummerTouched, setStartNummerTouched] = useState(false);
  const [notizenTouched, setNotizenTouched] = useState(false);

  // Initial: aktueller nächster Stand aus Backend übernehmen
  useEffect(() => {
    if (!startNummerTouched && zaehlerQ.data?.naechsterStart) {
      setStartNummer(zaehlerQ.data.naechsterStart);
    }
  }, [zaehlerQ.data, startNummerTouched]);

  // Reset bei (Re-)Öffnen
  useEffect(() => {
    if (open) {
      setFirmenname(kunde.firmenname ?? "");
      setVorname(kunde.vorname ?? "");
      setNachname(kunde.nachname ?? "");
      setEmail(kunde.email ?? "");
      setTelefon(kunde.telefon ?? "");
      setStrasse(kunde.strasse ?? "");
      setPlz(kunde.plz ?? "");
      setOrt(kunde.ort ?? "");
      setStatus(kunde.status);
      // `kunde.notizen` kann in der Detail-API als Notiz-Objekt-Liste kommen.
      // Das Freitext-Feld nur befüllen, wenn wir tatsächlich einen String haben,
      // sonst leer initialisieren und beim Speichern nicht mitschicken.
      setNotizen(typeof kunde.notizen === "string" ? kunde.notizen : "");
      setNotizenTouched(false);
      setKuerzel(kunde.kuerzel ?? "");
      setStartNummerTouched(false);
    }
  }, [open, kunde]);

  const periodeLabel = useMemo(() => {
    const d = new Date();
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getFullYear()).slice(-2)}`;
  }, []);

  const vorschau = useMemo(() => {
    const k = kuerzel.trim().toUpperCase();
    if (!k) return "";
    const d = new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const nn = String(Math.max(1, startNummer || 1)).padStart(2, "0");
    return `${k}${mm}${yy}/${nn}`;
  }, [kuerzel, startNummer]);

  const kuerzelFreiQ = useKuerzelFrei(kuerzel, kunde.id);
  const kuerzelKonflikt =
    kuerzel.length >= 1 && kuerzelFreiQ.data && !kuerzelFreiQ.data.frei
      ? kuerzelFreiQ.data.kunde
      : null;

  async function speichern() {
    if (kunde.typ === "firma" && !firmenname.trim()) {
      toast.error("Firmenname ist erforderlich");
      return;
    }
    if (kunde.typ === "privat" && !nachname.trim()) {
      toast.error("Nachname ist erforderlich");
      return;
    }
    if (kuerzelKonflikt) {
      toast.error(
        `Kürzel «${kuerzel}» ist bereits vergeben (${kuerzelKonflikt.nummer} • ${kuerzelKonflikt.name}).`,
      );
      return;
    }
    try {
      await update.mutateAsync({
        firmenname: firmenname || undefined,
        vorname: vorname || undefined,
        nachname: nachname || undefined,
        email: email || undefined,
        telefon: telefon || undefined,
        strasse: strasse || undefined,
        plz: plz || undefined,
        ort: ort || undefined,
        status,
        // Nur senden, wenn der User wirklich getippt hat. Verhindert, dass
        // ein versehentlich initialisiertes Objekt zurück ans Backend geht.
        notizen: notizenTouched ? notizen : undefined,
        kuerzel: kuerzel || undefined,
        startZaehlerAktuellerMonat:
          kuerzel && startNummerTouched ? Math.max(1, startNummer || 1) : undefined,
      });
      toast.success("Kunde aktualisiert");
      onOpenChange(false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Speichern fehlgeschlagen";
      toast.error(msg);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-background w-[calc(100vw-1rem)] max-w-2xl max-h-[90vh] overflow-y-auto overflow-x-hidden">
        <DialogHeader>
          <DialogTitle>Kunde bearbeiten</DialogTitle>
          <DialogDescription>Stammdaten und Belegnummern dieses Kunden anpassen.</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="stamm" className="mt-2">
          <TabsList className="no-scrollbar flex h-10 w-full justify-start gap-1 overflow-x-auto rounded-full bg-muted p-1">
            <TabsTrigger value="stamm" className="shrink-0 rounded-full px-3 sm:px-5">
              Stammdaten
            </TabsTrigger>
            <TabsTrigger value="beleg" className="shrink-0 rounded-full px-3 sm:px-5">
              Belegnummern
            </TabsTrigger>
            <TabsTrigger value="vertraege" className="shrink-0 rounded-full px-3 sm:px-5">
              Verträge
            </TabsTrigger>
          </TabsList>

          <TabsContent value="stamm" className="mt-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Status">
                <Select value={status} onValueChange={(v) => setStatus(v as Kunde["status"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="aktiv">Aktiv</SelectItem>
                    <SelectItem value="interessent">Interessent</SelectItem>
                    <SelectItem value="inaktiv">Inaktiv</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {kunde.typ === "firma" ? (
                <Field label="Firmenname *">
                  <Input value={firmenname} onChange={(e) => setFirmenname(e.target.value)} />
                </Field>
              ) : (
                <Field label="Nachname *">
                  <Input value={nachname} onChange={(e) => setNachname(e.target.value)} />
                </Field>
              )}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Vorname">
                <Input value={vorname} onChange={(e) => setVorname(e.target.value)} />
              </Field>
              {kunde.typ === "firma" && (
                <Field label="Nachname">
                  <Input value={nachname} onChange={(e) => setNachname(e.target.value)} />
                </Field>
              )}
              <Field label="E-Mail">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Telefon">
                <Input value={telefon} onChange={(e) => setTelefon(e.target.value)} />
              </Field>
            </div>
            <Field label="Straße">
              <Input value={strasse} onChange={(e) => setStrasse(e.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="PLZ">
                <Input value={plz} onChange={(e) => setPlz(e.target.value)} />
              </Field>
              <Field label="Ort" className="sm:col-span-2">
                <Input value={ort} onChange={(e) => setOrt(e.target.value)} />
              </Field>
            </div>
            <Field label="Notizen">
              <Textarea
                rows={4}
                value={notizen}
                onChange={(e) => {
                  setNotizen(e.target.value);
                  setNotizenTouched(true);
                }}
              />
            </Field>
          </TabsContent>

          <TabsContent value="beleg" className="mt-5 space-y-5">
            <Field label="Kürzel">
              <Input
                value={kuerzel}
                onChange={(e) => setKuerzel(sanitizeKuerzel(e.target.value))}
                placeholder="z. B. GFU"
                className="font-mono uppercase tracking-wider w-40"
              />
              <div className="mt-1.5 min-h-[1.25rem] text-xs">
                {kuerzel.length >= 1 && kuerzelFreiQ.isFetching ? (
                  <span className="text-muted-foreground">Prüfe Verfügbarkeit…</span>
                ) : kuerzelKonflikt ? (
                  <span className="text-destructive">
                    ✗ Bereits vergeben an {kuerzelKonflikt.nummer} • {kuerzelKonflikt.name}
                  </span>
                ) : kuerzel.length >= 1 && kuerzelFreiQ.data?.frei ? (
                  <span className="text-emerald-600 dark:text-emerald-400">✓ Kürzel frei</span>
                ) : (
                  <span className="text-muted-foreground">
                    Beliebige Länge (A–Z, 0–9). Wird allen neuen Belegen dieses Kunden vorangestellt.
                  </span>
                )}
              </div>
            </Field>

            <Field label={`Nächste Nummer im Monat ${periodeLabel}`}>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={9999}
                value={startNummer}
                onChange={(e) => {
                  setStartNummer(Math.max(1, Number(e.target.value) || 1));
                  setStartNummerTouched(true);
                }}
                disabled={!kuerzel || zaehlerQ.isLoading}
                className="font-mono w-32"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Aktueller Stand laut System:{" "}
                <span className="font-mono font-semibold text-foreground">
                  {zaehlerQ.data?.naechsterStart ?? "…"}
                </span>
                . Ändert nur den Zähler für diesen Monat — bestehende Belege bleiben unverändert.
              </p>
            </Field>

            {vorschau && (
              <div className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
                Vorschau nächster Beleg:{" "}
                <span className="font-mono font-semibold text-foreground">{vorschau}</span>
              </div>
            )}
          </TabsContent>

          <TabsContent value="vertraege" className="mt-5">
            <VertraegeTab kundeId={kunde.id} />
          </TabsContent>
        </Tabs>

        <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button onClick={speichern} disabled={update.isPending || !!kuerzelKonflikt}>
            {update.isPending ? "Speichere…" : "Speichern"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
