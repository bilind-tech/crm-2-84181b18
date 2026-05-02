import { useEffect, useState } from "react";
import { Trash2, CheckCircle2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import { useUpdateDokument, useDeleteDokument, useKunden, useObjekte } from "@/hooks/useApi";
import type { Dokument, DokumentTyp } from "@/lib/api/types";
import { useConfirm } from "@/hooks/useConfirm";
import { fristStatus, FRIST_LABEL, fristBadgeClass } from "@/lib/dokument/frist";
import { DriveSyncRow } from "./DriveSyncBadge";
import { useDokumentBlobUrl } from "@/hooks/useDokumentBlobUrl";

interface Props {
  dokument: Dokument | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const TYPEN: { value: DokumentTyp; label: string }[] = [
  { value: "beleg", label: "Beleg / Quittung" },
  { value: "rechnung", label: "Rechnung" },
  { value: "angebot", label: "Angebot" },
  { value: "vertrag", label: "Vertrag" },
  { value: "protokoll", label: "Protokoll" },
  { value: "bild", label: "Bild" },
  { value: "sonstiges", label: "Sonstiges" },
];

export function DokumentBearbeitenDialog({ dokument, open, onOpenChange }: Props) {
  const update = useUpdateDokument();
  const del = useDeleteDokument();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const { data: kunden = [] } = useKunden();

  const [titel, setTitel] = useState("");
  const [beschreibung, setBeschreibung] = useState("");
  const [typ, setTyp] = useState<DokumentTyp>("sonstiges");
  const [dokumentdatum, setDokumentdatum] = useState("");
  const [faelligAm, setFaelligAm] = useState("");
  const [betrag, setBetrag] = useState("");
  const [steuerrelevant, setSteuerrelevant] = useState(false);
  const [erledigt, setErledigt] = useState(false);
  const [kundeId, setKundeId] = useState<string>("");
  const [objektId, setObjektId] = useState<string>("");
  const { data: objekte = [] } = useObjekte(kundeId || undefined);

  useEffect(() => {
    if (!dokument) return;
    setTitel(dokument.titel);
    setBeschreibung(dokument.beschreibung ?? "");
    setTyp(dokument.typ);
    setDokumentdatum(dokument.dokumentdatum ?? "");
    setFaelligAm(dokument.faelligAm ?? "");
    setBetrag(dokument.betrag != null ? String(dokument.betrag) : "");
    setSteuerrelevant(dokument.steuerrelevant);
    setErledigt(!!dokument.erledigtAm);
    setKundeId(dokument.kundeId ?? "");
    setObjektId(dokument.objektId ?? "");
  }, [dokument]);

  if (!dokument) return null;
  const status = fristStatus({ faelligAm: faelligAm || undefined, erledigtAm: erledigt ? new Date().toISOString() : undefined });

  async function speichern() {
    if (!dokument) return;
    try {
      await update.mutateAsync({
        id: dokument.id,
        titel: titel.trim() || dokument.dateiname,
        beschreibung: beschreibung.trim() || undefined,
        typ,
        dokumentdatum: dokumentdatum || undefined,
        faelligAm: faelligAm || undefined,
        betrag: betrag ? Number(betrag) : undefined,
        steuerrelevant,
        kundeId: kundeId || undefined,
        objektId: objektId || undefined,
        erledigtAm: erledigt
          ? dokument.erledigtAm ?? new Date().toISOString()
          : undefined,
      });
      toast.success("Dokument gespeichert");
      onOpenChange(false);
    } catch {
      toast.error("Speichern fehlgeschlagen");
    }
  }

  function loeschen() {
    if (!dokument) return;
    confirm(
      {
        title: "Dokument löschen?",
        description: `"${dokument.titel}" dauerhaft entfernen.`,
        variant: "destructive",
        confirmLabel: "Löschen",
      },
      async () => {
        await del.mutateAsync(dokument.id);
        toast.success("Dokument gelöscht");
        onOpenChange(false);
      },
    );
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto bg-background">
          <DialogHeader>
            <DialogTitle>Dokument bearbeiten</DialogTitle>
          </DialogHeader>

          <div className="-mt-1 mb-2">
            <DriveSyncRow dokument={dokument} />
          </div>

          <div className="space-y-4">
            {/* Vorschau */}
            <DokumentVorschau dokument={dokument} />

            {status !== "ohne" && (
              <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3 py-2">
                <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${fristBadgeClass(status)}`}>
                  {FRIST_LABEL[status]}
                </span>
                <button
                  type="button"
                  onClick={() => setErledigt((e) => !e)}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium hover:bg-muted"
                >
                  {erledigt ? (
                    <>
                      <RotateCcw className="h-3.5 w-3.5" />
                      Erledigt aufheben
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                      Als erledigt markieren
                    </>
                  )}
                </button>
              </div>
            )}

            <div>
              <Label htmlFor="d-titel">Titel</Label>
              <Input id="d-titel" value={titel} onChange={(e) => setTitel(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="d-typ">Typ</Label>
                <Select value={typ} onValueChange={(v) => setTyp(v as DokumentTyp)}>
                  <SelectTrigger id="d-typ"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPEN.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="d-datum">Dokumentdatum</Label>
                <Input id="d-datum" type="date" value={dokumentdatum} onChange={(e) => setDokumentdatum(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="d-frist">Frist (bis wann erledigen)</Label>
                <Input id="d-frist" type="date" value={faelligAm} onChange={(e) => setFaelligAm(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="d-betrag">Betrag (€)</Label>
                <Input
                  id="d-betrag"
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={betrag}
                  onChange={(e) => setBetrag(e.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="d-besch">Beschreibung</Label>
              <Textarea id="d-besch" rows={2} value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="d-kunde">Kunde</Label>
                <Select
                  value={kundeId || "_none"}
                  onValueChange={(v) => {
                    const next = v === "_none" ? "" : v;
                    setKundeId(next);
                    if (!next) setObjektId("");
                  }}
                >
                  <SelectTrigger id="d-kunde"><SelectValue placeholder="— Kein Kunde —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Kein Kunde —</SelectItem>
                    {kunden.map((k) => (
                      <SelectItem key={k.id} value={k.id}>
                        {k.firmenname || `${k.vorname ?? ""} ${k.nachname ?? ""}`.trim() || k.nummer}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="d-objekt">Objekt</Label>
                <Select
                  value={objektId || "_none"}
                  onValueChange={(v) => setObjektId(v === "_none" ? "" : v)}
                  disabled={!kundeId}
                >
                  <SelectTrigger id="d-objekt">
                    <SelectValue placeholder={kundeId ? "— Kein Objekt —" : "Erst Kunde wählen"} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">— Kein Objekt —</SelectItem>
                    {objekte.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={steuerrelevant}
                onChange={(e) => setSteuerrelevant(e.target.checked)}
                className="h-4 w-4"
              />
              <span>Steuerrelevant</span>
            </label>
          </div>

          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <Button variant="ghost" onClick={loeschen} className="text-destructive hover:bg-destructive/10 hover:text-destructive">
              <Trash2 className="mr-1.5 h-4 w-4" />
              Löschen
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Abbrechen</Button>
              <Button onClick={speichern} disabled={update.isPending}>Speichern</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </>
  );
}

function DokumentVorschau({ dokument }: { dokument: Dokument }) {
  const { url } = useDokumentBlobUrl(dokument);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-muted">
      {url && dokument.mimeType.startsWith("image/") ? (
        <img src={url} alt={dokument.titel} className="max-h-56 w-full object-contain" />
      ) : (
        <div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          {dokument.dateiname}
        </div>
      )}
    </div>
  );
}
