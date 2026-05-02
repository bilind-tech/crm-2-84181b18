import { useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useKunden, useObjekte, useCreateRechnung, useNummernkreise, useKundenZaehler } from "@/hooks/useApi";
import { vorschauBelegnummer } from "@/lib/belegNummer";
import { toast } from "sonner";
import { addDays, todayISO } from "@/lib/format";
import {
  PositionenEditor,
  emptyPosition,
  toApiPositionen,
  type PositionDraft,
} from "./PositionenEditor";
import { OptionenBlock, defaultOptionen, type OptionenState } from "./OptionenBlock";
import { formatWiederkehrend } from "./DauerauftragKonfig";
import { AnsprechpartnerPicker } from "./AnsprechpartnerPicker";
import { Repeat, Check } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { PrimaryAction } from "@/components/layout/PrimaryAction";

interface Props {
  onClose: () => void;
  defaultKundeId?: string;
  defaultObjektId?: string;
}

export function RechnungForm({ onClose, defaultKundeId, defaultObjektId }: Props) {
  const navigate = useNavigate();
  const { data: kunden = [] } = useKunden();
  const { data: objekteAlle = [] } = useObjekte();
  const { data: nummernkreise } = useNummernkreise();
  const create = useCreateRechnung();

  const [kundeId, setKundeId] = useState(defaultKundeId ?? "");
  const [objektId, setObjektId] = useState(defaultObjektId ?? "");
  const [titel, setTitel] = useState("");
  const [steuersatz, setSteuersatz] = useState(19);
  const [rabattGesamt, setRabattGesamt] = useState(0);
  const [rechnungsdatum, setRechnungsdatum] = useState(todayISO());
  const [frist, setFrist] = useState(14);
  const [faellig, setFaellig] = useState(addDays(todayISO(), 14));
  const [positionen, setPositionen] = useState<PositionDraft[]>([emptyPosition(19)]);
  const [optionen, setOptionen] = useState<OptionenState>(defaultOptionen);
  const [ansprechpartnerId, setAnsprechpartnerId] = useState<string | undefined>();

  const objekteVonKunde = useMemo(
    () => objekteAlle.filter((o) => o.kundeId === kundeId),
    [objekteAlle, kundeId]
  );

  const zaehlerQ = useKundenZaehler(kundeId);
  const vorschauNummer = useMemo(() => {
    if (!kundeId || !nummernkreise) return "";
    const kunde = kunden.find((k) => k.id === kundeId);
    const naechster = zaehlerQ.data?.naechsterStart ?? 1;
    return vorschauBelegnummer(kunde?.kuerzel, nummernkreise.rechnungPraefix, naechster);
  }, [kundeId, kunden, nummernkreise, zaehlerQ.data?.naechsterStart]);
  const vorschauLaedt = !!kundeId && zaehlerQ.isLoading;

  function setFristTage(tage: number) {
    setFrist(tage);
    setFaellig(addDays(rechnungsdatum, tage));
  }
  function setRechnungsdatumAndFrist(d: string) {
    setRechnungsdatum(d);
    setFaellig(addDays(d, frist));
  }

  async function submit() {
    if (!kundeId) return toast.error("Bitte Kunde wählen");
    if (!titel.trim()) return toast.error("Titel ist erforderlich");
    if (positionen.length === 0) return toast.error("Mindestens eine Position erforderlich");

    const r = await create.mutateAsync({
      kundeId,
      objektId: objektId || undefined,
      ansprechpartnerId: ansprechpartnerId || undefined,
      titel,
      positionen: toApiPositionen(positionen),
      rabattGesamt,
      steuersatz,
      rechnungsdatum,
      faelligkeitsdatum: faellig,
      status: "entwurf",
      introText: optionen.eigenesIntroAktiv ? optionen.eigenesIntro : undefined,
      outroText: optionen.eigenesOutroAktiv ? optionen.eigenesOutro : undefined,
      optionen: {
        materialBereitgestellt: optionen.materialBereitgestellt,
        standardAnschreiben: optionen.standardAnschreiben,
        eigenesIntro: optionen.eigenesIntroAktiv ? optionen.eigenesIntro : undefined,
        eigenesOutro: optionen.eigenesOutroAktiv ? optionen.eigenesOutro : undefined,
        wiederkehrend: optionen.wiederkehrend,
        wiederkehrendDetails: optionen.wiederkehrend ? optionen.wiederkehrendDetails : undefined,
      },
    });
    const beschreibung = r.dauerauftragNeu
      ? `${r.nummer} • Dauerauftrag ${r.dauerauftragNeu.nummer} angelegt`
      : `${r.nummer} • erfolgreich gespeichert.`;
    toast.success("Rechnung angelegt", { description: beschreibung });
    onClose();
    navigate({ to: "/rechnungen/$id", params: { id: r.id } });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kunde *">
          <Select
            value={kundeId || undefined}
            onValueChange={(v) => {
              setKundeId(v);
              setObjektId("");
            }}
          >
            <SelectTrigger><SelectValue placeholder="Kunde wählen…" /></SelectTrigger>
            <SelectContent>
              {kunden.map((k) => (
                <SelectItem key={k.id} value={k.id}>
                  {k.firmenname || `${k.vorname ?? ""} ${k.nachname ?? ""}`.trim()} · {k.nummer}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Objekt (optional)">
          <Select
            value={objektId || "__none__"}
            onValueChange={(v) => setObjektId(v === "__none__" ? "" : v)}
            disabled={!kundeId}
          >
            <SelectTrigger><SelectValue placeholder={kundeId ? "— kein Objekt —" : "Erst Kunde wählen"} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— kein Objekt —</SelectItem>
              {objekteVonKunde.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {kundeId && (
        <AnsprechpartnerPicker
          kundeId={kundeId}
          value={ansprechpartnerId}
          onChange={setAnsprechpartnerId}
        />
      )}

      <div className="flex items-end gap-3">
        <div className="flex-1">
          <Field label="Titel *">
            <Input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="z. B. Reinigung März 2026" />
          </Field>
        </div>
        <button
          type="button"
          onClick={() => setOptionen({ ...optionen, wiederkehrend: !optionen.wiederkehrend })}
          className={`inline-flex h-10 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition ${
            optionen.wiederkehrend
              ? "border-primary bg-primary/10 text-primary"
              : "border-border bg-background text-muted-foreground hover:bg-muted"
          }`}
          title="Als Dauerauftrag kennzeichnen"
        >
          <Repeat className="h-3.5 w-3.5" />
          Dauerauftrag
        </button>
      </div>

      {kundeId && (
        <p className="-mt-3 text-xs text-muted-foreground">
          Belegnummer:{" "}
          {vorschauLaedt || !vorschauNummer ? (
            <span className="text-muted-foreground/70">wird ermittelt …</span>
          ) : (
            <span className="font-mono font-semibold text-foreground">{vorschauNummer}</span>
          )}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Rechnungsdatum">
          <DateInput value={rechnungsdatum} onChange={setRechnungsdatumAndFrist} />
        </Field>
        <Field label="Zahlungsfrist (Tage)">
          <Input type="number" value={frist} onChange={(e) => setFristTage(Number(e.target.value) || 0)} className="h-12 text-base" />
        </Field>
        <Field label="Fällig am">
          <DateInput value={faellig} onChange={setFaellig} />
        </Field>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Leistungen & Preise
        </p>
        <PositionenEditor
          positionen={positionen}
          onChange={setPositionen}
          defaultSteuersatz={steuersatz}
          defaultAusfuehrung={
            optionen.wiederkehrend ? formatWiederkehrend(optionen.wiederkehrendDetails) : undefined
          }
        />
      </div>

      <OptionenBlock value={optionen} onChange={setOptionen} />

      <div>
        <Field label="Gesamtrabatt (%)">
          <Input type="number" value={rabattGesamt} onChange={(e) => setRabattGesamt(Number(e.target.value) || 0)} />
        </Field>
      </div>

      <div className="sticky bottom-0 -mx-4 -mb-6 mt-2 flex flex-col-reverse items-stretch gap-2 border-t border-border bg-background px-4 py-3 sm:-mx-8 sm:px-8 sm:flex-row sm:items-center sm:justify-end ">
        <Button variant="outline" onClick={onClose}>Abbrechen</Button>
        <PrimaryAction
          icon={Check}
          label={create.isPending ? "Speichere…" : "Rechnung anlegen"}
          onClick={submit}
          disabled={create.isPending}
        />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
