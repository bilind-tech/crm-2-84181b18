// Settings-Tab für Steuer-Konfiguration (Sätze, Hebesatz, Rhythmus).

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
import { useSteuerEinstellungen } from "@/lib/steuern/store";
import { Info } from "lucide-react";
import { toast } from "sonner";

export function SteuerTab() {
  const { data, update, reset } = useSteuerEinstellungen();

  const effektivSatz =
    data.kstSatz +
    (data.kstSatz * data.soliSatz) / 100 +
    data.gewstMesszahl * (data.gewstHebesatz / 100);

  return (
    <div className="space-y-5 pb-24">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-lg font-semibold">Steuersätze</h2>
          <p className="text-sm text-muted-foreground">
            GmbH-Defaults für Sankt Augustin. Änderungen wirken sofort auf alle Schätzungen.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Körperschaftsteuer (%)</Label>
            <Input
              type="number"
              step="0.01"
              value={data.kstSatz}
              onChange={(e) => update({ kstSatz: Number(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Default 15 % (§ 23 KStG)</p>
          </div>
          <div className="space-y-1.5">
            <Label>Soli auf KSt (%)</Label>
            <Input
              type="number"
              step="0.01"
              value={data.soliSatz}
              onChange={(e) => update({ soliSatz: Number(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Default 5,5 % der KSt</p>
          </div>
          <div className="space-y-1.5">
            <Label>Gewerbesteuer-Messzahl (%)</Label>
            <Input
              type="number"
              step="0.01"
              value={data.gewstMesszahl}
              onChange={(e) => update({ gewstMesszahl: Number(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Default 3,5 %</p>
          </div>
          <div className="space-y-1.5">
            <Label>Hebesatz Gemeinde (%)</Label>
            <Input
              type="number"
              step="1"
              value={data.gewstHebesatz}
              onChange={(e) => update({ gewstHebesatz: Number(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">
              Sankt Augustin 525 % (seit 01.01.2025)
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex items-start gap-2 text-xs">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <p>
              <span className="font-semibold text-foreground">Effektive Gesamtbelastung GmbH:</span>{" "}
              {effektivSatz.toFixed(2)} % vom Gewinn (KSt + Soli + GewSt)
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-5">
          <h2 className="text-lg font-semibold">USt-Voranmeldung</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Rhythmus</Label>
            <Select
              value={data.ustRhythmus}
              onValueChange={(v) =>
                update({ ustRhythmus: v as "monatlich" | "quartalsweise" | "jaehrlich" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="monatlich">Monatlich</SelectItem>
                <SelectItem value="quartalsweise">Quartalsweise</SelectItem>
                <SelectItem value="jaehrlich">Jährlich</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Neugründung & Zahllast &gt; 9.000 € → monatlich
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Vorsteuer-Puffer (%)</Label>
            <Input
              type="number"
              step="1"
              min="0"
              max="50"
              value={data.ustPufferSatz}
              onChange={(e) => update({ ustPufferSatz: Math.max(0, Math.min(50, Number(e.target.value))) })}
            />
            <p className="text-xs text-muted-foreground">
              Reduziert die USt-Schuld pauschal. Default 10 % — deckt Belege ab, die noch nicht erfasst sind (Auto, Material, etc.).
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Liquiditätsrücklage (%)</Label>
            <Input
              type="number"
              step="1"
              value={data.ruecklageSatz}
              onChange={(e) => update({ ruecklageSatz: Number(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">Default 35 % vom YTD-Gewinn</p>
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => {
            reset();
            toast.success("Auf Defaults zurückgesetzt");
          }}
        >
          Auf Defaults zurücksetzen
        </Button>
      </div>
    </div>
  );
}
