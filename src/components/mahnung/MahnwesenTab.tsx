// Mahnwesen-Einstellungen: 3 Stufen (Frist, Gebühr, Karenz, E-Mail-Vorlage)
// + globaler Auto-Vorschlag-Toggle. Speichert via useUpdateMahnEinstellungen.

import { useEffect, useState } from "react";
import { Save as SaveIcon, Bell } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useEmailVorlagen,
  useMahnEinstellungen,
  useMahnJetztPruefen,
  useMahnStatus,
  useUpdateMahnEinstellungen,
} from "@/hooks/useApi";
import type { MahnEinstellungen, MahnModus, MahnStufe, MahnStufeConfig } from "@/lib/api/types";
import { MahnLaeufeListe } from "./MahnLaeufeListe";

export function MahnwesenTab() {
  const { data, isLoading } = useMahnEinstellungen();
  const { data: vorlagen = [] } = useEmailVorlagen();
  const update = useUpdateMahnEinstellungen();

  const [form, setForm] = useState<MahnEinstellungen | null>(null);
  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (isLoading || !form) {
    return (
      <div className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
        Lade Mahnwesen-Einstellungen …
      </div>
    );
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(data);

  const updateStufe = (stufe: MahnStufe, patch: Partial<MahnStufeConfig>) => {
    setForm((f) =>
      f
        ? {
            ...f,
            stufen: f.stufen.map((s) => (s.stufe === stufe ? { ...s, ...patch } : s)),
          }
        : f,
    );
  };

  const mahnVorlagen = vorlagen.filter((v) => v.kontext === "mahnung");

  const handleSave = () => {
    update.mutate(form, {
      onSuccess: () => toast.success("Mahnwesen-Einstellungen gespeichert"),
    });
  };

  return (
    <div className="space-y-5 pb-20">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Bell className="h-4 w-4 text-warning" />
          <h2 className="text-lg font-semibold">Mahnwesen</h2>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          Drei Eskalationsstufen mit eigenen Fristen, Gebühren und E-Mail-Vorlagen. „Tage nach
          Vorgänger" zählt bei Stufe 1 ab Fälligkeit, bei Stufe 2 und 3 ab dem Ablauf der vorherigen
          Mahn-Frist.
        </p>

        <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 p-4">
          <div>
            <p className="text-sm font-medium">Automatische Vorschläge</p>
            <p className="text-xs text-muted-foreground">
              Empfiehlt im Cockpit und auf Rechnungen automatisch die nächste Stufe.
            </p>
          </div>
          <Switch
            checked={form.autoVorschlagAktiv}
            onCheckedChange={(v) => setForm({ ...form, autoVorschlagAktiv: v })}
          />
        </div>
      </div>

      <AutomatikKarte form={form} setForm={setForm} />

      <MahnLaeufeListe />

      {form.stufen
        .slice()
        .sort((a, b) => a.stufe - b.stufe)
        .map((stufe) => (
          <StufenKarte
            key={stufe.stufe}
            stufe={stufe}
            vorlagen={mahnVorlagen.map((v) => ({ id: v.id, name: v.name }))}
            onChange={(patch) => updateStufe(stufe.stufe, patch)}
          />
        ))}

      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:left-[var(--sidebar-width,16rem)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Gilt rückwirkend für alle offenen Rechnungen.
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="rounded-full px-5"
              onClick={() => data && setForm(data)}
              disabled={!dirty}
            >
              Zurücksetzen
            </Button>
            <Button
              className="gap-1.5 rounded-full px-5 shadow-sm"
              onClick={handleSave}
              disabled={!dirty || update.isPending}
            >
              <SaveIcon className="h-4 w-4" /> Speichern
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function StufenKarte({
  stufe,
  vorlagen,
  onChange,
}: {
  stufe: MahnStufeConfig;
  vorlagen: { id: string; name: string }[];
  onChange: (patch: Partial<MahnStufeConfig>) => void;
}) {
  const karenzLabel =
    stufe.stufe === 1 ? "Tage nach Fälligkeit" : "Tage nach Frist der vorherigen Mahnung";

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-5 flex items-center gap-3">
        <div className="grid h-9 w-9 place-content-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {stufe.stufe}
        </div>
        <div className="flex-1">
          <Input
            value={stufe.bezeichnung}
            onChange={(e) => onChange({ bezeichnung: e.target.value })}
            className="h-9 text-base font-semibold"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">{karenzLabel}</Label>
          <Input
            type="number"
            min={0}
            value={stufe.tageNachVorgaenger}
            onChange={(e) => onChange({ tageNachVorgaenger: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Mahngebühr (€)</Label>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={stufe.gebuehr}
            onChange={(e) => onChange({ gebuehr: Number(e.target.value) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Neue Frist (Tage ab Versand)</Label>
          <Input
            type="number"
            min={1}
            value={stufe.fristTage}
            onChange={(e) => onChange({ fristTage: Number(e.target.value) })}
          />
        </div>
      </div>

      <div className="mt-4 space-y-1.5">
        <Label className="text-xs font-medium">E-Mail-Vorlage</Label>
        <Select
          value={stufe.emailVorlageId ?? "__auto"}
          onValueChange={(v) => onChange({ emailVorlageId: v === "__auto" ? undefined : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Automatisch wählen" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__auto">Automatisch (Standard für Mahnung)</SelectItem>
            {vorlagen.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function AutomatikKarte({
  form,
  setForm,
}: {
  form: MahnEinstellungen;
  setForm: (f: MahnEinstellungen) => void;
}) {
  const status = useMahnStatus();
  const pruefen = useMahnJetztPruefen();

  const setM = (patch: Partial<MahnEinstellungen>) => setForm({ ...form, ...patch });

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Bell className="h-4 w-4 text-primary" />
        <h2 className="text-lg font-semibold">Mahnwesen</h2>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Mahnungen werden <strong>nicht automatisch verschickt</strong>. Im Modus „Vorschlag" erzeugt
        das System nur einen Hinweis im Cockpit; den eigentlichen Versand löst du manuell im
        jeweiligen Rechnungs-Detail aus.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Modus</Label>
          <Select
            value={form.modus === "auto" ? "vorschlag" : form.modus}
            onValueChange={(v) => setM({ modus: v as MahnModus })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="aus">Aus</SelectItem>
              <SelectItem value="vorschlag">Vorschlag (nur Hinweis)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Auto-Versand ist deaktiviert — diese App verschickt grundsätzlich keine E-Mails ohne
            deine ausdrückliche Bestätigung.
          </p>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted-foreground">
          {status.data?.letzterLauf
            ? `Letzter Lauf: ${new Date(status.data.letzterLauf.gestartetAm).toLocaleString("de-DE")} — ${status.data.letzterLauf.versendet} versendet, ${status.data.letzterLauf.vorschlaege} Vorschläge, ${status.data.letzterLauf.fehler} Fehler`
            : "Noch kein Lauf"}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          disabled={pruefen.isPending}
          onClick={() => {
            pruefen.mutate(undefined, {
              onSuccess: (r) =>
                toast.success(
                  `Lauf abgeschlossen: ${r.versendet} versendet, ${r.vorschlaege} Vorschläge`,
                ),
              onError: () => toast.error("Lauf fehlgeschlagen"),
            });
          }}
        >
          {pruefen.isPending ? "Prüfe …" : "Jetzt prüfen"}
        </Button>
      </div>
    </div>
  );
}
