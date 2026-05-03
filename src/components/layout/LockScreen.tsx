import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Lock, RefreshCw, Server, ShieldAlert, UserPlus } from "lucide-react";
import logo from "@/assets/logo.png";
import { piApi, PiApiError } from "@/lib/api/piClient";
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

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  autoFocus,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  return (
    <div className="space-y-1">
      <div className="relative">
        <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          type={show ? "text" : "password"}
          className="pl-9 pr-9"
          value={value}
          autoFocus={autoFocus}
          autoComplete={autoComplete}
          required
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => setCapsLock(e.getModifierState?.("CapsLock") ?? false)}
          onKeyUp={(e) => setCapsLock(e.getModifierState?.("CapsLock") ?? false)}
        />
        <button
          type="button"
          aria-label={show ? "Passwort verbergen" : "Passwort anzeigen"}
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {capsLock && (
        <p className="text-xs text-amber-700 dark:text-amber-400">Feststelltaste ist aktiv</p>
      )}
    </div>
  );
}

function formatLockedUntil(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("de-DE", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" });
}

function useCountdown(targetIso: string | null): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!targetIso) return;
    const i = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(i);
  }, [targetIso]);
  if (!targetIso) return "00:00";
  const ms = Math.max(0, new Date(targetIso).getTime() - now);
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function LoginForm({ onRecovery }: { onRecovery: () => void }) {
  const { login, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    setLockedUntil(null);
    try {
      await login({ password });
    } catch (err) {
      if (err instanceof PiApiError && err.status === 423) {
        const b = err.body as { lockedUntil?: string };
        setLockedUntil(b?.lockedUntil ?? null);
        return;
      }
      setFehler(err instanceof Error ? err.message : "Anmeldung fehlgeschlagen");
    }
  }

  const countdown = useCountdown(lockedUntil);
  const istNochGesperrt = lockedUntil ? new Date(lockedUntil).getTime() > Date.now() : false;

  useEffect(() => {
    if (lockedUntil && !istNochGesperrt) setLockedUntil(null);
  }, [lockedUntil, istNochGesperrt]);

  if (lockedUntil && istNochGesperrt) {
    return (
      <Wrapper sub="Vorübergehend gesperrt.">
        <div className="space-y-3 text-sm">
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-destructive">
            <div className="mb-1 flex items-center gap-2 font-semibold">
              <ShieldAlert className="h-4 w-4" />
              Anmeldung gesperrt
            </div>
            <p>
              Zu viele Fehlversuche. Erneut möglich in{" "}
              <strong className="font-mono text-base">{countdown}</strong>
            </p>
            <p className="mt-1 text-xs opacity-80">
              Entsperrt um {formatLockedUntil(lockedUntil)}
            </p>
          </div>
          <Button type="button" variant="secondary" className="w-full" disabled>
            Anmelden in {countdown}
          </Button>
        </div>
      </Wrapper>
    );
  }

  return (
    <Wrapper sub="Bitte Passwort eingeben.">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="pw">Passwort</Label>
          <PasswordInput
            id="pw"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            autoFocus
          />
        </div>
        {fehler && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{fehler}</p>
        )}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Anmelden …" : "Anmelden"}
        </Button>
        <button
          type="button"
          onClick={onRecovery}
          className="block w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Passwort vergessen — Recovery-Code verwenden
        </button>
      </form>
    </Wrapper>
  );
}

function RecoveryAnzeige({
  code,
  titel,
  hinweis,
  onWeiter,
}: {
  code: string;
  titel: string;
  hinweis: string;
  onWeiter: () => void;
}) {
  const [bestaetigt, setBestaetigt] = useState(false);
  const [kopiert, setKopiert] = useState(false);

  function druckRecovery() {
    const w = window.open("", "_blank", "width=600,height=600");
    if (!w) return;
    const heute = new Date().toLocaleDateString("de-DE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
    w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8">
<title>MyCleanCenter Recovery-Code</title>
<style>
  body { font-family: system-ui, sans-serif; padding: 48px; color: #111; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  .sub { color: #555; margin: 0 0 32px; font-size: 14px; }
  .box { border: 2px solid #111; border-radius: 12px; padding: 32px; margin: 24px 0; text-align: center; }
  .code { font-family: ui-monospace, Menlo, monospace; font-size: 26px; letter-spacing: 2px; font-weight: 700; word-break: break-all; }
  .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #555; margin-bottom: 12px; }
  .hint { background: #fffbe6; border: 1px solid #d4b400; border-radius: 8px; padding: 12px 16px; font-size: 13px; }
  .meta { margin-top: 32px; font-size: 12px; color: #555; }
</style></head><body>
<h1>MyCleanCenter — Recovery-Code</h1>
<p class="sub">${titel}</p>
<div class="box">
  <div class="label">Recovery-Code</div>
  <div class="code">${code}</div>
</div>
<div class="hint"><strong>Wichtig:</strong> Diesen Code an einem sicheren Ort verwahren (Safe, Passwort-Manager). Mit ihm kann das Passwort ohne Backend-Zugriff zurückgesetzt werden. Nach Verwendung wird automatisch ein neuer Code erzeugt.</div>
<div class="meta">Erstellt am ${heute}</div>
<script>setTimeout(function(){window.print();},150);</script>
</body></html>`);
    w.document.close();
  }

  return (
    <Wrapper sub={titel}>
      <div className="space-y-4 text-sm">
        <div className="rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-200">
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            <ShieldAlert className="h-3.5 w-3.5" />
            Wichtig — Recovery-Code
          </div>
          {hinweis} Speichere oder drucke den Code <strong>jetzt</strong>. Er wird nur ein einziges Mal angezeigt.
        </div>
        <div className="rounded-md border border-border bg-muted/40 p-4 text-center font-mono text-base tracking-wider">
          {code}
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={() => {
              void navigator.clipboard?.writeText(code);
              setKopiert(true);
              window.setTimeout(() => setKopiert(false), 1500);
            }}
          >
            {kopiert ? "Kopiert" : "Kopieren"}
          </Button>
          <Button
            type="button"
            variant="secondary"
            className="flex-1"
            onClick={druckRecovery}
          >
            Drucken
          </Button>
        </div>
        <label className="flex items-start gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={bestaetigt}
            onChange={(e) => setBestaetigt(e.target.checked)}
          />
          Ich habe den Recovery-Code sicher notiert.
        </label>
        <Button type="button" className="w-full" disabled={!bestaetigt} onClick={onWeiter}>
          Fertig
        </Button>
      </div>
    </Wrapper>
  );
}

function SetupForm() {
  const { setup, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [setupToken, setSetupToken] = useState(() => {
    if (typeof window === "undefined") return "";
    const sp = new URLSearchParams(window.location.search);
    return sp.get("token") ?? "";
  });
  const [fehler, setFehler] = useState<string | null>(null);
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    try {
      const res = await setup({ password, setupToken });
      setRecoveryCode(res.recoveryCode);
    } catch (err) {
      if (err instanceof PiApiError) {
        if (err.status === 422) {
          setFehler("Passwort: min. 12 Zeichen, mindestens 1 Ziffer + 1 Sonderzeichen.");
          return;
        }
        if (err.status === 401) {
          setFehler("Setup-Token ungültig oder abgelaufen.");
          return;
        }
      }
      setFehler(err instanceof Error ? err.message : "Setup fehlgeschlagen");
    }
  }

  if (recoveryCode) {
    return (
      <RecoveryAnzeige
        code={recoveryCode}
        titel="Passwort gesetzt"
        hinweis="Mit diesem Code kannst du dein Passwort zurücksetzen, falls du es vergisst."
        onWeiter={() => {
          setRecoveryCode(null);
          window.location.assign("/");
        }}
      />
    );
  }

  return (
    <Wrapper sub="Ersteinrichtung — Passwort festlegen.">
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-md border border-amber-300/60 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-200">
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            <ShieldAlert className="h-3.5 w-3.5" />
            Setup-Token (gültig 24h)
          </div>
          Steht im Backend-Log beim ersten Start oder in
          <code className="mx-1">data/keys/setup.token</code>.
        </div>
        <div className="space-y-2">
          <Label htmlFor="setup-pw">Passwort (min. 12 Zeichen)</Label>
          <PasswordInput id="setup-pw" value={password} onChange={setPassword} autoComplete="new-password" />
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
          {loading ? "Einrichten …" : "Passwort festlegen"}
        </Button>
      </form>
    </Wrapper>
  );
}

function RecoveryForm({ onZurueck }: { onZurueck: () => void }) {
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [neuerCode, setNeuerCode] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setFehler(null);
    setLoading(true);
    try {
      const res = await piApi.post<{ recoveryCode: string }>("/auth/recovery/verwenden", {
        recoveryCode: code,
        neuesPasswort: pw,
      });
      setNeuerCode(res.recoveryCode);
    } catch (err) {
      if (err instanceof PiApiError) {
        if (err.status === 422) setFehler("Passwort: min. 12 Zeichen, 1 Ziffer + 1 Sonderzeichen.");
        else if (err.status === 401) setFehler("Recovery-Code ungültig.");
        else if (err.status === 429) setFehler("Zu viele Versuche, bitte warten.");
        else setFehler(err.message);
      } else setFehler(err instanceof Error ? err.message : "Fehler");
    } finally {
      setLoading(false);
    }
  }

  if (neuerCode) {
    return (
      <RecoveryAnzeige
        code={neuerCode}
        titel="Passwort zurückgesetzt"
        hinweis="Dein alter Recovery-Code ist verbraucht. Hier ist ein neuer Code für die Zukunft."
        onWeiter={onZurueck}
      />
    );
  }

  return (
    <Wrapper sub="Passwort mit Recovery-Code zurücksetzen.">
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="rec-code">Recovery-Code</Label>
          <Input
            id="rec-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            spellCheck={false}
            placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
            required
            className="font-mono"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rec-pw">Neues Passwort (min. 12 Zeichen)</Label>
          <PasswordInput id="rec-pw" value={pw} onChange={setPw} autoComplete="new-password" />
        </div>
        {fehler && <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{fehler}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? "Speichere …" : "Passwort zurücksetzen"}
        </Button>
        <Button type="button" variant="secondary" className="w-full" onClick={onZurueck}>
          Zurück zur Anmeldung
        </Button>
      </form>
    </Wrapper>
  );
}

function BackendOfflineScreen() {
  const { url, lastError, refresh, status } = useBackendStatus();
  const { refreshMe } = useAuth();

  // Bei Reconnect automatisch refreshen
  useEffect(() => {
    if (status === "connected") {
      void refreshMe();
    }
  }, [status, refreshMe]);

  return (
    <Wrapper sub="Verbindung zum Pi-Backend verloren.">
      <div className="space-y-4 text-sm">
        <div className="rounded-md border border-border bg-muted/40 p-3">
          <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
            <Server className="h-3.5 w-3.5" />
            Backend nicht erreichbar
          </div>
          <p className="text-muted-foreground">
            <code>{url}</code> antwortet nicht. Prüfe ob der Pi läuft und im Netzwerk erreichbar ist.
          </p>
          {lastError && <p className="mt-1 text-xs text-rose-700">{lastError}</p>}
        </div>
        <Button
          type="button"
          className="w-full"
          onClick={() => {
            refresh();
            void refreshMe();
          }}
        >
          <RefreshCw className="mr-2 h-4 w-4" />
          Erneut prüfen
        </Button>
      </div>
    </Wrapper>
  );
}

export function LockScreen() {
  const { mode } = useAuth();
  const [zeigeRecovery, setZeigeRecovery] = useState(false);
  if (mode === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Lade …
      </div>
    );
  }
  if (mode === "needs-setup") return <SetupForm />;
  if (mode === "logged-out") {
    if (zeigeRecovery) return <RecoveryForm onZurueck={() => setZeigeRecovery(false)} />;
    return <LoginForm onRecovery={() => setZeigeRecovery(true)} />;
  }
  return <BackendOfflineScreen />;
}
