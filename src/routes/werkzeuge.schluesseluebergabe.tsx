// Schlüsselübergabe — Frontend-Formular + PDF-Erzeugung.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileDown, Loader2, Mail, Plus, Trash2 } from "lucide-react";
import { PrintButton } from "@/components/pdf/PrintButton";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { KundenObjektPicker, kundenAnzeige } from "@/components/werkzeuge/KundenObjektPicker";
import { useFirmendaten, useCreateDokument } from "@/hooks/useApi";
import type { Kunde, Objekt } from "@/lib/api/types";
import {
  downloadBlob,
  generateSchluesseluebergabePdf,
  nextProtokollNummer,
  safeFilename,
  type SchluesselRichtung,
  type SchluesselZeile,
} from "@/lib/pdf/werkzeugePdf";
import { blobToDataUrl } from "@/lib/dokumente/blobToDataUrl";

export const Route = createFileRoute("/werkzeuge/schluesseluebergabe")({
  component: Page,
});

function leereZeile(): SchluesselZeile {
  return { bezeichnung: "", anzahl: 1, schluesselNr: "", bemerkung: "" };
}

function Page() {
  const firmaQ = useFirmendaten();
  const createDokument = useCreateDokument();
  const [kunde, setKunde] = useState<Kunde | undefined>();
  const [objekt, setObjekt] = useState<Objekt | undefined>();
  const [richtung, setRichtung] = useState<SchluesselRichtung>("ausgabe");
  const today = new Date();
  const [datum, setDatum] = useState(today.toISOString().slice(0, 10));
  const [uhrzeit, setUhrzeit] = useState(
    `${String(today.getHours()).padStart(2, "0")}:${String(today.getMinutes()).padStart(2, "0")}`,
  );
  const [zeilen, setZeilen] = useState<SchluesselZeile[]>([leereZeile()]);
  const [pfand, setPfand] = useState<string>("");
  const [vertreterAg, setVertreterAg] = useState("");
  const [vertreterAn, setVertreterAn] = useState("");
  const [bestaetigt, setBestaetigt] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (kunde && !vertreterAg) {
      setVertreterAg(
        [kunde.vorname, kunde.nachname].filter(Boolean).join(" ") ||
          kunde.firmenname ||
          "",
      );
    }
  }, [kunde, vertreterAg]);
  useEffect(() => {
    if (firmaQ.data && !vertreterAn) {
      setVertreterAn(firmaQ.data.geschaeftsfuehrer ?? firmaQ.data.firmenname);
    }
  }, [firmaQ.data, vertreterAn]);

  const empfaengerEmail = useMemo(() => kunde?.email ?? "", [kunde]);

  const updateZeile = (i: number, patch: Partial<SchluesselZeile>) => {
    setZeilen((zs) => zs.map((z, idx) => (idx === i ? { ...z, ...patch } : z)));
  };

  const buildBlob = async (): Promise<Blob> => {
    if (!kunde) throw new Error("Bitte zuerst einen Kunden auswählen.");
    const cleanZeilen = zeilen.filter((z) => z.bezeichnung.trim() !== "");
    if (cleanZeilen.length === 0) throw new Error("Bitte mindestens einen Schlüssel eintragen.");
    const pfandNum = pfand ? parseFloat(pfand.replace(",", ".")) : undefined;
    return generateSchluesseluebergabePdf({
      richtung,
      datum,
      uhrzeit,
      schluessel: cleanZeilen,
      pfandEur: Number.isFinite(pfandNum) ? pfandNum : undefined,
      vertreterAuftraggeber: vertreterAg,
      vertreterAuftragnehmer: vertreterAn,
      bestaetigt,
      kunde,
      objekt,
      firma: firmaQ.data,
    });
  };

  const handleErstellen = async (downloadOnly: boolean) => {
    if (!kunde) {
      toast.error("Bitte zuerst einen Kunden auswählen.");
      return;
    }
    const cleanZeilen = zeilen.filter((z) => z.bezeichnung.trim() !== "");
    if (cleanZeilen.length === 0) {
      toast.error("Bitte mindestens einen Schlüssel eintragen.");
      return;
    }
    setBusy(true);
    try {
      const blob = await buildBlob();
      const fname = `Schluesseluebergabe_${safeFilename(kundenAnzeige(kunde))}_${datum}.pdf`;
      downloadBlob(blob, fname);
      toast.success("PDF wurde heruntergeladen");
      try {
        const richtungLabel = richtung === "ausgabe" ? "Ausgabe" : "Rücknahme";
        await createDokument.mutateAsync({
          titel: `Schlüsselübergabe (${richtungLabel}) – ${kundenAnzeige(kunde)} – ${datum}`,
          typ: "protokoll",
          kundeId: kunde.id,
          objektId: objekt?.id,
          dateiname: fname,
          mimeType: "application/pdf",
          groesseBytes: blob.size,
          url: await blobToDataUrl(blob),
          dokumentdatum: datum,
          steuerrelevant: false,
          hochgeladenAm: new Date().toISOString(),
          quelle: "upload",
        });
        toast.success('Im Bereich „Dokumente" gespeichert');
      } catch (e) {
        console.error(e);
        toast.warning('Konnte nicht in „Dokumente" gespeichert werden — PDF ist heruntergeladen.');
      }
      if (!downloadOnly) {
        toast.message("E-Mail-Versand", {
          description:
            empfaengerEmail
              ? `Bitte das soeben heruntergeladene PDF im E-Mail-Dialog anhängen. Empfänger vorbelegt: ${empfaengerEmail}`
              : "Beim Kunden ist keine E-Mail hinterlegt — bitte manuell ergänzen.",
        });
      }
    } catch (e) {
      console.error(e);
      toast.error(e instanceof Error ? e.message : "PDF konnte nicht erzeugt werden.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        title="Schlüsselübergabe"
        subtitle="Schlüssel-Quittung mit Liste und Pfand als PDF."
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/werkzeuge">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Zurück
            </Link>
          </Button>
        }
      />

      <div className="space-y-6 rounded-2xl border bg-card p-5 shadow-sm">
        <KundenObjektPicker
          kundeId={kunde?.id}
          objektId={objekt?.id}
          onKundeChange={(k) => {
            setKunde(k);
            setObjekt(undefined);
          }}
          onObjektChange={setObjekt}
        />

        <div className="space-y-2">
          <Label>Richtung</Label>
          <RadioGroup
            value={richtung}
            onValueChange={(v) => setRichtung(v as SchluesselRichtung)}
            className="flex flex-wrap gap-4"
          >
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="ausgabe" /> Ausgabe an Kunden
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="ruecknahme" /> Rücknahme von Kunden
            </label>
          </RadioGroup>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Datum</Label>
            <Input
              type="date"
              value={datum}
              onChange={(e) => setDatum(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Uhrzeit</Label>
            <Input
              type="time"
              value={uhrzeit}
              onChange={(e) => setUhrzeit(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Schlüssel</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setZeilen((zs) => [...zs, leereZeile()])}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Zeile
            </Button>
          </div>
          <div className="space-y-2">
            {zeilen.map((z, i) => (
              <div
                key={i}
                className="grid gap-2 rounded-xl border bg-muted/20 p-2 sm:grid-cols-[1fr_80px_140px_1fr_auto]"
              >
                <Input
                  placeholder="Bezeichnung (z. B. Haupteingang)"
                  value={z.bezeichnung}
                  onChange={(e) =>
                    updateZeile(i, { bezeichnung: e.target.value })
                  }
                />
                <Input
                  type="number"
                  min={1}
                  placeholder="Anzahl"
                  value={z.anzahl}
                  onChange={(e) =>
                    updateZeile(i, { anzahl: Number(e.target.value) || 0 })
                  }
                />
                <Input
                  placeholder="Schlüssel-Nr."
                  value={z.schluesselNr}
                  onChange={(e) =>
                    updateZeile(i, { schluesselNr: e.target.value })
                  }
                />
                <Input
                  placeholder="Bemerkung"
                  value={z.bemerkung}
                  onChange={(e) =>
                    updateZeile(i, { bemerkung: e.target.value })
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    setZeilen((zs) =>
                      zs.length > 1 ? zs.filter((_, idx) => idx !== i) : zs,
                    )
                  }
                  disabled={zeilen.length === 1}
                  aria-label="Zeile löschen"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Pfand (EUR, optional)</Label>
            <Input
              inputMode="decimal"
              value={pfand}
              onChange={(e) => setPfand(e.target.value)}
              placeholder="0,00"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Vertreter Auftraggeber</Label>
            <Input
              value={vertreterAg}
              onChange={(e) => setVertreterAg(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Vertreter Auftragnehmer</Label>
            <Input
              value={vertreterAn}
              onChange={(e) => setVertreterAn(e.target.value)}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={bestaetigt}
            onCheckedChange={(v) => setBestaetigt(v === true)}
          />
          Empfang/Rückgabe wird hiermit bestätigt
        </label>
      </div>

      <div className="sticky bottom-4 flex flex-wrap items-center justify-end gap-2 rounded-2xl border bg-background/95 p-3 shadow-lg backdrop-blur">
        <PrintButton getBlob={buildBlob} variant="outline" size="default" disabled={!kunde} />
        <Button
          variant="outline"
          onClick={() => handleErstellen(false)}
          disabled={busy || !kunde}
        >
          <Mail className="mr-2 h-4 w-4" />
          PDF + per E-Mail senden
        </Button>
        <Button onClick={() => handleErstellen(true)} disabled={busy || !kunde}>
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <FileDown className="mr-2 h-4 w-4" />
          )}
          PDF erstellen
        </Button>
      </div>
    </div>
  );
}
