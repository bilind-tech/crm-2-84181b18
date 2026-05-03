// Karte für GitHub-One-Click-Update.
// Zeigt installierte vs. verfügbare Version, Status, Buttons "Prüfen" / "Verbinden" /
// "Trennen" / „Jetzt aktualisieren". Übergibt den gestarteten Lauf nach oben
// (so dass SystemUpdateTab denselben Live-Fortschritts-Dialog wie beim ZIP-Upload öffnet).
import { useState } from "react";
import { toast } from "sonner";
import {
  Github,
  RefreshCw,
  Plug2,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Settings as SettingsIcon,
  Download,
  Unplug,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGithubStatus, useGithubPruefen, useGithubInstall, useGithubTrennen } from "@/hooks/useApi";
import { GitHubVerbindenDialog } from "./GitHubVerbindenDialog";
import type { GithubUpdateStatus } from "@/lib/api/types";
import { cn } from "@/lib/utils";

interface Props {
  /** Wird aufgerufen, sobald ein Update-Lauf gestartet wurde (für Live-Dialog). */
  onLaufGestartet: (laufId: string) => void;
  /** Sperrt Buttons, wenn bereits ein Update läuft. */
  updateLaeuft: boolean;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return "gerade eben";
  if (min < 60) return `vor ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `vor ${h} h`;
  const d = Math.round(h / 24);
  return `vor ${d} d`;
}

function shaShort(sha: string | null): string {
  if (!sha) return "—";
  return sha.slice(0, 7);
}

export function GitHubUpdateCard({ onLaufGestartet, updateLaeuft }: Props) {
  const { data: status, isLoading } = useGithubStatus();
  const pruefen = useGithubPruefen();
  const install = useGithubInstall();
  const trennen = useGithubTrennen();
  const [verbindenOffen, setVerbindenOffen] = useState(false);
  const [trennConfirm, setTrennConfirm] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/20 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Lade GitHub-Status …
      </div>
    );
  }

  const s: GithubUpdateStatus | null = status ?? null;
  const verbunden = !!s?.tokenIsSet && !!s?.repo;

  function handlePruefen() {
    pruefen.mutate(undefined, {
      onSuccess: (d) => {
        if (d.updateVerfuegbar) toast.success(`Update verfügbar: ${shaShort(d.remoteCommit)}`);
        else toast.success("System ist auf dem neuesten Stand");
      },
      onError: (e) => toast.error(`Prüfung fehlgeschlagen: ${(e as Error).message}`),
    });
  }

  function handleInstall() {
    install.mutate(undefined, {
      onSuccess: (res) => {
        if (res.lauf?.id) {
          onLaufGestartet(res.lauf.id);
          toast.success("Update gestartet");
        } else {
          toast.success("Update vorbereitet");
        }
      },
      onError: (e) => {
        const err = e as { status?: number; message?: string };
        if (err.status === 409) toast.error("Es läuft bereits ein Update.");
        else toast.error(`Update konnte nicht starten: ${err.message ?? "Fehler"}`);
      },
    });
  }

  function handleTrennen() {
    trennen.mutate(undefined, {
      onSuccess: () => {
        toast.success("GitHub-Verbindung getrennt");
        setTrennConfirm(false);
      },
    });
  }

  // Nicht verbunden → schlanke „Verbinden"-Karte
  if (!verbunden) {
    return (
      <>
        <div className="rounded-xl border border-dashed border-border bg-muted/20 p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-content-center rounded-lg bg-foreground/5">
              <Github className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">Updates direkt aus GitHub</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Verbinde dein Code-Repository einmalig, dann reicht ein Klick — der Pi
                lädt den neuesten Code, macht ein Sicherheits-Backup und tauscht den
                Code aus. Deine Daten bleiben unangetastet.
              </p>
            </div>
            <Button onClick={() => setVerbindenOffen(true)} size="sm" className="gap-1.5">
              <Plug2 className="h-4 w-4" />
              Verbinden
            </Button>
          </div>
        </div>
        {verbindenOffen && (
          <GitHubVerbindenDialog
            current={s}
            open
            onClose={() => setVerbindenOffen(false)}
          />
        )}
      </>
    );
  }

  // Verbunden
  const updateVerfuegbar = !!s?.updateVerfuegbar;
  return (
    <>
      <div className="rounded-xl border border-border bg-card p-5">
        {/* Header */}
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "grid h-10 w-10 place-content-center rounded-lg",
              updateVerfuegbar ? "bg-primary/10 text-primary" : "bg-emerald-500/10 text-emerald-600",
            )}
          >
            <Github className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              <span className="font-mono">{s?.repo}</span>
              <span className="ml-2 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                {s?.branch}
              </span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {updateVerfuegbar ? (
                <span className="font-medium text-primary">Update verfügbar</span>
              ) : (
                <span className="inline-flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="h-3 w-3" /> Auf dem neuesten Stand
                </span>
              )}
              {s?.letzteSynchronisation && (
                <span className="ml-2 text-muted-foreground">
                  · geprüft {formatRelative(s.letzteSynchronisation)}
                </span>
              )}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setVerbindenOffen(true)}
            title="Verbindung anpassen"
            disabled={updateLaeuft}
          >
            <SettingsIcon className="h-4 w-4" />
          </Button>
        </div>

        {/* Versions-Diff */}
        <div className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-border bg-muted/20 p-3 text-xs">
          <div>
            <p className="text-muted-foreground">Installiert</p>
            <p className="mt-0.5 font-mono text-sm font-medium">
              {shaShort(s?.installedCommit ?? null)}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">v{s?.installedVersion}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Verfügbar</p>
            <p className="mt-0.5 font-mono text-sm font-medium">
              {shaShort(s?.remoteCommit ?? null)}
            </p>
            {s?.remoteCommitDate && (
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                <Clock className="mr-0.5 inline h-2.5 w-2.5" />
                {new Date(s.remoteCommitDate).toLocaleDateString("de-DE", {
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                })}
              </p>
            )}
          </div>
        </div>

        {s?.remoteCommitMessage && (
          <p className="mt-2 truncate text-xs text-muted-foreground" title={s.remoteCommitMessage}>
            „{s.remoteCommitMessage}"
          </p>
        )}

        {s?.letzterFehler && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>{s.letzterFehler}</span>
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handlePruefen}
              disabled={pruefen.isPending || install.isPending || updateLaeuft}
              className="gap-1.5"
            >
              {pruefen.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Prüfen
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setTrennConfirm(true)}
              disabled={trennen.isPending || install.isPending || updateLaeuft}
              className="gap-1.5 text-muted-foreground"
            >
              <Unplug className="h-3.5 w-3.5" />
              Trennen
            </Button>
          </div>

          <Button
            onClick={handleInstall}
            disabled={!updateVerfuegbar || install.isPending || updateLaeuft}
            className="gap-1.5"
          >
            {install.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {updateVerfuegbar
              ? `Jetzt aktualisieren${s?.remoteCommit ? ` (${shaShort(s.remoteCommit)})` : ""}`
              : "Aktualisiert"}
          </Button>
        </div>
      </div>

      {verbindenOffen && (
        <GitHubVerbindenDialog
          current={s}
          open
          onClose={() => setVerbindenOffen(false)}
        />
      )}

      {trennConfirm && (
        <TrennenConfirm
          repo={s?.repo ?? ""}
          onCancel={() => setTrennConfirm(false)}
          onConfirm={handleTrennen}
          loading={trennen.isPending}
        />
      )}
    </>
  );
}

function TrennenConfirm({
  repo,
  onCancel,
  onConfirm,
  loading,
}: {
  repo: string;
  onCancel: () => void;
  onConfirm: () => void;
  loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onCancel}>
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-background p-5 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold">GitHub-Verbindung trennen?</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Der gespeicherte Token für <span className="font-mono">{repo}</span> wird gelöscht.
          Du kannst jederzeit neu verbinden. Daten bleiben unberührt.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onCancel} disabled={loading}>
            Abbrechen
          </Button>
          <Button variant="destructive" size="sm" onClick={onConfirm} disabled={loading}>
            {loading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Trennen
          </Button>
        </div>
      </div>
    </div>
  );
}
