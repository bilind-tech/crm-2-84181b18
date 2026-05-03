import { useState, useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { toast } from "sonner";
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
import { DateInput } from "@/components/ui/date-input";
import { PrimaryAction } from "@/components/layout/PrimaryAction";
import { useKunden, useObjekte, useCreateProtokoll } from "@/hooks/useApi";
import { todayISO } from "@/lib/format";
import type { UebergabeArt } from "@/lib/api/types";

interface Props {
  onClose: () => void;
  defaultKundeId?: string;
  defaultObjektId?: string;
}

export function UebergabeProtokollForm({ onClose, defaultKundeId, defaultObjektId }: Props) {
  const navigate = useNavigate();
  const { data: kunden = [] } = useKunden();
  const { data: objekteAlle = [] } = useObjekte();
  const create = useCreateProtokoll();

  const [kundeId, setKundeId] = useState(defaultKundeId ?? "");
  const [objektId, setObjektId] = useState(defaultObjektId ?? "");
  const [datum, setDatum] = useState(todayISO());
  const [art, setArt] = useState<UebergabeArt>("uebergabe");
  const [leistungsumfang, setLeistungsumfang] = useState("Endreinigung gemäß Auftrag.");
  const [bemerkungen, setBemerkungen] = useState("");
  const [vertreterAuftraggeber, setVertreterAuftraggeber] = useState("");

  const objekteVonKunde = useMemo(
    () => objekteAlle.filter((o) => o.kundeId === kundeId),
    [objekteAlle, kundeId],
  );

  async function submit() {
    if (!kundeId) return toast.error("Bitte Kunde wählen");
    try {
      const p = await create.mutateAsync({
        kind: "uebergabe",
        kundeId,
        objektId: objektId || undefined,
        datum,
        art,
        leistungsumfang,
        bemerkungen,
        vertreterAuftraggeber,
        ohneVorbehalt: true,
      });
      toast.success("Protokoll angelegt", { description: `${p.nummer} • Editor wird geöffnet.` });
      onClose();
      navigate({ to: "/protokolle/$id/bearbeiten", params: { id: p.id } });
    } catch (e) {
      console.error(e);
      toast.error("Konnte Protokoll nicht anlegen");
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
            <SelectTrigger>
              <SelectValue placeholder="Kunde wählen…" />
            </SelectTrigger>
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Datum">
          <DateInput value={datum} onChange={setDatum} />
        </Field>
        <Field label="Art">
          <Select value={art} onValueChange={(v) => setArt(v as UebergabeArt)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="uebergabe">Übergabe</SelectItem>
              <SelectItem value="abnahme">Abnahme</SelectItem>
              <SelectItem value="beides">Übergabe & Abnahme</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>

      <Field label="Vertreter Auftraggeber (optional)">
        <Input
          value={vertreterAuftraggeber}
          onChange={(e) => setVertreterAuftraggeber(e.target.value)}
          placeholder="z. B. Frau Müller"
        />
      </Field>

      <Field label="Leistungsumfang">
        <Textarea
          value={leistungsumfang}
          onChange={(e) => setLeistungsumfang(e.target.value)}
          rows={3}
        />
      </Field>

      <Field label="Bemerkungen (optional)">
        <Textarea value={bemerkungen} onChange={(e) => setBemerkungen(e.target.value)} rows={2} />
      </Field>

      <div className="sticky bottom-0 -mx-4 -mb-6 mt-2 flex flex-col-reverse items-stretch gap-2 border-t border-border bg-background px-4 py-3 sm:-mx-8 sm:px-8 sm:flex-row sm:items-center sm:justify-end">
        <Button variant="outline" onClick={onClose}>
          Abbrechen
        </Button>
        <PrimaryAction
          icon={Check}
          label={create.isPending ? "Speichere…" : "Protokoll anlegen"}
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
