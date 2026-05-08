// Tab "Google Drive": Verbindung + Ordner-/Dateinamen-Schemata + Auto-Upload
// + Synchronisations-Status (Upload-Queue mit Retry).
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Cloud,
  CloudOff,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Link as LinkIcon,
  RefreshCw,
  Copy,
  ExternalLink,
  RotateCcw,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  useGoogleDrive,
  useUpdateGoogleDrive,
  useConnectGoogleDrive,
  useDisconnectGoogleDrive,
  useTestGoogleDrive,
  useDriveUploads,
  useRetryDriveUpload,
  type DriveUpload,
} from "@/hooks/useApi";
import type { GoogleDriveEinstellungen } from "@/lib/api/types";
import { Field, Section, StickySaveBar } from "./_shared";
import { LoadingPlaceholder } from "@/components/layout/LoadingPlaceholder";
import { useConfirm } from "@/hooks/useConfirm";
import { getBackendUrl } from "@/lib/api/backendUrl";
import { cn } from "@/lib/utils";

const PFAD_PLATZHALTER = ["{YYYY}", "{MM}"];
const DATEI_PLATZHALTER = [
  "{nummer}",
  "{kunde}",
  "{leistung}",
  "{DD}",
  "{MM}",
  "{YYYY}",
  "{datum}",
];

function pfadVorschau(template: string): string {
  const now = new Date();
  return template
    .replace(/\{YYYY\}/g, String(now.getFullYear()))
    .replace(/\{MM\}/g, String(now.getMonth() + 1).padStart(2, "0"));
}

function dateiVorschau(template: string, beleg: "rechnung" | "angebot" | "protokoll"): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yyyy = String(now.getFullYear());
  const beispiel = {
    rechnung: { nummer: "RE-2026-0042", leistung: "Buero-Reinigung" },
    angebot: { nummer: "AN-2026-0042", leistung: "Buero-Reinigung" },
    protokoll: { nummer: "PR0526-01", leistung: "Goethestrasse 12" },
  }[beleg];
  return (
    template
      .replace(/\{nummer\}/g, beispiel.nummer)
      .replace(/\{kunde\}/g, "Mustermann GmbH")
      .replace(/\{leistung\}/g, beispiel.leistung)
      .replace(/\{DD\}/g, dd)
      .replace(/\{MM\}/g, mm)
      .replace(/\{YYYY\}/g, yyyy)
      .replace(/\{datum\}/g, `${yyyy}-${mm}-${dd}`) + ".pdf"
  );
}

export function GoogleDriveTab() {
  const { data, isLoading } = useGoogleDrive();
  const update = useUpdateGoogleDrive();
  const disconnect = useDisconnectGoogleDrive();
  const test = useTestGoogleDrive();
  const [form, setForm] = useState<GoogleDriveEinstellungen | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  // Wenn nach OAuth zurückgekehrt wird (verbunden==true), Connect-Dialog
  // automatisch schließen.
  useEffect(() => {
    if (form?.verbunden && connectOpen) setConnectOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form?.verbunden]);

  if (isLoading || !form || !data) return <LoadingPlaceholder />;

  const dirty = JSON.stringify(form) !== JSON.stringify(data);

  const save = () => {
    update.mutate(
      {
        rootOrdnerName: form.rootOrdnerName,
        unterordnerSchema: form.unterordnerSchema,
        dateinameSchema: form.dateinameSchema,
        autoUpload: form.autoUpload,
      },
      { onSuccess: () => toast.success("Google-Drive-Einstellungen gespeichert") },
    );
  };

  return (
    <div className="space-y-5 pb-24">
      {/* Verbindungs-Karte */}
      <Section title="Verbindung" description="Einmalig verbinden — gilt für alle Geräte im LAN.">
        {form.verbunden ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/30 p-4">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              <div className="flex-1">
                <p className="text-sm font-medium">Verbunden mit {form.kontoEmail}</p>
                {form.verbundenAm && (
                  <p className="text-xs text-muted-foreground">
                    Seit {new Date(form.verbundenAm).toLocaleDateString("de-DE")}
                  </p>
                )}
                {form.letzteSynchronisation && (
                  <p className="text-xs text-muted-foreground">
                    Letzter Upload:{" "}
                    {new Date(form.letzteSynchronisation).toLocaleString("de-DE", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  confirm(
                    {
                      title: "Verbindung trennen?",
                      description:
                        "PDFs werden ab sofort nicht mehr zu Drive hochgeladen, bis ihr neu verbindet.",
                      variant: "destructive",
                      confirmLabel: "Trennen",
                    },
                    () =>
                      disconnect.mutate(undefined, {
                        onSuccess: () => toast.success("Verbindung getrennt"),
                      }),
                  )
                }
              >
                <CloudOff className="mr-1.5 h-4 w-4" /> Trennen
              </Button>
            </div>

            {form.letzterFehler && (
              <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-destructive">
                    Letzter Upload fehlgeschlagen
                  </p>
                  <p className="text-xs text-muted-foreground">{form.letzterFehler}</p>
                </div>
              </div>
            )}

            <Button
              variant="outline"
              onClick={() =>
                test.mutate(undefined, {
                  onSuccess: (res) => {
                    if (res.erfolg) {
                      toast.success(res.nachricht);
                    } else {
                      toast.error(res.nachricht);
                    }
                  },
                })
              }
              disabled={test.isPending}
            >
              {test.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-1.5 h-4 w-4" />
              )}
              Test-Upload
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="grid h-14 w-14 place-content-center rounded-full bg-muted">
              <Cloud className="h-7 w-7 text-muted-foreground" />
            </div>
            <div>
              <p className="text-base font-medium">Noch nicht verbunden</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
                Verbindet euer Google-Konto, damit alle PDFs automatisch in eurem Drive-Ordner
                landen — fehlerfrei und ohne weiteren Klick.
              </p>
            </div>
            <Button onClick={() => setConnectOpen(true)} size="lg">
              <LinkIcon className="mr-2 h-4 w-4" /> Mit Google verbinden
            </Button>
          </div>
        )}
      </Section>

      {/* Synchronisation: Upload-Queue mit Retry */}
      {form.verbunden && <SynchronisationSection />}

      {/* Ordnerstruktur */}
      <Section
        title="Ordnerstruktur"
        description="Wo PDFs in eurem Drive abgelegt werden. Pfade sind relativ zum Root-Ordner."
      >
        <div className="space-y-4">
          <Field label="Root-Ordner-Name" required>
            <Input
              value={form.rootOrdnerName}
              onChange={(e) => setForm({ ...form, rootOrdnerName: e.target.value })}
              className="font-mono"
              disabled={!form.verbunden}
            />
          </Field>
          <Field label="Unterordner für Rechnungen" required>
            <Input
              value={form.unterordnerSchema.rechnungen}
              onChange={(e) =>
                setForm({
                  ...form,
                  unterordnerSchema: { ...form.unterordnerSchema, rechnungen: e.target.value },
                })
              }
              className="font-mono"
              disabled={!form.verbunden}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Beispiel:{" "}
              <span className="font-mono text-foreground">
                {form.rootOrdnerName}/{pfadVorschau(form.unterordnerSchema.rechnungen)}/
              </span>
            </p>
          </Field>
          <Field label="Unterordner für Angebote" required>
            <Input
              value={form.unterordnerSchema.angebote}
              onChange={(e) =>
                setForm({
                  ...form,
                  unterordnerSchema: { ...form.unterordnerSchema, angebote: e.target.value },
                })
              }
              className="font-mono"
              disabled={!form.verbunden}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Beispiel:{" "}
              <span className="font-mono text-foreground">
                {form.rootOrdnerName}/{pfadVorschau(form.unterordnerSchema.angebote)}/
              </span>
            </p>
          </Field>
          <Field label="Unterordner für Übergabe-/Abnahmeprotokolle" required>
            <Input
              value={
                form.unterordnerSchema.protokollUebergabe ??
                "Protokolle/Übergabe-Abnahme/{YYYY}/{MM}"
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  unterordnerSchema: {
                    ...form.unterordnerSchema,
                    protokollUebergabe: e.target.value,
                  },
                })
              }
              className="font-mono"
              disabled={!form.verbunden}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Beispiel:{" "}
              <span className="font-mono text-foreground">
                {form.rootOrdnerName}/
                {pfadVorschau(
                  form.unterordnerSchema.protokollUebergabe ??
                    "Protokolle/Übergabe-Abnahme/{YYYY}/{MM}",
                )}
                /
              </span>
            </p>
          </Field>
          <Field label="Unterordner für Schlüsselübergaben" required>
            <Input
              value={
                form.unterordnerSchema.protokollSchluessel ??
                "Protokolle/Schlüsselübergabe/{YYYY}/{MM}"
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  unterordnerSchema: {
                    ...form.unterordnerSchema,
                    protokollSchluessel: e.target.value,
                  },
                })
              }
              className="font-mono"
              disabled={!form.verbunden}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Beispiel:{" "}
              <span className="font-mono text-foreground">
                {form.rootOrdnerName}/
                {pfadVorschau(
                  form.unterordnerSchema.protokollSchluessel ??
                    "Protokolle/Schlüsselübergabe/{YYYY}/{MM}",
                )}
                /
              </span>
            </p>
          </Field>
          <PlatzhalterChips items={PFAD_PLATZHALTER} />
        </div>
      </Section>

      {/* Dateinamen */}
      <Section
        title="Dateinamen"
        description="Wie die PDFs heißen sollen. Endung .pdf wird automatisch ergänzt."
      >
        <div className="space-y-4">
          <Field label="Rechnung" required>
            <Input
              value={form.dateinameSchema.rechnung}
              onChange={(e) =>
                setForm({
                  ...form,
                  dateinameSchema: { ...form.dateinameSchema, rechnung: e.target.value },
                })
              }
              className="font-mono"
              disabled={!form.verbunden}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Vorschau:{" "}
              <span className="font-mono text-foreground">
                {dateiVorschau(form.dateinameSchema.rechnung, "rechnung")}
              </span>
            </p>
          </Field>
          <Field label="Angebot" required>
            <Input
              value={form.dateinameSchema.angebot}
              onChange={(e) =>
                setForm({
                  ...form,
                  dateinameSchema: { ...form.dateinameSchema, angebot: e.target.value },
                })
              }
              className="font-mono"
              disabled={!form.verbunden}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Vorschau:{" "}
              <span className="font-mono text-foreground">
                {dateiVorschau(form.dateinameSchema.angebot, "angebot")}
              </span>
            </p>
          </Field>
          <Field label="Protokoll (Übergabe / Schlüssel)" required>
            <Input
              value={
                form.dateinameSchema.protokoll ?? "{nummer} {kunde} {leistung} {DD}-{MM}-{YYYY}"
              }
              onChange={(e) =>
                setForm({
                  ...form,
                  dateinameSchema: { ...form.dateinameSchema, protokoll: e.target.value },
                })
              }
              className="font-mono"
              disabled={!form.verbunden}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Vorschau:{" "}
              <span className="font-mono text-foreground">
                {dateiVorschau(
                  form.dateinameSchema.protokoll ?? "{nummer} {kunde} {leistung} {DD}-{MM}-{YYYY}",
                  "protokoll",
                )}
              </span>
              <br />
              <span className="text-[11px]">
                <code className="font-mono">{"{leistung}"}</code> wird beim Protokoll mit dem
                Objekt-Namen befüllt.
              </span>
            </p>
          </Field>
          <PlatzhalterChips items={DATEI_PLATZHALTER} />
        </div>
      </Section>

      {/* Auto-Upload */}
      <Section title="Verhalten">
        <label className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/30 p-4">
          <div>
            <p className="text-sm font-medium">Automatisch hochladen</p>
            <p className="text-xs text-muted-foreground">
              Beim Erstellen oder Versenden landet das PDF sofort im richtigen Drive-Ordner.
            </p>
          </div>
          <Switch
            checked={form.autoUpload}
            onCheckedChange={(v) => setForm({ ...form, autoUpload: v })}
            disabled={!form.verbunden}
          />
        </label>
      </Section>

      <ConnectDialog open={connectOpen} onClose={() => setConnectOpen(false)} />
      {confirmDialog}

      <StickySaveBar
        dirty={dirty}
        saving={update.isPending}
        onReset={() => setForm(data)}
        onSave={save}
      />
    </div>
  );
}

function PlatzhalterChips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      <span className="text-xs text-muted-foreground">Verfügbar:</span>
      {items.map((p) => (
        <code
          key={p}
          className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
        >
          {p}
        </code>
      ))}
    </div>
  );
}

function ConnectDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data } = useGoogleDrive();
  const update = useUpdateGoogleDrive();
  const connect = useConnectGoogleDrive();
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [waitingForOauth, setWaitingForOauth] = useState(false);

  // Felder beim Öffnen vorbelegen, falls schon hinterlegt.
  useEffect(() => {
    if (open && data) setClientId(data.clientId ?? "");
    if (!open) {
      setClientSecret("");
      setWaitingForOauth(false);
    }
  }, [open, data]);

  // WICHTIG: Redirect-URI MUSS vom Backend kommen, nicht vom aktuellen Browser-Host.
  // Sonst zeigt das Handy eine andere URL an als der PC und Google lehnt OAuth ab.
  // So reicht ein einmaliger Eintrag in der Cloud Console — gilt für alle Geräte.
  const redirectUri =
    data?.redirectUri ?? `${getBackendUrl()}/einstellungen/google-drive/callback`;
  const secretSchonHinterlegt = data?.clientSecretIsSet ?? false;
  const canSubmit =
    clientId.trim().length > 8 &&
    (clientSecret.trim().length > 0 || secretSchonHinterlegt) &&
    !connect.isPending &&
    !update.isPending;

  const copyRedirectUri = async () => {
    try {
      await navigator.clipboard.writeText(redirectUri);
      toast.success("Redirect-URI kopiert");
    } catch {
      toast.error("Konnte nicht kopieren — bitte manuell markieren");
    }
  };

  const handleConnect = async () => {
    try {
      // 1) Client-ID/Secret speichern (Secret nur wenn neu eingegeben).
      const patch: Record<string, unknown> = { clientId: clientId.trim() };
      if (clientSecret.trim().length > 0) patch.clientSecret = clientSecret.trim();
      await update.mutateAsync(patch as Partial<GoogleDriveEinstellungen>);
      // 2) Authorize-URL holen + im neuen Tab öffnen.
      const { authorizeUrl } = await connect.mutateAsync();
      const win = window.open(authorizeUrl, "_blank", "noopener,noreferrer");
      if (!win) {
        toast.error("Bitte Pop-ups für diese Seite erlauben.");
        return;
      }
      setWaitingForOauth(true);
    } catch (e) {
      toast.error((e as Error).message ?? "Verbinden fehlgeschlagen");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg bg-background">
        <DialogHeader>
          <DialogTitle>Mit Google Drive verbinden</DialogTitle>
          <DialogDescription>
            Einmalig OAuth-Zugangsdaten hinterlegen. Sie werden verschlüsselt auf dem Pi gespeichert
            und gelten für alle Geräte im LAN.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Schritt-für-Schritt-Hinweis */}
          <div className="rounded-xl border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="mb-2 font-medium text-foreground">So holst du dir Client-ID & Secret:</p>
            <ol className="list-decimal space-y-1 pl-4">
              <li>
                In der{" "}
                <a
                  href="https://console.cloud.google.com/apis/credentials"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Google Cloud Console
                </a>{" "}
                einen OAuth-2.0-Client (Typ „Web") anlegen.
              </li>
              <li>Drive-API aktivieren und Scope „drive.file" zulassen.</li>
              <li>Folgende Redirect-URI im Client eintragen:</li>
            </ol>
            <div className="mt-2 flex items-center gap-1.5">
              <code className="flex-1 truncate rounded-md bg-background px-2 py-1.5 font-mono text-[11px] text-foreground">
                {redirectUri}
              </code>
              <Button variant="outline" size="sm" onClick={copyRedirectUri} className="h-8 px-2">
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          <Field label="OAuth Client-ID" required>
            <Input
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="123456789-abcdef.apps.googleusercontent.com"
              autoFocus
              className="font-mono text-xs"
            />
          </Field>
          <Field
            label="Client Secret"
            required={!secretSchonHinterlegt}
            hint={
              secretSchonHinterlegt
                ? "Bereits hinterlegt — leer lassen, um es nicht zu ändern."
                : undefined
            }
          >
            <Input
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder={secretSchonHinterlegt ? "•••••••• (unverändert)" : "GOCSPX-…"}
              className="font-mono text-xs"
            />
          </Field>

          {waitingForOauth && (
            <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs">
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
              <p>
                Google-Login im neuen Tab abschließen. Dieses Fenster schließt sich automatisch,
                sobald die Verbindung steht.
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={handleConnect} disabled={!canSubmit}>
            {(connect.isPending || update.isPending) && (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            )}
            <LinkIcon className="mr-1.5 h-4 w-4" />
            Mit Google verbinden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Synchronisations-Sektion: Counter + Liste fehlgeschlagener Uploads + Retry
// =============================================================================
function SynchronisationSection() {
  const { data: uploads = [], isLoading } = useDriveUploads();
  const retry = useRetryDriveUpload();
  const [showAll, setShowAll] = useState(false);

  const counts = useMemo(() => {
    const c = { pending: 0, running: 0, erfolg: 0, fehler: 0, manuell: 0 };
    for (const u of uploads) c[u.status]++;
    return c;
  }, [uploads]);

  const probleme = uploads.filter((u) => u.status === "fehler" || u.status === "manuell");
  const visibleProbleme = showAll ? probleme : probleme.slice(0, 5);

  const handleRetry = (u: DriveUpload) => {
    retry.mutate(u.id, {
      onSuccess: () => toast.info(`„${u.dateiName}" wird erneut versucht`),
      onError: (e) => toast.error((e as Error).message),
    });
  };

  return (
    <Section
      title="Synchronisation"
      description="Status aller PDF-Uploads ins Drive. Fehlgeschlagene Uploads kannst du manuell wiederholen."
    >
      {isLoading ? (
        <div className="py-3 text-center text-xs text-muted-foreground">
          <Loader2 className="mx-auto h-4 w-4 animate-spin" />
        </div>
      ) : (
        <>
          {/* Counter-Zeile */}
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-xs">
            <CounterPill
              icon={<Loader2 className="h-3 w-3" />}
              label="läuft"
              value={counts.running}
              tone="primary"
            />
            <CounterPill label="in Warteschlange" value={counts.pending} />
            <CounterPill label="erfolgreich" value={counts.erfolg} tone="success" />
            <CounterPill label="manuell" value={counts.manuell} tone="warn" />
            {counts.fehler > 0 && <CounterPill label="Fehler" value={counts.fehler} tone="error" />}
          </div>

          {/* Problem-Liste oder Alles-OK */}
          {probleme.length === 0 ? (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-muted/30 px-4 py-2.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-success" />
              Alles synchron — keine offenen Probleme.
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-card">
              {visibleProbleme.map((u) => (
                <li key={u.id} className="flex items-start gap-3 px-3 py-2.5">
                  <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-xs">{u.dateiName}</p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      <span className="rounded bg-muted px-1.5 py-0.5 font-medium">
                        {u.belegArt}
                      </span>{" "}
                      · Versuche: {u.versuche}
                      {u.status === "manuell" && " · gibt jetzt nur noch manuell weiter"}
                    </p>
                    {u.fehlerText && (
                      <p className="mt-1 line-clamp-2 text-[11px] text-destructive">
                        {u.fehlerText}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {u.driveWebLink && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="In Drive öffnen"
                        onClick={() =>
                          window.open(u.driveWebLink!, "_blank", "noopener,noreferrer")
                        }
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 px-2 text-xs"
                      onClick={() => handleRetry(u)}
                      disabled={retry.isPending}
                    >
                      <RotateCcw className="mr-1 h-3.5 w-3.5" />
                      Erneut
                    </Button>
                  </div>
                </li>
              ))}
              {probleme.length > 5 && !showAll && (
                <li className="px-3 py-2 text-center">
                  <Button variant="link" size="sm" onClick={() => setShowAll(true)}>
                    Alle {probleme.length} anzeigen
                  </Button>
                </li>
              )}
            </ul>
          )}
        </>
      )}
    </Section>
  );
}

function CounterPill({
  icon,
  label,
  value,
  tone = "default",
}: {
  icon?: React.ReactNode;
  label: string;
  value: number;
  tone?: "default" | "primary" | "success" | "warn" | "error";
}) {
  const toneClass = {
    default: "text-muted-foreground",
    primary: "text-primary",
    success: "text-success",
    warn: "text-amber-600 dark:text-amber-400",
    error: "text-destructive",
  }[tone];
  return (
    <span className={cn("inline-flex items-center gap-1", toneClass)}>
      {icon}
      <span className="font-semibold tabular-nums">{value}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
