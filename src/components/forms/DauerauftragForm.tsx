// Form für neuen Dauerauftrag (im SlideOver) und Quick-Edit der Kernfelder.
import { useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useKunden, useObjekte } from "@/hooks/useApi";
import { useCreateDauerauftrag } from "@/hooks/useDauerauftraege";
import { toast } from "sonner";
import { todayISO } from "@/lib/format";
import {
  PositionenEditor,
  emptyPosition,
  toApiPositionen,
  type PositionDraft,
} from "./PositionenEditor";
import type {
  Dauerauftrag,
  DauerauftragFrequenz,
  DauerauftragModus,
  DauerauftragStichtag,
} from "@/lib/api/types";

interface Props {
  onClose: () => void;
}

export function DauerauftragForm({ onClose }: Props) {
  const navigate = useNavigate();
  const { data: kunden = [] } = useKunden();
  const { data: objekteAlle = [] } = useObjekte();
  const create = useCreateDauerauftrag();

  const [kundeId, setKundeId] = useState("");
  const [objektId, setObjektId] = useState("");
  const [bezeichnung, setBezeichnung] = useState("Reinigung {{lauf.zeitraum}}");
  const [frequenz, setFrequenz] = useState<DauerauftragFrequenz>("monatlich");
  const [stichtagTyp, setStichtagTyp] =
    useState<DauerauftragStichtag["typ"]>("monatstag");
  const [stichtagWert, setStichtagWert] = useState(1);
  const [laufzeitVon, setLaufzeitVon] = useState(todayISO());
  const [laufzeitBis, setLaufzeitBis] = useState("");
  const [steuersatz, setSteuersatz] = useState(19);
  const [rabattGesamt, setRabattGesamt] = useState(0);
  const [betreffVorlage, setBetreffVorlage] = useState(
    "Rechnung {{lauf.zeitraum}} – {{firma.name}}",
  );
  const [textVorlage, setTextVorlage] = useState(
    "Sehr geehrte Damen und Herren,\n\nanbei erhalten Sie die Rechnung für den Leistungszeitraum {{lauf.von}} bis {{lauf.bis}}.\n\nMit freundlichen Grüßen",
  );
  const [modus, setModus] = useState<DauerauftragModus>("entwurf");
  const [positionen, setPositionen] = useState<PositionDraft[]>([emptyPosition(19)]);

  const objekteVonKunde = useMemo(
    () => objekteAlle.filter((o) => o.kundeId === kundeId),
    [objekteAlle, kundeId],
  );

  async function submit() {
    if (!kundeId) return toast.error("Bitte Kunde wählen");
    if (!bezeichnung.trim()) return toast.error("Bezeichnung erforderlich");
    if (positionen.length === 0) return toast.error("Mindestens eine Position");

    const payload: Partial<Dauerauftrag> = {
      kundeId,
      objektId: objektId || undefined,
      bezeichnung,
      frequenz,
      stichtag: { typ: stichtagTyp, wert: stichtagTyp === "monatsletzter" ? undefined : stichtagWert },
      laufzeitVon,
      laufzeitBis: laufzeitBis || undefined,
      positionen: toApiPositionen(positionen),
      rabattGesamt,
      steuersatz,
      betreffVorlage,
      textVorlage,
      modus,
      status: "aktiv",
    };
    const da = await create.mutateAsync(payload);
    toast.success("Dauerauftrag angelegt", { description: da.nummer });
    onClose();
    navigate({ to: "/dauerauftraege/$id", params: { id: da.id } });
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Kunde *">
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={kundeId}
            onChange={(e) => {
              setKundeId(e.target.value);
              setObjektId("");
            }}
          >
            <option value="">Kunde wählen…</option>
            {kunden.map((k) => (
              <option key={k.id} value={k.id}>
                {k.firmenname || `${k.vorname ?? ""} ${k.nachname ?? ""}`.trim()} · {k.nummer}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Objekt (optional)">
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:opacity-50"
            value={objektId}
            disabled={!kundeId}
            onChange={(e) => setObjektId(e.target.value)}
          >
            <option value="">— kein Objekt —</option>
            {objekteVonKunde.map((o) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Bezeichnung *">
        <Input
          value={bezeichnung}
          onChange={(e) => setBezeichnung(e.target.value)}
          placeholder="z. B. Reinigung {{lauf.zeitraum}}"
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Frequenz">
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={frequenz}
            onChange={(e) => setFrequenz(e.target.value as DauerauftragFrequenz)}
          >
            <option value="monatlich">Monatlich</option>
            <option value="quartalsweise">Quartalsweise</option>
            <option value="halbjaehrlich">Halbjährlich</option>
            <option value="jaehrlich">Jährlich</option>
          </select>
        </Field>
        <Field label="Stichtag">
          <select
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            value={stichtagTyp}
            onChange={(e) =>
              setStichtagTyp(e.target.value as DauerauftragStichtag["typ"])
            }
          >
            <option value="monatstag">Tag im Monat</option>
            <option value="monatsletzter">Letzter Monatstag</option>
            <option value="quartalstag">Tag im Quartalsmonat</option>
          </select>
        </Field>
        <Field label="Tag (1–28)">
          <Input
            type="number"
            min={1}
            max={28}
            value={stichtagWert}
            disabled={stichtagTyp === "monatsletzter"}
            onChange={(e) => setStichtagWert(Number(e.target.value) || 1)}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Laufzeit von">
          <Input type="date" value={laufzeitVon} onChange={(e) => setLaufzeitVon(e.target.value)} />
        </Field>
        <Field label="Laufzeit bis (optional)">
          <Input type="date" value={laufzeitBis} onChange={(e) => setLaufzeitBis(e.target.value)} />
        </Field>
      </div>

      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Leistungen & Preise
        </p>
        <PositionenEditor positionen={positionen} onChange={setPositionen} defaultSteuersatz={steuersatz} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="MwSt-Satz (%)">
          <Input type="number" value={steuersatz} onChange={(e) => setSteuersatz(Number(e.target.value) || 0)} />
        </Field>
        <Field label="Gesamtrabatt (%)">
          <Input type="number" value={rabattGesamt} onChange={(e) => setRabattGesamt(Number(e.target.value) || 0)} />
        </Field>
      </div>

      <Field label="Betreff-Vorlage (E-Mail)">
        <Input value={betreffVorlage} onChange={(e) => setBetreffVorlage(e.target.value)} />
      </Field>
      <Field label="Anschreiben-Vorlage (Intro auf Rechnung)">
        <textarea
          rows={4}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={textVorlage}
          onChange={(e) => setTextVorlage(e.target.value)}
        />
        <p className="mt-1 text-[11px] text-muted-foreground">
          Platzhalter: <code>{"{{lauf.zeitraum}}"}</code>, <code>{"{{lauf.von}}"}</code>,{" "}
          <code>{"{{lauf.bis}}"}</code>
        </p>
      </Field>

      <Field label="Modus">
        <div className="flex gap-2">
          {(["entwurf", "vollautomatisch"] as DauerauftragModus[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setModus(m)}
              className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                modus === m
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {m === "entwurf" ? "Entwurf zur Freigabe" : "Vollautomatisch versenden"}
            </button>
          ))}
        </div>
      </Field>

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
        <Button variant="outline" onClick={onClose}>Abbrechen</Button>
        <Button disabled={create.isPending} onClick={submit} className="rounded-md px-6">
          {create.isPending ? "Speichere…" : "Dauerauftrag anlegen"}
        </Button>
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
