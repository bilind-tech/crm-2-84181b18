// Übergabe-/Abnahmeprotokoll — Frontend-Formular + PDF-Erzeugung.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, FileDown, Loader2, Mail } from "lucide-react";
import { PrintButton } from "@/components/pdf/PrintButton";
import { toast } from "sonner";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import { KundenObjektPicker, kundenAnzeige } from "@/components/werkzeuge/KundenObjektPicker";
import { useFirmendaten } from "@/hooks/useApi";
import type { Kunde, Objekt } from "@/lib/api/types";
import {
  downloadBlob,
  generateUebergabeprotokollPdf,
  safeFilename,
  type ProtokollArt,
} from "@/lib/pdf/werkzeugePdf";

export const Route = createFileRoute("/werkzeuge/uebergabeprotokoll")({
  component: Page,
});

function Page() {
  const firmaQ = useFirmendaten();
  const [kunde, setKunde] = useState<Kunde | undefined>();
  const [objekt, setObjekt] = useState<Objekt | undefined>();
  const [art, setArt] = useState<ProtokollArt>("uebergabe");
  const today = new Date();
  const [datum, setDatum] = useState(today.toISOString().slice(0, 10));
  const [uhrzeit, setUhrzeit] = useState(
    `${String(today.getHours()).padStart(2, "0")}:${String(today.getMinutes()).padStart(2, "0")}`,
  );
  const [vertreterAg, setVertreterAg] = useState("");
  const [vertreterAn, setVertreterAn] = useState("");
  const [leistungsumfang, setLeistungsumfang] = useState(
    "Endreinigung gemäß Auftrag.",
  );
  const [bemerkungen, setBemerkungen] = useState("");
  const [ohneVorbehalt, setOhneVorbehalt] = useState(true);
  const [busy, setBusy] = useState(false);

  // Vorausfüllen aus Stammdaten
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

  const buildBlob = async (): Promise<Blob> => {
    if (!kunde) throw new Error("Bitte zuerst einen Kunden auswählen.");
    return generateUebergabeprotokollPdf({
      art,
      datum,
      uhrzeit,
      vertreterAuftraggeber: vertreterAg,
      vertreterAuftragnehmer: vertreterAn,
      leistungsumfang,
      bemerkungen,
      ohneVorbehalt,
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
    setBusy(true);
    try {
      const blob = await buildBlob();
      const fname = `${
        art === "uebergabe"
          ? "Uebergabeprotokoll"
          : art === "abnahme"
            ? "Abnahmeprotokoll"
            : "Protokoll"
      }_${safeFilename(kundenAnzeige(kunde))}_${datum}.pdf`;
      downloadBlob(blob, fname);
      toast.success("PDF wurde heruntergeladen");
      if (!downloadOnly) {
        toast.message("E-Mail-Versand", {
          description:
            empfaengerEmail
              ? `Bitte das soeben heruntergeladene PDF im E-Mail-Dialog anhängen. Empfänger vorbelegt: ${empfaengerEmail}`
              : "Beim Kunden ist keine E-Mail hinterlegt — bitte manuell ergänzen.",
        });
        // Folge-Plan: direkter Anhang über EmailVersandDialog mit Blob-Upload.
      }
    } catch (e) {
      console.error(e);
      toast.error("PDF konnte nicht erzeugt werden.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        title="Übergabe-/Abnahmeprotokoll"
        subtitle="Schnell ausfüllen, PDF erzeugen, Kunden zustellen."
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
          <Label>Art</Label>
          <RadioGroup
            value={art}
            onValueChange={(v) => setArt(v as ProtokollArt)}
            className="flex flex-wrap gap-4"
          >
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="uebergabe" /> Übergabe
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="abnahme" /> Abnahme
            </label>
            <label className="flex items-center gap-2 text-sm">
              <RadioGroupItem value="beides" /> Übergabe &amp; Abnahme
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

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Vertreter Auftraggeber</Label>
            <Input
              value={vertreterAg}
              onChange={(e) => setVertreterAg(e.target.value)}
              placeholder="Name in Druckbuchstaben"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Vertreter Auftragnehmer</Label>
            <Input
              value={vertreterAn}
              onChange={(e) => setVertreterAn(e.target.value)}
              placeholder="Name in Druckbuchstaben"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Leistungsumfang</Label>
          <Textarea
            value={leistungsumfang}
            onChange={(e) => setLeistungsumfang(e.target.value)}
            rows={3}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Mängel / Bemerkungen</Label>
          <Textarea
            value={bemerkungen}
            onChange={(e) => setBemerkungen(e.target.value)}
            rows={3}
            placeholder="Keine."
          />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={ohneVorbehalt}
            onCheckedChange={(v) => setOhneVorbehalt(v === true)}
          />
          Abnahme erfolgt ohne Vorbehalt
        </label>
      </div>

      <div className="sticky bottom-4 flex flex-wrap items-center justify-end gap-2 rounded-2xl border bg-background/95 p-3 shadow-lg backdrop-blur">
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
