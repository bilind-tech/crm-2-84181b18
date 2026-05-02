// Backend-Verbindung (Pi-Backend). Pro Gerät — Backend-URL in localStorage.
import { useState } from "react";
import { CheckCircle2, XCircle, RefreshCw, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  getBackendUrl,
  setBackendUrl,
} from "@/lib/api/backendUrl";
import { useBackendStatus } from "@/hooks/useBackendStatus";
import { cn } from "@/lib/utils";

export function BackendVerbindungTab() {
  const [draft, setDraft] = useState<string>(getBackendUrl());
  const { status, url, health, lastError, lastCheck, refresh } = useBackendStatus();

  const speichern = () => {
    setBackendUrl(draft);
    toast.success("Backend-URL gespeichert");
    refresh();
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-start gap-3">
          <Server className="mt-0.5 h-5 w-5 text-muted-foreground" />
          <div>
            <h2 className="text-lg font-semibold">Backend-Verbindung</h2>
            <p className="text-sm text-muted-foreground">
              Adresse des Raspberry-Pi-Backends. Diese Einstellung gilt nur für
              dieses Gerät.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="backend-url">Backend-URL</Label>
            <div className="mt-1 flex gap-2">
              <Input
                id="backend-url"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="http://mycleancenter.local:8787"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                inputMode="url"
              />
              <Button onClick={speichern}>Speichern</Button>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">
              Lokal: <code>http://localhost:8787</code> · Im LAN:{" "}
              <code>http://mycleancenter.local:8787</code>
            </p>
          </div>

          <div
            className={cn(
              "flex items-start gap-3 rounded-lg border p-4",
              status === "connected"
                ? "border-emerald-500/30 bg-emerald-500/5"
                : status === "disconnected"
                  ? "border-rose-500/30 bg-rose-500/5"
                  : "border-border bg-muted/30",
            )}
          >
            {status === "connected" ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" />
            ) : status === "disconnected" ? (
              <XCircle className="mt-0.5 h-5 w-5 text-rose-600" />
            ) : (
              <RefreshCw className="mt-0.5 h-5 w-5 animate-spin text-muted-foreground" />
            )}

            <div className="min-w-0 flex-1 space-y-1 text-sm">
              <p className="font-medium">
                {status === "connected" && "Verbunden"}
                {status === "disconnected" && "Nicht erreichbar"}
                {status === "checking" && "Prüfe Verbindung …"}
              </p>
              <p className="truncate text-xs text-muted-foreground">{url}</p>

              {status === "connected" && health && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 pt-1 text-xs text-muted-foreground">
                  <dt>Version</dt>
                  <dd className="text-foreground">{health.version}</dd>
                  <dt>Schema</dt>
                  <dd className="text-foreground">v{health.schemaVersion}</dd>
                  <dt>Datenbank</dt>
                  <dd className="text-foreground">
                    {health.db.ok ? "OK" : "Fehler"}
                    {health.db.wal ? " · WAL" : ""}
                  </dd>
                  <dt>Master-Key</dt>
                  <dd className="text-foreground">
                    {health.masterKey.present ? "vorhanden" : "fehlt"}
                  </dd>
                  <dt>Uptime</dt>
                  <dd className="text-foreground">
                    {Math.floor(health.uptimeSec / 60)} min
                  </dd>
                </dl>
              )}

              {status === "disconnected" && lastError && (
                <p className="text-xs text-rose-700">{lastError}</p>
              )}

              {lastCheck && (
                <p className="pt-1 text-[10px] text-muted-foreground">
                  Zuletzt geprüft: {lastCheck.toLocaleTimeString("de-DE")}
                </p>
              )}
            </div>

            <Button
              size="sm"
              variant="ghost"
              onClick={refresh}
              className="shrink-0"
              title="Jetzt prüfen"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-6 text-sm shadow-sm">
        <h3 className="mb-2 font-semibold">Backend lokal starten</h3>
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>
            Im Repo: <code>cd backend && npm install</code>
          </li>
          <li>
            <code>npm run dev</code> startet Fastify auf Port 8787
          </li>
          <li>
            Daten landen lokal in <code>backend/data/</code>
          </li>
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          Auf dem Pi: <code>DATA_DIR=/var/lib/mycleancenter</code> und
          <code> NODE_ENV=production</code>.
        </p>
      </div>
    </div>
  );
}
