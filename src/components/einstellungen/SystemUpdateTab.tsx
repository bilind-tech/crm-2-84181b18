// Tab "System & Updates"
// Zeigt aktuelle Version + Update-Upload + Versionshistorie + Live-Lauf-Dialog.
// Backend (Step 8) ist angebunden: Multipart-Upload, SSE-getriebener Fortschritt,
// 401-Lockout für Rollback. Wenn beim Tab-Mount ein Lauf bereits läuft, öffnet
// sich der Fortschritts-Dialog automatisch.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Package,
  CheckCircle2,
  XCircle,
  Loader2,
  AlertTriangle,
  Server,
  Clock,
  RefreshCw,
  RotateCcw,
  Cpu,
  Database,
  ChevronRight,
  Radio,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Section } from "./_shared";
import { LoadingPlaceholder } from "@/components/layout/LoadingPlaceholder";
import { UpdateUploadDropzone } from "./UpdateUploadDropzone";
import { RollbackConfirmDialog } from "./RollbackConfirmDialog";
import { GitHubUpdateCard } from "./GitHubUpdateCard";
import {
  useSystemInfo,
  useUpdateHistorie,
  useValidateUpdate,
  useInstallUpdate,
  useUpdateLauf,
  useAktuellerUpdateLauf,
  useRollbackUpdate,
} from "@/hooks/useApi";
import type {
  UpdatePackageInfo,
  UpdateLauf,
  UpdateStepStatus,
  InstallierteVersion,
} from "@/lib/api/types";
import { onSseStatus } from "@/lib/api/sse";
import { cn } from "@/lib/utils";

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(start: string, end: string | null): string {
  const ms = (end ? new Date(end).getTime() : Date.now()) - new Date(start).getTime();
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m} min ${s % 60}s`;
}

function formatBytes(b: number): string {
  if (!b) return "—";
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function SystemUpdateTab() {
  const { data: system, isLoading: sysLoading } = useSystemInfo();
  const { data: versionen = [] } = useUpdateHistorie();
  const validate = useValidateUpdate();
  const install = useInstallUpdate();
  const rollback = useRollbackUpdate();

  // Validierte Pakete, die noch installiert werden können
  const [pendingPackage, setPendingPackage] = useState<UpdatePackageInfo | null>(null);
  // Aktuell laufender Update-Lauf — getriggert wird Polling über useUpdateLauf
  const [activeLaufId, setActiveLaufId] = useState<string | null>(null);
  // Pending Rollback-Anfrage (öffnet den Bestätigungs-Dialog)
  const [pendingRollback, setPendingRollback] = useState<string | null>(null);

  const { data: lauf } = useUpdateLauf(activeLaufId);

  // Beim Mount: gibt es einen aktuell laufenden Update-Lauf? Dann Dialog öffnen,
  // damit ein User, der die Seite während eines Updates neu lädt, weiter den
  // Fortschritt sieht.
  const { data: aktuellerLauf } = useAktuellerUpdateLauf(!activeLaufId);
  useEffect(() => {
    if (aktuellerLauf?.id && !activeLaufId) setActiveLaufId(aktuellerLauf.id);
  }, [aktuellerLauf, activeLaufId]);

  if (sysLoading || !system) return <LoadingPlaceholder />;

  const handleFile = (file: File) => {
    validate.mutate(file, {
      onSuccess: (info) => {
        if (!info.valide) {
          toast.error(info.fehlerGrund ?? "Update-Paket ungültig");
          return;
        }
        setPendingPackage(info);
      },
      onError: (e) => {
        const err = e as { status?: number; message?: string };
        const msg = err.message ?? "Unbekannter Fehler";
        if (err.status === 413) {
          toast.error("Paket zu groß (max. 200 MB).");
        } else if (err.status === 400) {
          toast.error(`Update-Paket ungültig: ${msg}`);
        } else if (err.status === 401) {
          toast.error("Bitte erneut anmelden.");
        } else {
          toast.error(`Validierung fehlgeschlagen: ${msg}`);
        }
      },
    });
  };

  const startInstall = () => {
    if (!pendingPackage) return;
    install.mutate(pendingPackage.uploadId, {
      onSuccess: (newLauf) => {
        setActiveLaufId(newLauf.id);
        setPendingPackage(null);
      },
      onError: (e) => {
        const err = e as { status?: number; message?: string };
        if (err.status === 409) {
          toast.error("Es läuft bereits ein Update.");
        } else if (err.status === 404) {
          toast.error("Upload abgelaufen — bitte Paket erneut hochladen.");
          setPendingPackage(null);
        } else {
          toast.error(`Installation konnte nicht starten: ${err.message ?? "Fehler"}`);
        }
      },
    });
  };

  const confirmRollback = (version: string, passwort: string) =>
    new Promise<void>((resolve, reject) => {
      rollback.mutate(
        { version, passwort },
        {
          onSuccess: (newLauf) => {
            setActiveLaufId(newLauf.id);
            setPendingRollback(null);
            resolve();
          },
          onError: (e) => reject(e),
        },
      );
    });

  return (
    <div className="space-y-5 pb-24">
      {/* ─── Aktuelle Version ───────────────────────────────────────── */}
      <Section title="Aktuelle Installation">
        <div className="space-y-3">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-content-center rounded-xl bg-primary/10 text-primary">
              <Package className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold">{system.appName}</p>
              <p className="text-sm text-muted-foreground">
                Version <span className="font-mono font-medium text-foreground">{system.version}</span>
                {" · installiert "}
                {formatDateTime(system.installedAt)}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pt-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1">
              <Server className="h-3 w-3" /> Node {system.node}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1">
              <Database className="h-3 w-3" /> SQLite {system.sqlite}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-2 py-1">
              <Cpu className="h-3 w-3" /> {system.hardware}
            </span>
          </div>
        </div>
      </Section>

      {/* ─── GitHub-One-Click-Update ────────────────────────────────── */}
      <Section
        title="Aus GitHub aktualisieren"
        description="Verbinde dein Repository — dann reicht ein Klick. Daten bleiben unberührt."
      >
        <GitHubUpdateCard
          onLaufGestartet={(id) => setActiveLaufId(id)}
          updateLaeuft={!!aktuellerLauf && aktuellerLauf.status === "laeuft"}
        />
      </Section>

      {/* ─── Update einspielen (ZIP-Upload als Fallback) ─────────────── */}
      <Section
        title="Update aus Datei (manuell)"
        description="Alternativ: lade ein .zip-Paket hoch — Daten bleiben unberührt."
      >
        {aktuellerLauf && aktuellerLauf.status === "laeuft" ? (
          <div className="flex items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
            <Loader2 className="mt-0.5 h-4 w-4 animate-spin text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Es läuft bereits ein Update.</p>
              <p className="text-xs text-muted-foreground">
                Bitte warten, bis der Vorgang abgeschlossen ist. Upload und Rollback sind so lange gesperrt.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={() => setActiveLaufId(aktuellerLauf.id)}>
              Fortschritt
            </Button>
          </div>
        ) : !pendingPackage ? (
          <UpdateUploadDropzone
            onFile={handleFile}
            disabled={validate.isPending || install.isPending}
          />
        ) : (
          <UpdatePackagePreview
            info={pendingPackage}
            currentVersion={system.version}
            onCancel={() => setPendingPackage(null)}
            onInstall={startInstall}
            installing={install.isPending}
          />
        )}
      </Section>

      {/* ─── Versionshistorie ───────────────────────────────────────── */}
      <Section title="Versionshistorie" description="Frühere Versionen — Rollback nur auf die direkt vorherige.">
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {versionen.map((v) => (
            <VersionRow
              key={v.version}
              version={v}
              onRollback={() => setPendingRollback(v.version)}
              rollbackPending={rollback.isPending && pendingRollback === v.version}
            />
          ))}
        </ul>
      </Section>

      {/* ─── Rollback-Bestätigungs-Dialog ───────────────────────────── */}
      {pendingRollback && (
        <RollbackConfirmDialog
          zielVersion={pendingRollback}
          aktiveVersion={system.version}
          open
          onClose={() => setPendingRollback(null)}
          onConfirm={(passwort) => confirmRollback(pendingRollback, passwort)}
        />
      )}

      {/* ─── Live-Fortschritt-Modal ─────────────────────────────────── */}
      {activeLaufId && lauf && (
        <UpdateProgressDialog
          lauf={lauf}
          onClose={() => setActiveLaufId(null)}
          onReload={() => window.location.reload()}
        />
      )}
    </div>
  );
}

// =============================================================================
// Validierungs-Vorschau
// =============================================================================
function UpdatePackagePreview({
  info,
  currentVersion,
  onCancel,
  onInstall,
  installing,
}: {
  info: UpdatePackageInfo;
  currentVersion: string;
  onCancel: () => void;
  onInstall: () => void;
  installing: boolean;
}) {
  const isDowngrade = info.version < currentVersion;
  return (
    <div className="rounded-xl border border-border bg-muted/20 p-5">
      <div className="flex items-start gap-3">
        <Package className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{info.fileName}</p>
          <p className="text-xs text-muted-foreground">{formatBytes(info.sizeBytes)}</p>
        </div>
      </div>

      <div className="mt-4 space-y-2 border-t border-border pt-4 text-sm">
        <CheckLine label="Gültiges Update-Paket" ok />
        <CheckLine
          label={`Versionsnummer: ${info.version}  (aktuell: ${currentVersion})`}
          ok={!isDowngrade}
          warn={isDowngrade}
        />
        <CheckLine label="package.json gefunden" ok />
        {info.pendingMigrations.length > 0 ? (
          <div>
            <CheckLine
              label={`${info.pendingMigrations.length} neue Migration${info.pendingMigrations.length === 1 ? "" : "s"} werden ausgeführt:`}
              ok
            />
            <ul className="ml-7 mt-1 space-y-0.5 text-xs text-muted-foreground">
              {info.pendingMigrations.map((m) => (
                <li key={m} className="font-mono">• {m}</li>
              ))}
            </ul>
          </div>
        ) : (
          <CheckLine label="Keine Datenbank-Migrations nötig" ok />
        )}
        {info.warnings.map((w) => (
          <CheckLine key={w} label={w} warn />
        ))}
      </div>

      <div className="mt-5 space-y-2">
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-400">
          <p className="font-medium">Deine Daten bleiben unberührt.</p>
          <p className="mt-1 text-emerald-700/80 dark:text-emerald-400/80">
            Kunden, Angebote, Rechnungen, Zahlungen, Anhänge und Einstellungen
            werden bei diesem Update nicht verändert, gelöscht oder überschrieben.
            Es wird ausschließlich der Programmcode getauscht.
          </p>
        </div>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
          <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
          Vor dem Update wird automatisch ein Sicherheitsbackup erstellt. Bei
          Fehler wird automatisch zurückgerollt.
        </div>
      </div>

      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={installing}>
          Abbrechen
        </Button>
        <Button onClick={onInstall} disabled={installing}>
          {installing ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-1.5 h-4 w-4" />
          )}
          Update installieren
        </Button>
      </div>
    </div>
  );
}

function CheckLine({ label, ok, warn }: { label: string; ok?: boolean; warn?: boolean }) {
  const Icon = warn ? AlertTriangle : ok ? CheckCircle2 : XCircle;
  const color = warn ? "text-amber-600" : ok ? "text-emerald-600" : "text-destructive";
  return (
    <div className="flex items-start gap-2">
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", color)} />
      <span className="text-sm">{label}</span>
    </div>
  );
}

// =============================================================================
// Versions-Zeile
// =============================================================================
function VersionRow({
  version,
  onRollback,
  rollbackPending,
}: {
  version: InstallierteVersion;
  onRollback: () => void;
  rollbackPending: boolean;
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5">
      {version.istAktiv ? (
        <span className="grid h-5 w-5 place-content-center">
          <span className="h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" />
        </span>
      ) : (
        <span className="grid h-5 w-5 place-content-center">
          <span className="h-2 w-2 rounded-full border border-muted-foreground/40" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">
          Version <span className="font-mono">{version.version}</span>
          {version.istAktiv && (
            <span className="ml-2 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
              AKTIV
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">{formatDateTime(version.installedAt)}</p>
      </div>
      {version.rollbackVerfuegbar && (
        <Button
          variant="outline"
          size="sm"
          onClick={onRollback}
          disabled={rollbackPending}
          className="gap-1.5"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Rollback
        </Button>
      )}
    </li>
  );
}

// =============================================================================
// Live-Fortschritts-Dialog
// =============================================================================
function UpdateProgressDialog({
  lauf,
  onClose,
  onReload,
}: {
  lauf: UpdateLauf;
  onClose: () => void;
  onReload: () => void;
}) {
  const isDone = lauf.status === "erfolg";
  const isFailed = lauf.status === "fehler";
  const isRunning = lauf.status === "laeuft" || lauf.status === "rollback";

  // Tick für „läuft seit" während des Updates
  const [, force] = useState(0);
  useEffect(() => {
    if (!isRunning) return;
    const t = setInterval(() => force((x) => x + 1), 1000);
    return () => clearInterval(t);
  }, [isRunning]);

  // SSE-Verbindungsstatus für „● Live"-Indikator
  const [sseConnected, setSseConnected] = useState(false);
  useEffect(() => onSseStatus(setSseConnected), []);

  return (
    <Dialog open onOpenChange={(o) => !o && !isRunning && onClose()}>
      <DialogContent className="bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isDone ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                Update erfolgreich
              </>
            ) : isFailed ? (
              <>
                <XCircle className="h-5 w-5 text-destructive" />
                Update fehlgeschlagen
              </>
            ) : (
              <>
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                {lauf.status === "rollback" ? "Rollback läuft" : "Update läuft"}
              </>
            )}
          </DialogTitle>
          <DialogDescription className="pt-1">
            <span className="font-mono">{lauf.von}</span>
            <ChevronRight className="mx-1 inline h-3 w-3" />
            <span className="font-mono">{lauf.zu}</span>
            <span className="ml-2 text-xs text-muted-foreground">
              <Clock className="mr-1 inline h-3 w-3" />
              {formatDuration(lauf.startetAm, lauf.beendetAm)}
            </span>
            {isRunning && (
              <span
                className={cn(
                  "ml-2 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                  sseConnected
                    ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-400"
                    : "border-muted-foreground/20 bg-muted/40 text-muted-foreground",
                )}
                title={sseConnected ? "Live-Aktualisierung aktiv" : "Aktualisierung in Kürze"}
              >
                <Radio className={cn("h-2.5 w-2.5", sseConnected && "animate-pulse")} />
                {sseConnected ? "Live" : "—"}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-2 py-2">
          {lauf.steps.map((s) => (
            <StepRow key={s.id} step={s} />
          ))}
        </ol>

        {isRunning && (
          <p className="text-center text-xs text-muted-foreground">
            Bitte Browser nicht schließen.
          </p>
        )}

        {isFailed && (
          <div className="space-y-2">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              {lauf.steps.find((s) => s.status === "fehler")?.fehlerGrund ??
                "Unbekannter Fehler — automatischer Rollback wurde gestartet."}
            </div>
            {lauf.safetyBackupId && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
                <p className="font-medium text-amber-700 dark:text-amber-400">
                  Sicherheits-Backup ist vorhanden
                </p>
                <p className="mt-0.5 text-muted-foreground">
                  Vor dem Update wurde automatisch ein Backup angelegt
                  (ID <span className="font-mono">{lauf.safetyBackupId.slice(0, 8)}</span>).
                  Es kann jederzeit unter <span className="font-medium">Backup &amp; Wiederherstellung</span> eingespielt werden.
                </p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {isDone ? (
            <Button onClick={onReload}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              App neu laden
            </Button>
          ) : isFailed ? (
            <Button variant="outline" onClick={onClose}>
              Schließen
            </Button>
          ) : (
            <Button variant="outline" disabled>
              Bitte warten …
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function StepRow({ step }: { step: UpdateStepStatus }) {
  const Icon =
    step.status === "ok"
      ? CheckCircle2
      : step.status === "laeuft"
        ? Loader2
        : step.status === "fehler"
          ? XCircle
          : null;
  const color =
    step.status === "ok"
      ? "text-emerald-500"
      : step.status === "laeuft"
        ? "text-primary"
        : step.status === "fehler"
          ? "text-destructive"
          : "text-muted-foreground/40";
  return (
    <li className="flex items-center gap-3 rounded-lg px-2 py-1.5">
      <span className="grid h-5 w-5 place-content-center">
        {Icon ? (
          <Icon className={cn("h-4 w-4", color, step.status === "laeuft" && "animate-spin")} />
        ) : (
          <span className="h-2 w-2 rounded-full border border-muted-foreground/40" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-sm",
            step.status === "wartet" && "text-muted-foreground",
            step.status === "ok" && "font-medium",
          )}
        >
          {step.label}
        </p>
        {step.detail && step.status === "laeuft" && (
          <p className="truncate text-xs text-muted-foreground">{step.detail}</p>
        )}
      </div>
    </li>
  );
}
