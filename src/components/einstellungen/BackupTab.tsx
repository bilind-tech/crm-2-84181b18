// =============================================================================
// Tab "Backup & Wiederherstellen"
// =============================================================================
// FRONTEND-STUB-HINWEIS:
// Aktuell wird kein echtes SQLite-Backup geschrieben. Alle Backups sind
// In-Memory-Mocks im localStorage (siehe src/lib/mock/backend.ts).
//
// Das spätere Pi-Backend MUSS:
//   - status="erfolg" + abgeschlossenAm erst setzen, wenn die .sqlite.gz
//     wirklich auf der USB-SSD liegt (atomar via fs.rename)
//   - sqlite3 .backup-API verwenden (verträgt sich mit aktiven Schreibern)
//   - Rotation: behaltenDaily/Weekly/Monthly hart durchsetzen
//   - Drive-Spiegel asynchron im Hintergrund (driveStatus pending → synced)
//   - Bei Restore: VORHER pre-restore-Backup, dann Service stoppen, Datei
//     entpacken, atomar nach data.sqlite, Service neu starten
// =============================================================================
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Download,
  Database,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  RotateCcw,
  Upload,
  Cloud,
  CloudOff,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  useBackup,
  useUpdateBackup,
  useCreateBackup,
  useBackupHistorie,
  useBackupInArbeit,
  useRestoreStatus,
  useRestoreBackup,
  useUploadBackup,
  useRestoreUploadedBackup,
  useDeleteBackup,
} from "@/hooks/useApi";
import type { BackupEinstellungen, BackupEintrag } from "@/lib/api/types";
import { Field, Section, StickySaveBar } from "./_shared";
import { LoadingPlaceholder } from "@/components/layout/LoadingPlaceholder";
import { RestoreBackupDialog } from "./RestoreBackupDialog";
import { BackupUploadDropzone } from "./BackupUploadDropzone";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "@/hooks/useApi";
import { getBackendUrl } from "@/lib/api/backendUrl";
import { cn } from "@/lib/utils";

function formatBytes(b: number): string {
  if (!b) return "—";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function formatRelativeShort(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "gerade eben";
  if (m < 60) return `vor ${m} Min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `vor ${h} Std`;
  const d = Math.floor(h / 24);
  return `vor ${d} Tag${d === 1 ? "" : "en"}`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function BackupTab() {
  const { data, isLoading } = useBackup();
  const { data: historie = [] } = useBackupHistorie();
  const { data: laufendeBackups = [] } = useBackupInArbeit();
  const { data: restoreState } = useRestoreStatus();
  const update = useUpdateBackup();
  const create = useCreateBackup();
  const restore = useRestoreBackup();
  const uploadBackup = useUploadBackup();
  const restoreUpload = useRestoreUploadedBackup();
  const deleteBackup = useDeleteBackup();
  const qc = useQueryClient();
  const [form, setForm] = useState<BackupEinstellungen | null>(null);
  const [restoreTarget, setRestoreTarget] = useState<BackupEintrag | null>(null);
  const [uploadPreview, setUploadPreview] = useState<{
    uploadId: string;
    fileName: string;
    sizeBytes: number;
    vermutetesDatum?: string;
  } | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  // Wenn Live-Backup fertig wird, Historie sofort neu laden
  const inArbeitCount = laufendeBackups.length;
  useEffect(() => {
    if (inArbeitCount === 0) {
      qc.invalidateQueries({ queryKey: qk.einstellungen.backupHistorie });
    }
  }, [inArbeitCount, qc]);

  // Wenn Restore fertig wird, Historie sofort neu laden
  const restorePhase = restoreState?.restore?.phase;
  useEffect(() => {
    if (restorePhase === "done") {
      qc.invalidateQueries({ queryKey: qk.einstellungen.backupHistorie });
      toast.success("Wiederherstellung abgeschlossen.");
    }
    if (restorePhase === "rollback" || restorePhase === "error") {
      toast.error("Wiederherstellung fehlgeschlagen — vorheriger Stand wurde wiederhergestellt.");
    }
  }, [restorePhase, qc]);

  // WICHTIG: Alle Hooks müssen VOR dem ersten frühen Return stehen,
  // sonst React-Error #310 (Rules of Hooks).
  const letztes = useMemo(() => {
    const erf = historie.filter((b) => b.status === "erfolg");
    return (
      [...erf].sort(
        (a, b) => (b.abgeschlossenAm ?? "").localeCompare(a.abgeschlossenAm ?? ""),
      )[0] ?? null
    );
  }, [historie]);

  if (isLoading || !form || !data) return <LoadingPlaceholder />;

  const dirty = JSON.stringify(form) !== JSON.stringify(data);

  const inArbeit = laufendeBackups;
  const erfolge = historie.filter((b) => b.status === "erfolg");
  const dailies = erfolge.filter((b) => b.kategorie === "daily");
  const weeklies = erfolge.filter((b) => b.kategorie === "weekly");
  const monthlies = erfolge.filter((b) => b.kategorie === "monthly");
  const sondern = erfolge.filter(
    (b) => b.kategorie === "manuell" || b.kategorie === "manual"
      || b.kategorie === "pre-restore" || b.kategorie === "pre-update",
  );
  const hatLaufendes = inArbeit.length > 0;
  const maintenanceActive = !!restoreState?.maintenance.active;

  const save = () =>
    update.mutate(form, { onSuccess: () => toast.success("Backup-Einstellungen gespeichert") });

  const startManuell = () =>
    create.mutate(undefined, {
      onSuccess: () => toast.info("Backup wird erstellt …"),
      onError: (e) => toast.error(`Backup fehlgeschlagen: ${(e as Error).message}`),
    });

  const handleDownload = (b: BackupEintrag) => {
    // Echter Stream-Download vom Pi-Backend.
    // Cookies (credentials) werden über das anchor mitgesendet, weil das Backend
    // auf derselben Origin liegt (LAN). Bei Cross-Origin müsste man via fetch+blob laden.
    const url = `${getBackendUrl()}/backup/${b.id}/download`;
    const a = document.createElement("a");
    a.href = url;
    a.download = b.dateiname;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleDelete = (b: BackupEintrag) => {
    if (!confirm(`Backup „${b.dateiname}" wirklich löschen?`)) return;
    deleteBackup.mutate(b.id, {
      onSuccess: () => toast.success("Backup gelöscht"),
      onError: (e) => toast.error((e as Error).message),
    });
  };

  return (
    <div className="space-y-5 pb-24">
      {/* ─── Status-Karte ────────────────────────────────────────────── */}
      <BackupStatusCard
        letztes={letztes}
        zeitpunkt={form.zeitpunkt}
        autoBackup={form.autoBackup}
      />

      {/* ─── Restore-Banner (Wartungsmodus) ───────────────────────────── */}
      {(maintenanceActive || (restoreState?.restore && restoreState.restore.phase !== "done")) && restoreState?.restore && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 animate-spin text-amber-600" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Wiederherstellung läuft … ({restoreState.restore.phase})</p>
              <p className="text-xs text-muted-foreground">
                {restoreState.restore.message ?? "Backend befindet sich im Wartungsmodus, bitte warten."}
              </p>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-amber-500/20">
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{ width: `${Math.max(5, restoreState.restore.percent)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── In-Arbeit-Indikator ─────────────────────────────────────── */}
      {inArbeit.length > 0 && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
          {inArbeit.map((b) => (
            <div key={b.id} className="flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  Backup läuft … <span className="text-muted-foreground font-normal">({b.phase})</span>
                </p>
                <p className="text-xs text-muted-foreground">
                  Gestartet {formatRelativeShort(b.zeitpunktStart)} ·{" "}
                  {b.kategorie === "pre-restore"
                    ? "Sicherheitsbackup vor Wiederherstellung"
                    : b.kategorie === "pre-update"
                      ? "Sicherheitsbackup vor Update"
                      : "Manuelles Backup"}
                  {b.message ? ` · ${b.message}` : ""}
                </p>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-primary/20">
                  <div
                    className="h-full bg-primary transition-all"
                    style={{ width: `${Math.max(5, b.percent)}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Manuelle Aktion ─────────────────────────────────────────── */}
      <Section title="Backup jetzt erstellen" description="Erzeugt sofort eine Sicherung — unabhängig vom Zeitplan.">
        <Button onClick={startManuell} disabled={create.isPending || hatLaufendes}>
          {create.isPending || hatLaufendes ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Database className="mr-1.5 h-4 w-4" />
          )}
          Jetzt sichern
        </Button>
      </Section>

      {/* ─── Historie mit Rotation ──────────────────────────────────── */}
      <Section title="Backup-Historie" description="Tagesweise · Wochenweise · Monatsweise · Sonderbackups.">
        <BackupGroupList
          titel={`Letzte 7 Tage`}
          eintraege={dailies}
          onRestore={setRestoreTarget}
          onDownload={handleDownload}
        />
        <BackupGroupList
          titel={`Letzte 4 Wochen`}
          eintraege={weeklies}
          onRestore={setRestoreTarget}
          onDownload={handleDownload}
        />
        <BackupGroupList
          titel={`Letzte 12 Monate`}
          eintraege={monthlies}
          onRestore={setRestoreTarget}
          onDownload={handleDownload}
        />
        {sondern.length > 0 && (
          <BackupGroupList
            titel="Sonderbackups (manuell, vor Restore, vor Update)"
            eintraege={sondern}
            onRestore={setRestoreTarget}
            onDownload={handleDownload}
            onDelete={handleDelete}
          />
        )}
        {erfolge.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Noch keine abgeschlossenen Backups.
          </p>
        )}
      </Section>

      {/* ─── Backup-Datei einspielen ────────────────────────────────── */}
      <Section
        title="Backup-Datei einspielen"
        description="Stelle einen Stand aus einer heruntergeladenen Backup-Datei wieder her."
      >
        {!uploadPreview ? (
          <BackupUploadDropzone
            onFile={(f) => {
              uploadBackup.mutate(f, {
                onSuccess: (info) => {
                  if (!info.valide) {
                    toast.error("Diese Datei sieht nicht wie ein Backup aus.");
                    return;
                  }
                  setUploadPreview(info);
                },
              });
            }}
            disabled={uploadBackup.isPending}
          />
        ) : (
          <div className="rounded-xl border border-border bg-muted/30 p-4">
            <div className="flex items-start gap-3">
              <Database className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{uploadPreview.fileName}</p>
                <p className="text-xs text-muted-foreground">
                  {formatBytes(uploadPreview.sizeBytes)}
                  {uploadPreview.vermutetesDatum && ` · vom ${uploadPreview.vermutetesDatum}`}
                </p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setUploadPreview(null)}>
                Andere Datei wählen
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  setRestoreTarget({
                    id: uploadPreview.uploadId,
                    zeitpunkt: uploadPreview.vermutetesDatum
                      ? `${uploadPreview.vermutetesDatum}T00:00:00.000Z`
                      : new Date().toISOString(),
                    zeitpunktStart: new Date().toISOString(),
                    abgeschlossenAm: new Date().toISOString(),
                    kategorie: "manuell",
                    ausloeser: "manuell",
                    groesseBytes: uploadPreview.sizeBytes,
                    status: "erfolg",
                    dateiname: uploadPreview.fileName,
                  });
                }}
              >
                <RotateCcw className="mr-1.5 h-4 w-4" />
                Diesen Stand wiederherstellen
              </Button>
            </div>
          </div>
        )}
      </Section>

      {/* ─── Einstellungen ──────────────────────────────────────────── */}
      <Section title="Automatische Backups" description="Tägliches SQLite-Snapshot auf USB-SSD mit Rotation.">
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

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Uhrzeit">
            <Input
              type="time"
              value={form.zeitpunkt}
              onChange={(e) => setForm({ ...form, zeitpunkt: e.target.value })}
              disabled={!form.autoBackup}
            />
          </Field>
          <Field label="Zielordner (auf Pi)" hint="Wird beim ersten Lauf angelegt.">
            <Input
              value={form.zielordner}
              onChange={(e) => setForm({ ...form, zielordner: e.target.value })}
              className="font-mono text-xs"
            />
          </Field>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <Field label="Tages-Backups behalten" hint="Eines pro Tag.">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={30}
              value={form.behaltenDaily}
              onChange={(e) =>
                setForm({
                  ...form,
                  behaltenDaily: Number(e.target.value),
                  behaltenAnzahl: Number(e.target.value),
                })
              }
              disabled={!form.autoBackup}
            />
          </Field>
          <Field label="Wochen-Backups behalten" hint="Sonntag.">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={26}
              value={form.behaltenWeekly}
              onChange={(e) => setForm({ ...form, behaltenWeekly: Number(e.target.value) })}
              disabled={!form.autoBackup}
            />
          </Field>
          <Field label="Monats-Backups behalten" hint="1. d. Monats.">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={36}
              value={form.behaltenMonthly}
              onChange={(e) => setForm({ ...form, behaltenMonthly: Number(e.target.value) })}
              disabled={!form.autoBackup}
            />
          </Field>
        </div>

        <label className="mt-4 flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 p-4">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium">
              <Cloud className="h-4 w-4 text-muted-foreground" />
              Backups zusätzlich nach Google Drive spiegeln
            </p>
            <p className="text-xs text-muted-foreground">
              Erfordert eine verbundene Drive-Anbindung in Einstellungen → Google Drive.
            </p>
          </div>
          <Switch
            checked={form.driveSpiegel}
            onCheckedChange={(v) => setForm({ ...form, driveSpiegel: v })}
          />
        </label>
      </Section>

      <StickySaveBar
        dirty={dirty}
        saving={update.isPending}
        onReset={() => setForm(data)}
        onSave={save}
      />

      {restoreTarget && (
        <RestoreBackupDialog
          backup={restoreTarget}
          open
          onClose={() => setRestoreTarget(null)}
          isUploadRestore={!!uploadPreview && restoreTarget.id === uploadPreview.uploadId}
          onConfirm={(b, passwort) => {
            const isUpload = !!uploadPreview && b.id === uploadPreview.uploadId;
            const fn = isUpload
              ? () => restoreUpload.mutateAsync({ uploadId: b.id, passwort })
              : () => restore.mutateAsync({ backupId: b.id, passwort });
            return fn().then(() => {
              toast.success(`Wiederhergestellt: Stand ${formatDateTime(b.zeitpunktStart)}`);
              setRestoreTarget(null);
              setUploadPreview(null);
            });
          }}
        />
      )}
    </div>
  );
}

// =============================================================================
// Status-Karte
// =============================================================================
function BackupStatusCard({
  letztes,
  zeitpunkt,
  autoBackup,
}: {
  letztes: BackupEintrag | null;
  zeitpunkt: string;
  autoBackup: boolean;
}) {
  let tone: "ok" | "warn" | "err" | "neutral" = "neutral";
  let title = "Noch kein Backup vorhanden";
  let detail = "Erstelle dein erstes Backup über den Knopf unten.";
  let Icon = ShieldAlert;

  if (letztes && letztes.abgeschlossenAm) {
    const ageH = (Date.now() - new Date(letztes.abgeschlossenAm).getTime()) / 3_600_000;
    if (ageH > 25 && autoBackup) {
      tone = "warn";
      title = "Letztes Backup älter als 24 Stunden";
      detail = `${formatDateTime(letztes.abgeschlossenAm)} · ${formatBytes(letztes.groesseBytes)}`;
      Icon = AlertTriangle;
    } else {
      tone = "ok";
      title = "Letztes Backup erfolgreich";
      detail = `${formatDateTime(letztes.abgeschlossenAm)} · ${formatRelativeShort(letztes.abgeschlossenAm)} · ${formatBytes(letztes.groesseBytes)}`;
      Icon = CheckCircle2;
    }
  }

  const naechstes = autoBackup ? `heute, ${zeitpunkt} Uhr` : "Auto-Backup deaktiviert";

  const styles = {
    ok: "border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400",
    warn: "border-amber-500/30 bg-amber-500/5 text-amber-700 dark:text-amber-400",
    err: "border-destructive/30 bg-destructive/5 text-destructive",
    neutral: "border-border bg-muted/30 text-foreground",
  }[tone];

  return (
    <div className={cn("rounded-2xl border p-5", styles)}>
      <div className="flex items-start gap-4">
        <Icon className="mt-0.5 h-6 w-6 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-base font-semibold">{title}</p>
          <p className="mt-0.5 text-sm opacity-90">{detail}</p>
          {letztes?.dateiname && (
            <p className="mt-0.5 truncate font-mono text-xs opacity-70">{letztes.dateiname}</p>
          )}
          <p className="mt-3 text-xs opacity-80">
            <Clock className="mr-1 inline h-3 w-3" />
            Nächstes Backup: {naechstes}
          </p>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// Gruppierte Listen-Anzeige mit Restore- & Download-Aktionen
// =============================================================================
function BackupGroupList({
  titel,
  eintraege,
  onRestore,
  onDownload,
  onDelete,
}: {
  titel: string;
  eintraege: BackupEintrag[];
  onRestore: (b: BackupEintrag) => void;
  onDownload: (b: BackupEintrag) => void;
  onDelete?: (b: BackupEintrag) => void;
}) {
  if (eintraege.length === 0) return null;
  const sorted = [...eintraege].sort(
    (a, b) => (b.abgeschlossenAm ?? "").localeCompare(a.abgeschlossenAm ?? ""),
  );
  const isDeletable = (b: BackupEintrag): boolean =>
    b.kategorie === "manuell" || b.kategorie === "manual"
      || b.kategorie === "pre-restore" || b.kategorie === "pre-update";
  return (
    <div className="mb-4 last:mb-0">
      <p className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {titel} · {sorted.length}
      </p>
      <ul className="divide-y divide-border rounded-xl border border-border bg-card">
        {sorted.map((b) => (
          <li key={b.id} className="flex items-center gap-3 px-3 py-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {formatDateTime(b.abgeschlossenAm ?? b.zeitpunktStart)}
              </p>
              <p className="truncate font-mono text-[10px] text-muted-foreground">
                {b.dateiname} · {formatBytes(b.groesseBytes)}
              </p>
            </div>
            {b.driveStatus && (
              <span title={`Google Drive: ${b.driveStatus}`}>
                {b.driveStatus === "synced" ? (
                  <Cloud className="h-3.5 w-3.5 text-muted-foreground" />
                ) : b.driveStatus === "error" ? (
                  <CloudOff className="h-3.5 w-3.5 text-destructive" />
                ) : (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                )}
              </span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              title="Herunterladen"
              onClick={() => onDownload(b)}
            >
              <Download className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-amber-600 hover:bg-amber-500/10 hover:text-amber-700"
              title="Wiederherstellen"
              onClick={() => onRestore(b)}
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
            {onDelete && isDeletable(b) && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-destructive hover:bg-destructive/10"
                title="Löschen"
                onClick={() => onDelete(b)}
              >
                <XCircle className="h-4 w-4" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
