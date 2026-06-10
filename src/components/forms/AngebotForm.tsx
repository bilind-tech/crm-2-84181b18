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
import { KundePicker } from "./KundePicker";
import {
  useKunden,
  useObjekte,
  useCreateAngebot,
  useNummernkreise,
  useKundenZaehler,
} from "@/hooks/useApi";
import { vorschauBelegnummer } from "@/lib/belegNummer";
import { toast } from "sonner";
import { addDays, todayISO } from "@/lib/format";
import { errorToMessage } from "@/lib/api/piClient";
import {
  PositionenEditor,
  emptyPosition,
  toApiPositionen,
  type PositionDraft,
} from "./PositionenEditor";
import { OptionenBlock, defaultOptionen, type OptionenState } from "./OptionenBlock";
import { AnsprechpartnerPicker } from "./AnsprechpartnerPicker";
import { Repeat, Check } from "lucide-react";
import { DateInput } from "@/components/ui/date-input";
import { PrimaryAction } from "@/components/layout/PrimaryAction";

interface Props {
  onClose: () => void;
  defaultKundeId?: string;
  defaultObjektId?: string;
}

export function AngebotForm({ onClose, defaultKundeId, defaultObjektId }: Props) {
  const navigate = useNavigate();
  const { data: kunden = [] } = useKunden();
  const { data: objekteAlle = [] } = useObjekte();
  const { data: nummernkreise } = useNummernkreise();
  const create = useCreateAngebot();

  const [kundeId, setKundeId] = useState(defaultKundeId ?? "");
  const [objektId, setObjektId] = useState(defaultObjektId ?? "");
  const [titel, setTitel] = useState("");
  const [steuersatz, setSteuersatz] = useState(19);
  const [rabattGesamt, setRabattGesamt] = useState(0);
  const [gueltigBis, setGueltigBis] = useState(addDays(todayISO(), 30));
  const [einsatzVon, setEinsatzVon] = useState<string>(todayISO());
  const [einsatzBis, setEinsatzBis] = useState<string>("");
  const [positionen, setPositionen] = useState<PositionDraft[]>(() => [emptyPosition(19)]);
  const [optionen, setOptionen] = useState<OptionenState>(defaultOptionen);
  const [ansprechpartnerId, setAnsprechpartnerId] = useState<string | undefined>();

  const objekteVonKunde = useMemo(
    () => objekteAlle.filter((o) => o.kundeId === kundeId),
    [objekteAlle, kundeId],
  );

  const zaehlerQ = useKundenZaehler(kundeId);
  const vorschauNummer = useMemo(() => {
    if (!kundeId || !nummernkreise) return "";
    const kunde = kunden.find((k) => k.id === kundeId);
    const naechster = zaehlerQ.data?.naechsterStart ?? 1;
    return vorschauBelegnummer(kunde?.kuerzel, nummernkreise.angebotFormat, naechster);
  }, [kundeId, kunden, nummernkreise, zaehlerQ.data?.naechsterStart]);
  const vorschauLaedt = !!kundeId && zaehlerQ.isLoading;

  async function submit() {
    if (!kundeId) return toast.error("Bitte Kunde wählen");
    if (!titel.trim()) return toast.error("Titel ist erforderlich");
    if (positionen.length === 0) return toast.error("Mindestens eine Position erforderlich");

    try {
      const a = await create.mutateAsync({
      kundeId,
      objektId: objektId || undefined,
      ansprechpartnerId: ansprechpartnerId || undefined,
      titel,
      positionen: toApiPositionen(positionen),
      rabattGesamt,
      steuersatz,
      gueltigBis,
      einsatzVon: !optionen.wiederkehrend && einsatzVon ? einsatzVon : undefined,
      einsatzBis: !optionen.wiederkehrend && einsatzBis ? einsatzBis : undefined,
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
      toast.success("Angebot angelegt", { description: `${a.nummer} • erfolgreich gespeichert.` });
      onClose();
      navigate({ to: "/angebote/$id", params: { id: a.id } });
    } catch (err) {
      toast.error("Angebot konnte nicht angelegt werden", { description: errorToMessage(err) });
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kunde *">
          <KundePicker
            kunden={kunden}
            value={kundeId || undefined}
            onChange={(v) => {
              setKundeId(v);
              setObjektId("");
            }}
          />
        </Field>
        <Field label="Objekt (optional)">
          <Select
            value={objektId || "__none__"}
            onValueChange={(v) => setObjektId(v === "__none__" ? "" : v)}
            disabled={!kundeId}
          >
            <SelectTrigger>
              <SelectValue placeholder={kundeId ? "— kein Objekt —" : "Erst Kunde wählen"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">— kein Objekt —</SelectItem>
              {objekteVonKunde.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
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
            <Input
              value={titel}
              onChange={(e) => setTitel(e.target.value)}
              placeholder="z. B. Unterhaltsreinigung Bürogebäude"
            />
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

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Leistungen & Preise
        </p>
        <PositionenEditor
          positionen={positionen}
          onChange={setPositionen}
          defaultSteuersatz={steuersatz}
        />
      </div>

      {!optionen.wiederkehrend && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Einsatztermin
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Einsatz am">
              <DateInput value={einsatzVon} onChange={setEinsatzVon} />
            </Field>
            <Field label="bis (optional, für Mehrtages-Einsatz)">
              <DateInput value={einsatzBis} onChange={setEinsatzBis} />
            </Field>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Lass „bis" leer, wenn die Reinigung nur an einem Tag stattfindet.
          </p>
        </div>
      )}

      <OptionenBlock value={optionen} onChange={setOptionen} />

      <div>
        <Field label="Gültig bis">
          <DateInput value={gueltigBis} onChange={setGueltigBis} />
        </Field>
      </div>
      <div>
        <Field label="Gesamtrabatt (%)">
          <Input
            type="number"
            value={rabattGesamt}
            onChange={(e) => setRabattGesamt(Number(e.target.value) || 0)}
          />
        </Field>
      </div>

      <div className="sticky bottom-0 -mx-4 -mb-6 mt-2 flex flex-col-reverse items-stretch gap-2 border-t border-border bg-background px-4 py-3 sm:-mx-8 sm:px-8 sm:flex-row sm:items-center sm:justify-end ">
        <Button variant="outline" onClick={onClose}>
          Abbrechen
        </Button>
        <PrimaryAction
          icon={Check}
          label={create.isPending ? "Speichere…" : "Angebot anlegen"}
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
