// Tab "Backup & Download": Auto-Backup + Historie + manuelle Exporte.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Download, Database } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  useBackup,
  useUpdateBackup,
  useCreateBackup,
  useBackupHistorie,
} from "@/hooks/useApi";
import type { BackupEinstellungen } from "@/lib/api/types";
import { Field, Section, StickySaveBar } from "./_shared";
import { LoadingPlaceholder } from "@/components/layout/LoadingPlaceholder";

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function BackupTab() {
  const { data, isLoading } = useBackup();
  const { data: historie = [] } = useBackupHistorie();
  const update = useUpdateBackup();
  const create = useCreateBackup();
  const [form, setForm] = useState<BackupEinstellungen | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (isLoading || !form || !data) return <LoadingPlaceholder />;

  const dirty = JSON.stringify(form) !== JSON.stringify(data);

  const save = () =>
    update.mutate(form, { onSuccess: () => toast.success("Backup-Einstellungen gespeichert") });

  return (
    <div className="space-y-5 pb-24">
      <Section title="Automatische Backups" description="Tägliches SQLite-Snapshot auf USB-SSD.">
        <label className="mb-4 flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 p-4">
          <div>
            <p className="text-sm font-medium">Auto-Backup aktiv</p>
            <p className="text-xs text-muted-foreground">
              Sicherung läuft jede Nacht zur unten angegebenen Uhrzeit.
            </p>
          </div>
          <Switch
            checked={form.autoBackup}
            onCheckedChange={(v) => setForm({ ...form, autoBackup: v })}
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Uhrzeit">
            <Input
              type="time"
              value={form.zeitpunkt}
              onChange={(e) => setForm({ ...form, zeitpunkt: e.target.value })}
              disabled={!form.autoBackup}
            />
          </Field>
          <Field label="Aufbewahrung (Anzahl)">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              value={form.behaltenAnzahl}
              onChange={(e) => setForm({ ...form, behaltenAnzahl: Number(e.target.value) })}
              disabled={!form.autoBackup}
            />
          </Field>
          <Field label="Zielordner (auf Pi)">
            <Input
              value={form.zielordner}
              onChange={(e) => setForm({ ...form, zielordner: e.target.value })}
              className="font-mono"
            />
          </Field>
        </div>
      </Section>

      <Section title="Backup-Historie">
        <div className="mb-3 flex justify-end">
          <Button
            size="sm"
            onClick={() =>
              create.mutate(undefined, {
                onSuccess: (res) =>
                  res.erfolg
                    ? toast.success(res.nachricht)
                    : toast.error(res.nachricht),
              })
            }
            disabled={create.isPending}
          >
            {create.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Database className="mr-1.5 h-4 w-4" />
            )}
            Jetzt sichern
          </Button>
        </div>

        {historie.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Noch keine Backups erstellt.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {historie.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {new Date(b.zeitpunkt).toLocaleString("de-DE")}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {b.dateiname} · {formatBytes(b.groesseBytes)} ·{" "}
                    {b.status === "erfolg" ? "OK" : `Fehler: ${b.fehler ?? "?"}`}
                  </p>
                </div>
                <Button variant="ghost" size="sm" disabled>
                  <Download className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Daten-Export" description="Lade alle Daten als JSON oder CSV herunter.">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => exportJson()}>
            <Download className="mr-1.5 h-4 w-4" /> Alles als JSON
          </Button>
          <Button variant="outline" onClick={() => toast.info("Wird im nächsten Schritt angeschlossen.")}>
            <Download className="mr-1.5 h-4 w-4" /> Kunden als CSV
          </Button>
          <Button variant="outline" onClick={() => toast.info("Wird im nächsten Schritt angeschlossen.")}>
            <Download className="mr-1.5 h-4 w-4" /> Rechnungen als CSV
          </Button>
        </div>
      </Section>

      <StickySaveBar
        dirty={dirty}
        saving={update.isPending}
        onReset={() => setForm(data)}
        onSave={save}
      />
    </div>
  );
}

function exportJson() {
  try {
    const raw = window.localStorage.getItem("mcc.crm.db");
    const blob = new Blob([raw ?? "{}"], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mcc-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Export gestartet");
  } catch {
    toast.error("Export fehlgeschlagen");
  }
}
