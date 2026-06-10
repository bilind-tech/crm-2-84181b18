// Wiederverwendbarer Kunden- (+ optional Objekt-) Picker für Werkzeuge.
// Bewusst simpel: native Select statt Combobox, damit Setup minimal bleibt.
import { useEffect, useMemo } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useKunden, useObjekte } from "@/hooks/useApi";
import type { Kunde, Objekt } from "@/lib/api/types";
import { KundePicker } from "@/components/forms/KundePicker";

interface Props {
  kundeId: string | undefined;
  objektId?: string | undefined;
  onKundeChange: (kunde: Kunde | undefined) => void;
  onObjektChange?: (objekt: Objekt | undefined) => void;
  showObjekt?: boolean;
}

export function kundenAnzeige(k: Kunde): string {
  if (k.typ === "firma" && k.firmenname) return k.firmenname;
  return [k.vorname, k.nachname].filter(Boolean).join(" ") || k.nummer;
}

export function KundenObjektPicker({
  kundeId,
  objektId,
  onKundeChange,
  onObjektChange,
  showObjekt = true,
}: Props) {
  const kundenQ = useKunden({ archiviert: false });
  const objekteQ = useObjekte(showObjekt ? kundeId : undefined);

  const kunden = useMemo(
    () =>
      [...(kundenQ.data ?? [])].sort((a, b) => kundenAnzeige(a).localeCompare(kundenAnzeige(b))),
    [kundenQ.data],
  );
  const objekte = objekteQ.data ?? [];

  // Wenn der gewählte Kunde wechselt und das alte Objekt nicht mehr passt → reset.
  useEffect(() => {
    if (!showObjekt || !objektId) return;
    if (!objekte.some((o) => o.id === objektId)) onObjektChange?.(undefined);
  }, [objekte, objektId, showObjekt, onObjektChange]);

  return (
    <div className={showObjekt ? "grid gap-3 sm:grid-cols-2" : "grid gap-3 sm:max-w-md"}>
      <div className="space-y-1.5">
        <Label>Kunde *</Label>
        <KundePicker
          kunden={kunden}
          value={kundeId || undefined}
          onChange={(v) => onKundeChange(kunden.find((k) => k.id === v))}
          placeholder="Kunde auswählen …"
        />
      </div>

      {showObjekt && (
        <div className="space-y-1.5">
          <Label>Objekt (optional)</Label>
          <Select
            value={objektId ?? ""}
            onValueChange={(v) => onObjektChange?.(v ? objekte.find((o) => o.id === v) : undefined)}
            disabled={!kundeId || objekte.length === 0}
          >
            <SelectTrigger>
              <SelectValue
                placeholder={
                  !kundeId
                    ? "Erst Kunde wählen"
                    : objekte.length === 0
                      ? "Keine Objekte"
                      : "Objekt auswählen …"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {objekte.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
