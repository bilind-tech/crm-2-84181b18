import { useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Server, ShieldAlert, UserPlus } from "lucide-react";
import logo from "@/assets/logo.png";
import { PiApiError } from "@/lib/api/piClient";
import { useBackendStatus } from "@/hooks/useBackendStatus";

function Wrapper({ children, sub }: { children: React.ReactNode; sub: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md border-border/60 p-2 shadow-2xl">
        <CardHeader className="text-center">
          <img
            src={logo}
            alt="My Clean Center"
            className="mx-auto mb-4 h-28 w-28 object-contain drop-shadow-md"
          />
          <h1 className="text-2xl tracking-tight">
            <span className="font-light">My </span>
            <span className="font-extrabold">Clean</span>
            <span className="font-light"> Center</span>
          </h1>
          <CardDescription className="mt-1">{sub}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}

function LoginForm() {
  const { login, loading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    setLockedUntil(null);
    try {
      await login({ username, password });
    } catch (err) {
      if (err instanceof PiApiError && err.status === 423) {
        const b = err.body as { lockedUntil?: string };
        setLockedUntil(b?.lockedUntil ?? null);
        setFehler("Zu viele Fehlversuche. Bitte später erneut versuchen.");
        return;
      }
      setFehler(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen");
    }
  }

  return (
    <Wrapper sub="Bitte mit Benutzer und Passwort anmelden.">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="username">Benutzername</Label>
          <Input
            id="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pw">Passwort</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="pw"
              type="password"
              className="pl-9"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
        </div>
        {fehler && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {fehler}
            {lockedUntil && (
              <span className="mt-1 block text-xs">
                Entsperrt: {new Date(lockedUntil).toLocaleString("de-DE")}
              </span>
            )}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Anmelden …" : "Anmelden"}
        </Button>
      </form>
    </Wrapper>
  );
}

function SetupForm() {
  const { setup, loading } = useAuth();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    try {
      await setup({ username, password, setupToken });
    } catch (err) {
      if (err instanceof PiApiError) {
        if (err.status === 422) {
          setFehler("Passwort: min. 12 Zeichen, mindestens 1 Ziffer + 1 Sonderzeichen.");
          return;
        }
        if (err.status === 401) {
          setFehler("Setup-Token ungültig.");
          return;
        }
      }
      setFehler(err instanceof Error ? err.message : "Setup fehlgeschlagen");
    }
  }

  return (
    <Wrapper sub="Ersteinrichtung des Pi-Backends — Admin-Account anlegen.">
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-200">
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            <ShieldAlert className="h-3.5 w-3.5" />
            Setup-Token
          </div>
          Steht im Backend-Log beim ersten Start oder in
          <code className="mx-1">data/keys/setup.token</code>.
        </div>
        <div className="space-y-2">
          <Label htmlFor="setup-user">Benutzername</Label>
          <Input
            id="setup-user"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="setup-pw">Passwort (min. 12 Zeichen)</Label>
          <Input
            id="setup-pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="setup-token">Setup-Token</Label>
          <Input
            id="setup-token"
            value={setupToken}
            onChange={(e) => setSetupToken(e.target.value)}
            spellCheck={false}
            required
          />
        </div>
        {fehler && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{fehler}</p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          <UserPlus className="mr-2 h-4 w-4" />
          {loading ? "Einrichten …" : "Account einrichten"}
        </Button>
      </form>
    </Wrapper>
  );
}

function MockLockForm() {
  const { unlock, loading } = useAuth();
  const { url, lastError } = useBackendStatus();
  const [passwort, setPasswort] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    try {
      await unlock(passwort);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen");
    }
  }

  return (
    <Wrapper sub="Demo-Modus — Pi-Backend nicht erreichbar.">
      <div className="mb-4 rounded-md border border-border bg-muted/40 p-3 text-xs">
        <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
          <Server className="h-3.5 w-3.5" />
          Backend offline
        </div>
        <p className="text-muted-foreground">
          {url} ist nicht erreichbar. Du kannst die App im Demo-Modus erkunden.
        </p>
        {lastError && <p className="mt-1 text-rose-700">{lastError}</p>}
      </div>
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pw">Passwort (Demo)</Label>
          <div className="relative">
            <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              id="pw"
              type="password"
              autoFocus
              className="pl-9"
              value={passwort}
              onChange={(e) => setPasswort(e.target.value)}
              required
            />
          </div>
        </div>
        {fehler && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{fehler}</p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Entsperren …" : "Entsperren"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          className="w-full"
          disabled={loading}
          onClick={async () => {
            setFehler(null);
            try {
              await unlock("040506");
            } catch (err) {
              setFehler(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen");
            }
          }}
        >
          Schnell-Login (DEV)
        </Button>
      </form>
    </Wrapper>
  );
}

export function LockScreen() {
  const { mode } = useAuth();
  if (mode === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Lade …
      </div>
    );
  }
  if (mode === "needs-setup") return <SetupForm />;
  if (mode === "logged-out") return <LoginForm />;
  // mock-lock
  return <MockLockForm />;
}
