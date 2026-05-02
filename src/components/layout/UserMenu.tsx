import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { piApi, PiApiError } from "@/lib/api/piClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, KeyRound, ShieldCheck, MonitorSmartphone, User } from "lucide-react";
import { toast } from "sonner";

function initialen(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() ?? "")
    .join("");
}

function PasswortAendernDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { changePassword } = useAuth();
  const [alt, setAlt] = useState("");
  const [neu, setNeu] = useState("");
  const [neu2, setNeu2] = useState("");
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    if (neu !== neu2) {
      setFehler("Die neuen Passwörter stimmen nicht überein.");
      return;
    }
    setBusy(true);
    try {
      await changePassword(alt, neu);
      toast.success("Passwort geändert");
      onOpenChange(false);
      setAlt("");
      setNeu("");
      setNeu2("");
    } catch (err) {
      if (err instanceof PiApiError) {
        if (err.status === 401) setFehler("Aktuelles Passwort ist falsch.");
        else if (err.status === 422) setFehler("Neues Passwort: min. 12 Zeichen, 1 Ziffer + 1 Sonderzeichen.");
        else setFehler(err.message);
      } else setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Passwort ändern</DialogTitle>
          <DialogDescription>Min. 12 Zeichen, mindestens 1 Ziffer und 1 Sonderzeichen.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="alt">Aktuelles Passwort</Label>
            <Input id="alt" type="password" value={alt} onChange={(e) => setAlt(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="neu">Neues Passwort</Label>
            <Input id="neu" type="password" value={neu} onChange={(e) => setNeu(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="neu2">Wiederholen</Label>
            <Input id="neu2" type="password" value={neu2} onChange={(e) => setNeu2(e.target.value)} required />
          </div>
          {fehler && <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{fehler}</p>}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Speichere …" : "Speichern"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RecoveryRotateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [neuerCode, setNeuerCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  async function rotieren() {
    setFehler(null);
    setBusy(true);
    try {
      const res = await piApi.post<{ recoveryCode: string }>("/auth/recovery/regenerieren");
      setNeuerCode(res.recoveryCode);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) setNeuerCode(null);
        onOpenChange(v);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neuen Recovery-Code erzeugen</DialogTitle>
          <DialogDescription>
            Der bisherige Recovery-Code wird damit ungültig. Notiere oder drucke den neuen Code sofort —
            er wird nur ein einziges Mal angezeigt.
          </DialogDescription>
        </DialogHeader>
        {!neuerCode ? (
          <>
            {fehler && <p className="rounded bg-destructive/10 px-3 py-2 text-sm text-destructive">{fehler}</p>}
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Abbrechen
              </Button>
              <Button onClick={rotieren} disabled={busy}>
                {busy ? "Erzeuge …" : "Neuen Code erzeugen"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <div className="rounded-md border border-border bg-muted/40 p-4 text-center font-mono text-base tracking-wider">
              {neuerCode}
            </div>
            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => {
                  void navigator.clipboard?.writeText(neuerCode);
                  toast.success("In Zwischenablage kopiert");
                }}
              >
                Kopieren
              </Button>
              <Button variant="secondary" className="flex-1" onClick={() => window.print()}>
                Drucken
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Fertig</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface SessionItem {
  id: string;
  _t: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string | null;
  ip: string | null;
  current: boolean;
}

function SessionsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const [sessions, setSessions] = useState<SessionItem[] | null>(null);
  const [busy, setBusy] = useState(false);

  async function laden() {
    setBusy(true);
    try {
      const res = await piApi.get<{ sessions: SessionItem[] }>("/auth/sessions");
      setSessions(res.sessions);
    } finally {
      setBusy(false);
    }
  }

  async function alleBeenden() {
    setBusy(true);
    try {
      await piApi.delete("/auth/sessions");
      toast.success("Andere Sessions beendet");
      await laden();
    } finally {
      setBusy(false);
    }
  }

  async function beenden(token: string) {
    setBusy(true);
    try {
      await piApi.delete(`/auth/sessions/${encodeURIComponent(token)}`);
      await laden();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (v && !sessions) void laden();
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Aktive Sessions</DialogTitle>
          <DialogDescription>Geräte, die aktuell mit deinem Account angemeldet sind.</DialogDescription>
        </DialogHeader>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {sessions === null && <p className="text-sm text-muted-foreground">Lade …</p>}
          {sessions?.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded border border-border p-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">
                  {s.userAgent ?? "Unbekanntes Gerät"} {s.current && <span className="text-xs text-primary">(diese Sitzung)</span>}
                </p>
                <p className="text-xs text-muted-foreground">
                  IP {s.ip ?? "—"} · zuletzt {new Date(s.lastSeenAt).toLocaleString("de-DE")}
                </p>
              </div>
              {!s.current && (
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => beenden(s._t)}>
                  Beenden
                </Button>
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
          <Button variant="destructive" disabled={busy || !sessions || sessions.every((s) => s.current)} onClick={alleBeenden}>
            Auf allen anderen Geräten abmelden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function UserMenu() {
  const { user, logout } = useAuth();
  const [pwOpen, setPwOpen] = useState(false);
  const [recOpen, setRecOpen] = useState(false);
  const [sessOpen, setSessOpen] = useState(false);
  if (!user) return null;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="Konto"
            className="grid h-10 w-10 shrink-0 place-content-center rounded-full border border-border bg-card text-xs font-semibold text-muted-foreground transition hover:border-primary/30 hover:text-foreground"
          >
            {initialen(user.username) || <User className="h-4 w-4" />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="space-y-0.5">
            <div className="text-sm font-semibold">Konto</div>
            <div className="text-xs font-normal text-muted-foreground">Lokal angemeldet</div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setPwOpen(true)}>
            <KeyRound className="mr-2 h-4 w-4" /> Passwort ändern
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setRecOpen(true)}>
            <ShieldCheck className="mr-2 h-4 w-4" /> Recovery-Code neu erzeugen
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setSessOpen(true)}>
            <MonitorSmartphone className="mr-2 h-4 w-4" /> Aktive Sessions
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => void logout()}>
            <LogOut className="mr-2 h-4 w-4" /> Abmelden
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PasswortAendernDialog open={pwOpen} onOpenChange={setPwOpen} />
      <RecoveryRotateDialog open={recOpen} onOpenChange={setRecOpen} />
      <SessionsDialog open={sessOpen} onOpenChange={setSessOpen} />
    </>
  );
}
