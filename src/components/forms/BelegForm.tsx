import { useMemo, useState } from "react";
import { Plus, Trash2, Repeat } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useKunden, useObjekte, useCreateAngebot, useCreateRechnung } from "@/hooks/useApi";
import { formatEUR, todayISO, addDays } from "@/lib/format";
import { toast } from "sonner";
import type { Position, Einheit, BelegOptionen } from "@/lib/api/types";

type Mode = "angebot" | "rechnung";

interface Props {
  mode: Mode;
  onClose: () => void;
  defaultKundeId?: string;
}

interface Row extends Omit<Position, "id"> {
  _key: string;
}

function uid() {
  return Math.random().toString(36).slice(2);
}

function newRow(steuersatz = 19): Row {
  return {
    _key: uid(),
    beschreibung: "",
    menge: 1,
    einheit: "stk",
    einzelpreisNetto: 0,
    steuersatz,
    rabatt: 0,
  };
}

const EINHEITEN: { value: Einheit; label: string }[] = [
  { value: "stk", label: "Stk" },
  { value: "h", label: "h" },
  { value: "m2", label: "m²" },
  { value: "pauschal", label: "Pausch." },
  { value: "tag", label: "Tag" },
  { value: "monat", label: "Monat" },
];

export function BelegForm({ mode, onClose, defaultKundeId }: Props) {
  const navigate = useNavigate();
  const { data: kunden = [] } = useKunden();
  const [kundeId, setKundeId] = useState(defaultKundeId ?? "");
  const { data: objekteAlle = [] } = useObjekte(kundeId || undefined);

  const [titel, setTitel] = useState("");
  const [objektId, setObjektId] = useState("");
  const [rows, setRows] = useState<Row[]>([newRow()]);
  const [gueltigBis, setGueltigBis] = useState(addDays(todayISO(), 30));
  const [rechnungsdatum, setRechnungsdatum] = useState(todayISO());
  const [frist, setFrist] = useState(14);
  const [mwst, setMwst] = useState(19);
  const [rabattGesamt, setRabattGesamt] = useState(0);

  const [opt, setOpt] = useState<BelegOptionen>({
    materialBereitgestellt: true,
    standardAnschreiben: true,
    eigenesIntro: "",
    eigenesOutro: "",
    wiederkehrend: false,
  });

  const createA = useCreateAngebot();
  const createR = useCreateRechnung();
  const pending = mode === "angebot" ? createA.isPending : createR.isPending;

  const totals = useMemo(() => {
    const netto = rows.reduce(
      (s, r) => s + r.menge * r.einzelpreisNetto * (1 - (r.rabatt || 0) / 100),
      0,
    );
    const nettoNachRabatt = netto * (1 - rabattGesamt / 100);
    const steuer = nettoNachRabatt * (mwst / 100);
    return { netto: nettoNachRabatt, steuer, brutto: nettoNachRabatt + steuer };
  }, [rows, rabattGesamt, mwst]);

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeRow(i: number) {
    setRows((prev) => (prev.length === 1 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  async function submit() {
    if (!kundeId) {
      toast.error("Bitte einen Kunden auswählen");
      return;
    }
    if (!titel.trim()) {
      toast.error("Bitte einen Titel eingeben");
      return;
    }
    const positionen: Position[] = rows.map((r) => ({
      id: uid(),
      beschreibung: r.beschreibung,
      menge: r.menge,
      einheit: r.einheit,
      einzelpreisNetto: r.einzelpreisNetto,
      steuersatz: r.steuersatz,
      rabatt: r.rabatt,
    }));

    const optionen: BelegOptionen = {
      materialBereitgestellt: opt.materialBereitgestellt,
      standardAnschreiben: opt.standardAnschreiben,
      eigenesIntro: opt.eigenesIntro?.trim() || undefined,
      eigenesOutro: opt.eigenesOutro?.trim() || undefined,
      wiederkehrend: opt.wiederkehrend,
    };

    if (mode === "angebot") {
      const r = await createA.mutateAsync({
        kundeId,
        objektId: objektId || undefined,
        titel,
        positionen,
        rabattGesamt,
        steuersatz: mwst,
        gueltigBis,
        optionen,
      });
      toast.success("Angebot angelegt", { description: `${r.nummer} • erfolgreich gespeichert.` });
      onClose();
      navigate({ to: "/angebote/$id", params: { id: r.id } });
    } else {
      const r = await createR.mutateAsync({
        kundeId,
        objektId: objektId || undefined,
        titel,
        positionen,
        rabattGesamt,
        steuersatz: mwst,
        rechnungsdatum,
        faelligkeitsdatum: addDays(rechnungsdatum, frist),
        optionen,
      });
      toast.success("Rechnung angelegt", { description: `${r.nummer} • erfolgreich gespeichert.` });
      onClose();
      navigate({ to: "/rechnungen/$id", params: { id: r.id } });
    }
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
                  {k.firmenname || `${k.vorname ?? ""} ${k.nachname ?? ""}`.trim()} ({k.nummer})
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
            <SelectTrigger><SelectValue placeholder={kundeId ? "Kein Objekt" : "Erst Kunde wählen"} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Kein Objekt</SelectItem>
              {objekteAlle.map((o) => (
                <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="Titel *">
        <Input
          value={titel}
          onChange={(e) => setTitel(e.target.value)}
          placeholder={mode === "angebot" ? "z. B. Unterhaltsreinigung Bürogebäude Q2" : "z. B. Reinigung April 2026"}
        />
      </Field>

      <div className="rounded-2xl border border-border bg-muted/30 p-4">
        <p className="text-base font-semibold">Leistungen & Preise</p>
        <p className="text-xs text-muted-foreground">
          Trage hier ein, was {mode === "angebot" ? "angeboten" : "abgerechnet"} wird — der Betrag wird live berechnet.
        </p>

        <div className="mt-4 hidden grid-cols-[24px_1fr_70px_80px_110px_70px_110px_32px] items-center gap-2 px-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground sm:grid">
          <span>#</span>
          <span>Beschreibung</span>
          <span>Menge</span>
          <span>Einheit</span>
          <span className="text-right">Einzelpreis €</span>
          <span className="text-right">MwSt %</span>
          <span className="text-right">Summe Netto</span>
          <span />
        </div>

        <div className="mt-2 space-y-2">
          {rows.map((r, i) => {
            const summe = r.menge * r.einzelpreisNetto * (1 - (r.rabatt || 0) / 100);
            return (
              <div
                key={r._key}
                className="grid grid-cols-2 items-center gap-2 rounded-xl border border-border bg-background p-2 sm:grid-cols-[24px_1fr_70px_80px_110px_70px_110px_32px]"
              >
                <span className="text-xs text-muted-foreground">{i + 1}</span>
                <Input
                  className="h-9"
                  value={r.beschreibung}
                  onChange={(e) => updateRow(i, { beschreibung: e.target.value })}
                  placeholder="Beschreibung der Leistung"
                />
                <Input
                  className="h-9 text-right"
                  type="number"
                  value={r.menge}
                  onChange={(e) => updateRow(i, { menge: Number(e.target.value) || 0 })}
                />
                <Select
                  value={r.einheit}
                  onValueChange={(v) => updateRow(i, { einheit: v as Einheit })}
                >
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EINHEITEN.map((u) => (
                      <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  className="h-9 text-right"
                  type="number"
                  step="0.01"
                  value={r.einzelpreisNetto}
                  onChange={(e) => updateRow(i, { einzelpreisNetto: Number(e.target.value) || 0 })}
                />
                <Input
                  className="h-9 text-right"
                  type="number"
                  value={r.steuersatz}
                  onChange={(e) => updateRow(i, { steuersatz: Number(e.target.value) || 0 })}
                />
                <span className="text-right text-sm font-semibold tabular-nums">{formatEUR(summe)}</span>
                <button
                  onClick={() => removeRow(i)}
                  className="grid h-8 w-8 place-content-center rounded-md text-destructive hover:bg-destructive/10"
                  aria-label="Position löschen"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setRows((p) => [...p, newRow(mwst)])}
            className="gap-1.5"
          >
            <Plus className="h-4 w-4" /> Position hinzufügen
          </Button>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">
              Netto: <span className="font-semibold text-foreground">{formatEUR(totals.netto)}</span>
              {" · "}MwSt: <span className="font-semibold text-foreground">{formatEUR(totals.steuer)}</span>
            </p>
            <p className="text-2xl font-semibold text-primary">{formatEUR(totals.brutto)}</p>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Gesamt brutto</p>
          </div>
        </div>
      </div>

      <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-border bg-card p-4">
        <Checkbox
          checked={opt.wiederkehrend}
          onCheckedChange={(v) => setOpt({ ...opt, wiederkehrend: !!v })}
          className="mt-0.5"
        />
        <div>
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Repeat className="h-3.5 w-3.5" />
            {mode === "angebot" ? "Wiederkehrendes Angebot (Dauerauftrag)" : "Als Dauerauftrag anlegen"}
          </p>
          <p className="text-xs text-muted-foreground">
            {mode === "angebot"
              ? "Markiert das Angebot als wiederkehrende Leistung. Beim Annehmen kann ein Dauerauftrag daraus angelegt werden."
              : "Legt zusätzlich einen wiederkehrenden Auftrag an, aus dem du später weitere Rechnungen erzeugen kannst."}
          </p>
        </div>
      </label>

      <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
        <p className="text-sm font-semibold">Optionen für das PDF</p>

        <Toggle
          checked={opt.materialBereitgestellt}
          onChange={(v) => setOpt({ ...opt, materialBereitgestellt: v })}
          label="Wir stellen Reinigungsmittel & Werkzeuge bereit"
          desc="Fügt den Standardsatz aus deiner Vorlage in das PDF ein."
        />
        <Toggle
          checked={opt.standardAnschreiben}
          onChange={(v) => setOpt({ ...opt, standardAnschreiben: v })}
          label="Standard-Anschreiben verwenden"
          desc="Nutzt deine hinterlegten Standard-Texte. Ausschalten, wenn du eigene Texte angibst."
        />

        {!opt.standardAnschreiben && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Eigener Einleitungstext">
              <Textarea
                rows={4}
                value={opt.eigenesIntro ?? ""}
                onChange={(e) => setOpt({ ...opt, eigenesIntro: e.target.value })}
                placeholder="Sehr geehrte Damen und Herren, …"
              />
            </Field>
            <Field label="Eigener Schlusstext">
              <Textarea
                rows={4}
                value={opt.eigenesOutro ?? ""}
                onChange={(e) => setOpt({ ...opt, eigenesOutro: e.target.value })}
                placeholder="Mit freundlichen Grüßen, …"
              />
            </Field>
          </div>
        )}
      </div>

      {mode === "angebot" ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Gültig bis">
            <Input type="date" value={gueltigBis} onChange={(e) => setGueltigBis(e.target.value)} />
          </Field>
          <Field label="MwSt-Satz (%)">
            <Input type="number" value={mwst} onChange={(e) => setMwst(Number(e.target.value) || 0)} />
          </Field>
          <Field label="Rabatt (%)">
            <Input type="number" value={rabattGesamt} onChange={(e) => setRabattGesamt(Number(e.target.value) || 0)} />
          </Field>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-5">
          <Field label="Rechnungsdatum">
            <Input type="date" value={rechnungsdatum} onChange={(e) => setRechnungsdatum(e.target.value)} />
          </Field>
          <Field label="Fällig am">
            <Input
              type="date"
              value={addDays(rechnungsdatum, frist)}
              onChange={(e) => {
                const t = new Date(e.target.value).getTime() - new Date(rechnungsdatum).getTime();
                setFrist(Math.round(t / 86400000));
              }}
            />
          </Field>
          <Field label="Frist (Tage)">
            <Input type="number" value={frist} onChange={(e) => setFrist(Number(e.target.value) || 0)} />
          </Field>
          <Field label="MwSt (%)">
            <Input type="number" value={mwst} onChange={(e) => setMwst(Number(e.target.value) || 0)} />
          </Field>
          <Field label="Rabatt (%)">
            <Input type="number" value={rabattGesamt} onChange={(e) => setRabattGesamt(Number(e.target.value) || 0)} />
          </Field>
        </div>
      )}

      <div className="sticky bottom-0 -mx-4 -mb-6 mt-2 flex flex-col-reverse items-stretch gap-2 border-t border-border bg-background px-4 py-3 sm:-mx-8 sm:px-8 sm:flex-row sm:items-center sm:justify-end ">
        <Button variant="outline" onClick={onClose}>Abbrechen</Button>
        <Button disabled={pending} onClick={submit} className="rounded-md px-6">
          {pending ? "Speichere…" : mode === "angebot" ? "Angebot anlegen" : "Rechnung anlegen"}
        </Button>
      </div>
    </div>
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

function Toggle({
  checked,
  onChange,
  label,
  desc,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  desc: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background p-3">
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(!!v)} className="mt-0.5" />
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{desc}</p>
      </div>
    </label>
  );
}
