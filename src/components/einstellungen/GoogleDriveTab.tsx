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
const DATEI_PLATZHALTER = ["{nummer}", "{kunde}", "{leistung}", "{MM}", "{YYYY}", "{datum}"];

function pfadVorschau(template: string): string {
  const now = new Date();
  return template
    .replace(/\{YYYY\}/g, String(now.getFullYear()))
    .replace(/\{MM\}/g, String(now.getMonth() + 1).padStart(2, "0"));
}

function dateiVorschau(template: string, beleg: "rechnung" | "angebot"): string {
  const now = new Date();
  return (
    template
      .replace(/\{nummer\}/g, beleg === "rechnung" ? "RE-2026-0042" : "AN-2026-0042")
      .replace(/\{kunde\}/g, "Mustermann GmbH")
      .replace(/\{leistung\}/g, "Buero-Reinigung")
      .replace(/\{MM\}/g, String(now.getMonth() + 1).padStart(2, "0"))
      .replace(/\{YYYY\}/g, String(now.getFullYear()))
      .replace(/\{datum\}/g, now.toISOString().slice(0, 10)) + ".pdf"
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
                  <p className="text-sm font-medium text-destructive">Letzter Upload fehlgeschlagen</p>
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
  const connect = useConnectGoogleDrive();
  const [email, setEmail] = useState("");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md bg-background">
        <DialogHeader>
          <DialogTitle>Mit Google verbinden</DialogTitle>
          <DialogDescription>
            Auf dem Pi öffnet sich der Google-Login. Hier im Mock-Modus reicht die Konto-Mail.
          </DialogDescription>
        </DialogHeader>
        <Field label="Konto-Mail" required>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="buero@mycleancenter.cm"
            autoFocus
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={() =>
              connect.mutate(
                { kontoEmail: email },
                {
                  onSuccess: () => {
                    toast.success("Google Drive verbunden");
                    onClose();
                    setEmail("");
                  },
                },
              )
            }
            disabled={!email.includes("@") || connect.isPending}
          >
            {connect.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Verbinden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
