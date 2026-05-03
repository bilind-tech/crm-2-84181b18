// Editor-Panel für Übergabe-/Abnahmeprotokoll.
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { KundenObjektPicker } from "@/components/werkzeuge/KundenObjektPicker";
import type { Kunde, Objekt, UebergabeProtokoll, UebergabeArt } from "@/lib/api/types";

interface Props {
  draft: UebergabeProtokoll;
  kunde?: Kunde;
  objekt?: Objekt;
  set: <K extends keyof UebergabeProtokoll>(key: K, value: UebergabeProtokoll[K]) => void;
  onKundeChange: (k: Kunde | undefined) => void;
  onObjektChange: (o: Objekt | undefined) => void;
}

export function UebergabePanel({ draft, kunde, objekt, set, onKundeChange, onObjektChange }: Props) {
  return (
    <div className="space-y-5">
      <KundenObjektPicker
        kundeId={kunde?.id}
        objektId={objekt?.id}
        onKundeChange={(k) => { onKundeChange(k); set("kundeId", k?.id); set("objektId", undefined); }}
        onObjektChange={(o) => { onObjektChange(o); set("objektId", o?.id); }}
      />
      <div className="space-y-2">
        <Label>Art</Label>
        <RadioGroup value={draft.art} onValueChange={(v) => set("art", v as UebergabeArt)} className="flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="uebergabe" /> Übergabe</label>
          <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="abnahme" /> Abnahme</label>
          <label className="flex items-center gap-2 text-sm"><RadioGroupItem value="beides" /> Übergabe &amp; Abnahme</label>
        </RadioGroup>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Datum</Label><Input type="date" value={draft.datum} onChange={(e) => set("datum", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Uhrzeit</Label><Input type="time" value={draft.uhrzeit} onChange={(e) => set("uhrzeit", e.target.value)} /></div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Vertreter Auftraggeber</Label><Input value={draft.vertreterAuftraggeber} onChange={(e) => set("vertreterAuftraggeber", e.target.value)} placeholder="Name in Druckbuchstaben" /></div>
        <div className="space-y-1.5"><Label>Vertreter Auftragnehmer</Label><Input value={draft.vertreterAuftragnehmer} onChange={(e) => set("vertreterAuftragnehmer", e.target.value)} placeholder="Name in Druckbuchstaben" /></div>
      </div>
      <div className="space-y-1.5"><Label>Leistungsumfang</Label><Textarea rows={3} value={draft.leistungsumfang} onChange={(e) => set("leistungsumfang", e.target.value)} /></div>
      <div className="space-y-1.5"><Label>Mängel / Bemerkungen</Label><Textarea rows={3} value={draft.bemerkungen} onChange={(e) => set("bemerkungen", e.target.value)} placeholder="Keine." /></div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={draft.ohneVorbehalt} onCheckedChange={(v) => set("ohneVorbehalt", v === true)} />
        Abnahme erfolgt ohne Vorbehalt
      </label>
    </div>
  );
}
