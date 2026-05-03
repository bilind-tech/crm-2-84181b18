// Sicherheits-Dialog für System-Rollback (Code-Version zurücksetzen).
// Zwei Hürden: Bestätigungswort tippen + Admin-Passwort eingeben.
// Daten bleiben absolut unberührt — nur der Programmcode wird getauscht.
//
// Lockout-Verhalten (Backend-Vertrag):
//   - 401 = Passwort falsch → lokaler Versuche-Counter (1/3, 2/3, 3/3)
//   - 429 = Backend hat gesperrt → Submit-Button mit Countdown deaktiviert
//   - Sperrzeit aus Fehlertext "gesperrt bis 2026-…" parsen, Fallback 15 min.
import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertTriangle, Loader2, RotateCcw, Shield, ShieldCheck } from "lucide-react";

const BESTAETIGUNG = "ROLLBACK";

function parseLockoutUntil(message: string): number | null {
  const m = message.match(/(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)/);
  if (m) {
    const t = Date.parse(m[1]);
    if (!Number.isNaN(t)) return t;
  }
  if (/zu viele|gesperrt|too many/i.test(message)) {
    return Date.now() + 15 * 60_000;
  }
  return null;
}

function formatRemaining(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m > 0) return `${m} min ${r}s`;
  return `${r}s`;
}

export function RollbackConfirmDialog({
  zielVersion,
  aktiveVersion,
  open,
  onClose,
  onConfirm,
}: {
  zielVersion: string;
  aktiveVersion: string;
  open: boolean;
  onClose: () => void;
  onConfirm: (passwort: string) => Promise<void>;
}) {
  const [eingabe, setEingabe] = useState("");
  const [passwort, setPasswort] = useState("");
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [versuche, setVersuche] = useState(0);
  const [sperreBis, setSperreBis] = useState<number | null>(null);
  const [, force] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Countdown-Tick, wenn gesperrt
  useEffect(() => {
    if (!sperreBis) return;
    tickRef.current = setInterval(() => {
      if (Date.now() >= sperreBis) {
        setSperreBis(null);
        setVersuche(0);
        if (tickRef.current) clearInterval(tickRef.current);
      } else {
        force((x) => x + 1);
      }
    }, 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [sperreBis]);

  const matches = eingabe.trim().toUpperCase() === BESTAETIGUNG;
  const passwortOk = passwort.trim().length >= 1;
  const istGesperrt = sperreBis !== null && Date.now() < sperreBis;
  const canSubmit = matches && passwortOk && !istGesperrt;

  const handle = async () => {
    setBusy(true);
    setFehler(null);
    try {
      await onConfirm(passwort);
      setEingabe("");
      setPasswort("");
      setVersuche(0);
    } catch (e) {
      const err = e as { status?: number; message?: string };
      const msg = err.message ?? "Rollback fehlgeschlagen";

      if (err.status === 429) {
        const until = parseLockoutUntil(msg);
        setSperreBis(until ?? Date.now() + 15 * 60_000);
        setFehler("Zu viele Fehlversuche — vorübergehend gesperrt.");
      } else if (err.status === 401) {
        const next = versuche + 1;
        setVersuche(next);
        if (next >= 3) {
          // Backend sperrt jetzt; Frontend antizipiert die Sperre.
          setSperreBis(Date.now() + 15 * 60_000);
          setFehler("3/3 Fehlversuche — vorübergehend gesperrt.");
        } else {
          setFehler(`Passwort ist falsch. (${next}/3)`);
        }
      } else if (err.status === 409) {
        setFehler("Es läuft bereits ein Update — bitte warten.");
      } else {
        setFehler(msg);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleClose = () => {
    if (busy) return;
    // Versuche-Counter beim Schließen behalten — nur clearen, wenn Sperre abgelaufen.
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="bg-background sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-5 w-5" />
            Rollback durchführen?
          </DialogTitle>
          <DialogDescription className="space-y-2 pt-2 text-sm text-foreground">
            <span className="block">
              Der Programmcode wird von Version{" "}
              <strong className="font-mono">{aktiveVersion}</strong> zurück auf{" "}
              <strong className="font-mono">{zielVersion}</strong> gesetzt.
            </span>
            <span className="block text-muted-foreground">
              Die App wird kurz neu gestartet. Vor dem Rollback wird automatisch ein
              Sicherheitsbackup deiner Daten erstellt.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-400">
          <p className="flex items-start gap-1.5 font-medium">
            <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Deine Daten bleiben unberührt.
          </p>
          <p className="mt-1 pl-5 text-emerald-700/80 dark:text-emerald-400/80">
            Kunden, Angebote, Rechnungen, Zahlungen, Anhänge und Einstellungen werden bei einem
            Rollback <strong>nicht</strong> verändert, gelöscht oder überschrieben. Es wird
            ausschließlich der Programmcode getauscht.
          </p>
        </div>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium">
              1. Tippe{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs font-bold">{BESTAETIGUNG}</code>{" "}
              zur Bestätigung
            </label>
            <Input
              autoFocus
              value={eingabe}
              onChange={(e) => setEingabe(e.target.value)}
              placeholder={BESTAETIGUNG}
              disabled={busy || istGesperrt}
            />
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-1.5 text-xs font-medium">
              <Shield className="h-3.5 w-3.5 text-muted-foreground" />
              2. Admin-Passwort eingeben
            </label>
            <Input
              type="password"
              value={passwort}
              onChange={(e) => setPasswort(e.target.value)}
              placeholder="••••••••"
              disabled={busy || istGesperrt}
              autoComplete="current-password"
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) handle();
              }}
            />
          </div>

          {istGesperrt && sperreBis && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-2 text-xs text-destructive">
              <p className="font-medium">Zu viele Fehlversuche.</p>
              <p className="mt-0.5 text-destructive/80">
                Erneut möglich in {formatRemaining(sperreBis - Date.now())}.
              </p>
            </div>
          )}

          {fehler && !istGesperrt && (
            <p className="rounded-md border border-destructive/30 bg-destructive/5 px-2 py-1.5 text-xs text-destructive">
              {fehler}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button variant="destructive" onClick={handle} disabled={!canSubmit || busy}>
            {busy ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="mr-1.5 h-4 w-4" />
            )}
            Rollback starten
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
