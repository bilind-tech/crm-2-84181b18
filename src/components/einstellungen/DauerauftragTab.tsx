import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  useDauerauftragEinstellungen,
  useUpdateDauerauftragEinstellungen,
} from "@/hooks/useDauerauftraege";
import type { DauerauftragEinstellungen, DauerauftragModus, DauerauftragStichtag } from "@/lib/api/types";

export function DauerauftragTab() {
  const { data } = useDauerauftragEinstellungen();
  const update = useUpdateDauerauftragEinstellungen();
  const [form, setForm] = useState<DauerauftragEinstellungen | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (!form) return <p className="text-sm text-muted-foreground">Lade …</p>;

  const dirty = JSON.stringify(form) !== JSON.stringify(data);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Standardeinstellungen für Daueraufträge</h2>
          <p className="text-sm text-muted-foreground">
            Werden bei neuen Daueraufträgen vorausgewählt.
          </p>
        </div>

        <div>
          <Label className="text-xs font-medium">Standard-Modus</Label>
          <div className="mt-2 flex gap-2">
            {(["entwurf", "vollautomatisch"] as DauerauftragModus[]).map((m) => (
              <button
                key={m}
                onClick={() => setForm({ ...form, defaultModus: m })}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                  form.defaultModus === m
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {m === "entwurf" ? "Entwurf zur Freigabe" : "Vollautomatisch versenden"}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            Vollautomatik versendet Rechnungen ohne Klick — nutze sie nur für stabile,
            geprüfte Daueraufträge.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label className="text-xs font-medium">Standard-Stichtag</Label>
            <select
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.defaultStichtag.typ}
              onChange={(e) =>
                setForm({
                  ...form,
                  defaultStichtag: {
                    ...form.defaultStichtag,
                    typ: e.target.value as DauerauftragStichtag["typ"],
                  },
                })
              }
            >
              <option value="monatstag">Tag im Monat</option>
              <option value="monatsletzter">Letzter Monatstag</option>
              <option value="quartalstag">Tag im Quartalsmonat</option>
            </select>
          </div>
          <div>
            <Label className="text-xs font-medium">Tag (1–28)</Label>
            <Input
              type="number"
              min={1}
              max={28}
              disabled={form.defaultStichtag.typ === "monatsletzter"}
              value={form.defaultStichtag.wert ?? 1}
              onChange={(e) =>
                setForm({
                  ...form,
                  defaultStichtag: {
                    ...form.defaultStichtag,
                    wert: Number(e.target.value) || 1,
                  },
                })
              }
              className="mt-1.5"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <Button
          disabled={!dirty}
          onClick={() =>
            update.mutate(form, { onSuccess: () => toast.success("Einstellungen gespeichert") })
          }
        >
          <Save className="mr-1.5 h-4 w-4" /> Speichern
        </Button>
      </div>
    </div>
  );
}
