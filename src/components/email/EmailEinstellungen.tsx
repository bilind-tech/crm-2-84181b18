/* eslint-disable react-hooks/exhaustive-deps */
// E-Mail-Einstellungen-Tab: Vorlagen, Signaturen, SMTP.
// Eingebettet in src/routes/einstellungen.tsx via Subkomponenten.

import { useEffect, useState } from "react";
import { LoadingPlaceholder } from "@/components/layout/LoadingPlaceholder";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Star, Check, AlertCircle, Loader2, Eye, Code2, Zap, Send, ShieldCheck, ShieldAlert, Info } from "lucide-react";
import { isBackendUrlExplicit } from "@/lib/api/backendUrl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useEmailVorlagen,
  useCreateEmailVorlage,
  useUpdateEmailVorlage,
  useDeleteEmailVorlage,
  useEmailSignaturen,
  useCreateEmailSignatur,
  useUpdateEmailSignatur,
  useDeleteEmailSignatur,
  useSmtp,
  useUpdateSmtp,
  // useTestSmtp entfernt — Schnelltest durch verify ersetzt.
  useVerifySmtp,
  useSendTestMail,
} from "@/hooks/useApi";
import type { EmailVorlage, EmailSignatur, EmailKontext } from "@/lib/api/types";
import { ALLE_PLATZHALTER } from "@/lib/email/placeholders";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/hooks/useConfirm";

// =============================================================================
// VORLAGEN-TAB
// =============================================================================

export function EmailVorlagenTab() {
  const { data: vorlagen = [] } = useEmailVorlagen();
  const create = useCreateEmailVorlage();
  const update = useUpdateEmailVorlage();
  const del = useDeleteEmailVorlage();
  const [editing, setEditing] = useState<EmailVorlage | null>(null);
  const [creating, setCreating] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">E-Mail-Vorlagen</h2>
            <p className="text-sm text-muted-foreground">
              Wiederverwendbare Vorlagen für Angebote, Rechnungen und Mahnungen.
            </p>
          </div>
          <Button onClick={() => setCreating(true)} className="rounded-lg">
            <Plus className="mr-1.5 h-4 w-4" /> Neue Vorlage
          </Button>
        </div>

        {vorlagen.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Noch keine Vorlagen angelegt.</p>
        ) : (
          <ul className="divide-y divide-border">
            {vorlagen.map((v) => (
              <li key={v.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{v.name}</p>
                    {v.istStandard && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        <Star className="h-2.5 w-2.5" /> Standard
                      </span>
                    )}
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
                      {v.kontext}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{v.betreff}</p>
                </div>
                <div className="flex items-center gap-1">
                  {!v.istStandard && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        update.mutate(
                          { id: v.id, istStandard: true },
                          { onSuccess: () => toast.success("Als Standard markiert") },
                        )
                      }
                      title="Als Standard für Kontext setzen"
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setEditing(v)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      confirm(
                        {
                          title: "Vorlage löschen?",
                          description: `„${v.name}" dauerhaft entfernen.`,
                          variant: "destructive",
                          confirmLabel: "Löschen",
                        },
                        () =>
                          del.mutate(v.id, {
                            onSuccess: () => toast.success("Vorlage gelöscht"),
                          }),
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <PlatzhalterHinweis />

      {(editing || creating) && (
        <VorlageDialog
          vorlage={editing}
          open
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSave={(data) => {
            if (editing) {
              update.mutate(
                { id: editing.id, ...data },
                {
                  onSuccess: () => {
                    toast.success("Vorlage aktualisiert");
                    setEditing(null);
                  },
                },
              );
            } else {
              create.mutate(data, {
                onSuccess: () => {
                  toast.success("Vorlage angelegt");
                  setCreating(false);
                },
              });
            }
          }}
        />
      )}
      {confirmDialog}
    </div>
  );
}

function VorlageDialog({
  vorlage,
  open,
  onClose,
  onSave,
}: {
  vorlage: EmailVorlage | null;
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<EmailVorlage>) => void;
}) {
  const [name, setName] = useState(vorlage?.name ?? "");
  const [kontext, setKontext] = useState<EmailKontext>(vorlage?.kontext ?? "allgemein");
  const [betreff, setBetreff] = useState(vorlage?.betreff ?? "");
  const [koerperHtml, setKoerperHtml] = useState(vorlage?.koerperHtml ?? "");
  const [istStandard, setIstStandard] = useState(vorlage?.istStandard ?? false);
  const [mode, setMode] = useState<"html" | "vorschau">("html");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto bg-background">
        <DialogHeader>
          <DialogTitle>{vorlage ? "Vorlage bearbeiten" : "Neue Vorlage"}</DialogTitle>
          <DialogDescription>
            Nutze {`{{platzhalter}}`} für dynamische Inhalte (Kunde, Angebot, Rechnung, Firma).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" required>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
            <Field label="Kontext" required>
              <Select value={kontext} onValueChange={(v) => setKontext(v as EmailKontext)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="angebot">Angebot</SelectItem>
                  <SelectItem value="rechnung">Rechnung</SelectItem>
                  <SelectItem value="mahnung">Mahnung</SelectItem>
                  <SelectItem value="allgemein">Allgemein</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Betreff" required>
            <Input value={betreff} onChange={(e) => setBetreff(e.target.value)} />
          </Field>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs font-medium">HTML-Inhalt</Label>
              <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
                <button
                  type="button"
                  onClick={() => setMode("html")}
                  className={cn(
                    "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium",
                    mode === "html" ? "bg-card shadow-sm ring-1 ring-border" : "text-muted-foreground",
                  )}
                >
                  <Code2 className="mr-1 h-3.5 w-3.5" /> HTML
                </button>
                <button
                  type="button"
                  onClick={() => setMode("vorschau")}
                  className={cn(
                    "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium",
                    mode === "vorschau" ? "bg-card shadow-sm ring-1 ring-border" : "text-muted-foreground",
                  )}
                >
                  <Eye className="mr-1 h-3.5 w-3.5" /> Vorschau
                </button>
              </div>
            </div>
            {mode === "html" ? (
              <Textarea
                value={koerperHtml}
                onChange={(e) => setKoerperHtml(e.target.value)}
                rows={14}
                className="font-mono text-xs"
              />
            ) : (
              <iframe
                title="Vorlage Vorschau"
                sandbox=""
                srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,sans-serif;font-size:14px;line-height:1.6;padding:20px;}</style></head><body>${koerperHtml}</body></html>`}
                className="block h-[360px] w-full rounded-lg border border-border bg-white"
              />
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={istStandard}
              onChange={(e) => setIstStandard(e.target.checked)}
              className="h-4 w-4"
            />
            <span>Als Standard für Kontext „{kontext}" verwenden</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button
            onClick={() =>
              onSave({ name, kontext, betreff, koerperHtml, istStandard })
            }
            disabled={!name.trim() || !betreff.trim()}
          >
            <Check className="mr-1.5 h-4 w-4" /> Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// SIGNATUREN-TAB
// =============================================================================

export function EmailSignaturenTab() {
  const { data: signaturen = [] } = useEmailSignaturen();
  const create = useCreateEmailSignatur();
  const update = useUpdateEmailSignatur();
  const del = useDeleteEmailSignatur();
  const [editing, setEditing] = useState<EmailSignatur | null>(null);
  const [creating, setCreating] = useState(false);
  const { confirm, dialog: confirmDialog } = useConfirm();

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">E-Mail-Signaturen</h2>
            <p className="text-sm text-muted-foreground">
              HTML-Signaturen mit Logo, Bild oder Kontaktdaten.
            </p>
          </div>
          <Button onClick={() => setCreating(true)} className="rounded-lg">
            <Plus className="mr-1.5 h-4 w-4" /> Neue Signatur
          </Button>
        </div>

        {signaturen.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Noch keine Signaturen angelegt.</p>
        ) : (
          <ul className="divide-y divide-border">
            {signaturen.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{s.name}</p>
                    {s.istStandard && (
                      <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        <Star className="h-2.5 w-2.5" /> Standard
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {!s.istStandard && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        update.mutate(
                          { id: s.id, istStandard: true },
                          { onSuccess: () => toast.success("Als Standard markiert") },
                        )
                      }
                    >
                      <Star className="h-4 w-4" />
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => setEditing(s)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      confirm(
                        {
                          title: "Signatur löschen?",
                          description: `„${s.name}" dauerhaft entfernen.`,
                          variant: "destructive",
                          confirmLabel: "Löschen",
                        },
                        () =>
                          del.mutate(s.id, {
                            onSuccess: () => toast.success("Signatur gelöscht"),
                          }),
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {(editing || creating) && (
        <SignaturDialog
          signatur={editing}
          open
          onClose={() => {
            setEditing(null);
            setCreating(false);
          }}
          onSave={(data) => {
            if (editing) {
              update.mutate(
                { id: editing.id, ...data },
                { onSuccess: () => { toast.success("Signatur aktualisiert"); setEditing(null); } },
              );
            } else {
              create.mutate(data, {
                onSuccess: () => { toast.success("Signatur angelegt"); setCreating(false); },
              });
            }
          }}
        />
      )}
      {confirmDialog}
    </div>
  );
}

function SignaturDialog({
  signatur,
  open,
  onClose,
  onSave,
}: {
  signatur: EmailSignatur | null;
  open: boolean;
  onClose: () => void;
  onSave: (data: Partial<EmailSignatur>) => void;
}) {
  const [name, setName] = useState(signatur?.name ?? "");
  const [html, setHtml] = useState(signatur?.html ?? "");
  const [istStandard, setIstStandard] = useState(signatur?.istStandard ?? false);
  const [mode, setMode] = useState<"html" | "vorschau">("html");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto bg-background">
        <DialogHeader>
          <DialogTitle>{signatur ? "Signatur bearbeiten" : "Neue Signatur"}</DialogTitle>
          <DialogDescription>
            HTML mit Bildern, Logos und Links — wird ans Ende jeder E-Mail angefügt.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <Field label="Name" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs font-medium">HTML</Label>
              <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
                <button
                  type="button"
                  onClick={() => setMode("html")}
                  className={cn("rounded-md px-2.5 py-1 text-xs", mode === "html" && "bg-card ring-1 ring-border")}
                >
                  <Code2 className="mr-1 inline h-3.5 w-3.5" /> HTML
                </button>
                <button
                  type="button"
                  onClick={() => setMode("vorschau")}
                  className={cn("rounded-md px-2.5 py-1 text-xs", mode === "vorschau" && "bg-card ring-1 ring-border")}
                >
                  <Eye className="mr-1 inline h-3.5 w-3.5" /> Vorschau
                </button>
              </div>
            </div>
            {mode === "html" ? (
              <Textarea
                value={html}
                onChange={(e) => setHtml(e.target.value)}
                rows={12}
                className="font-mono text-xs"
              />
            ) : (
              <iframe
                title="Signatur Vorschau"
                sandbox=""
                srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,sans-serif;font-size:14px;padding:20px;}</style></head><body>${html}</body></html>`}
                className="block h-[260px] w-full rounded-lg border border-border bg-white"
              />
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={istStandard}
              onChange={(e) => setIstStandard(e.target.checked)}
              className="h-4 w-4"
            />
            <span>Als Standard-Signatur verwenden</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={() => onSave({ name, html, istStandard })} disabled={!name.trim()}>
            <Check className="mr-1.5 h-4 w-4" /> Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// SMTP-TAB
// =============================================================================

export function SmtpTab() {
  const { data: smtp } = useSmtp();
  const update = useUpdateSmtp();
  // Schnelltest entfernt — Verbindung-prüfen (verify) ist die robuste Variante.
  const verify = useVerifySmtp();
  const sendTest = useSendTestMail();
  const demoModus = !isBackendUrlExplicit();
  const [form, setForm] = useState({
    server: smtp?.server ?? "",
    port: smtp?.port ?? 587,
    benutzer: smtp?.benutzer ?? "",
    absenderName: smtp?.absenderName ?? "",
    absenderEmail: smtp?.absenderEmail ?? "",
    ssl: smtp?.ssl ?? true,
    passwort: "",
  });
  const [status, setStatus] = useState<{
    state: "unknown" | "ok" | "error" | "demo";
    nachricht?: string;
    code?: string;
    latencyMs?: number;
  }>({ state: "unknown" });
  const [testEmpfaenger, setTestEmpfaenger] = useState("");

  // Synchronisiere wenn Daten ankommen
  useEffect(() => {
    if (smtp) {
      setForm((f) => ({
        server: smtp.server,
        port: smtp.port,
        benutzer: smtp.benutzer,
        absenderName: smtp.absenderName,
        absenderEmail: smtp.absenderEmail,
        ssl: smtp.ssl,
        passwort: f.passwort,
      }));
    }
  }, [smtp]);

  if (!smtp) return <LoadingPlaceholder />;

  const handleSpeichern = () => {
    const payload: Record<string, unknown> = {
      server: form.server,
      port: form.port,
      benutzer: form.benutzer,
      absenderName: form.absenderName,
      absenderEmail: form.absenderEmail,
      ssl: form.ssl,
    };
    if (form.passwort) payload.passwort = form.passwort;
    update.mutate(payload as Parameters<typeof update.mutate>[0], {
      onSuccess: () => {
        toast.success("SMTP-Einstellungen gespeichert");
        setForm((f) => ({ ...f, passwort: "" }));
        setStatus({ state: "unknown" });
      },
    });
  };

  const handleStratoPreset = () => {
    setForm((f) => ({
      ...f,
      server: "smtp.strato.de",
      port: 465,
      ssl: true,
    }));
    toast.info("Strato-Preset eingefügt — bitte Benutzer/Passwort prüfen und speichern.");
  };

  const handleVerify = () => {
    setStatus({ state: "unknown" });
    verify.mutate(undefined, {
      onSuccess: (res) => {
        if (res.demo) {
          setStatus({ state: "demo", nachricht: res.error, code: res.errorCode });
          toast.info("Demo-Modus", { description: res.error });
        } else if (res.ok) {
          setStatus({ state: "ok", latencyMs: res.latencyMs });
          toast.success(`Verbindung erfolgreich${res.latencyMs ? ` (${res.latencyMs} ms)` : ""}`);
        } else {
          setStatus({ state: "error", nachricht: res.error, code: res.errorCode });
          toast.error(`Verbindung fehlgeschlagen: ${res.error ?? "Unbekannter Fehler"}`);
        }
      },
      onError: (e: unknown) => {
        const msg = (e as Error)?.message ?? "Unbekannter Fehler";
        setStatus({ state: "error", nachricht: msg });
        toast.error(`Verbindung fehlgeschlagen: ${msg}`);
      },
    });
  };

  const handleSendTest = () => {
    const adr = testEmpfaenger.trim();
    if (!adr) {
      toast.error("Bitte Empfängeradresse für Test-Mail angeben.");
      return;
    }
    sendTest.mutate(adr, {
      onSuccess: (res) => {
        if (res.demo) toast.info("Demo-Modus — nicht versendet", { description: res.error });
        else if (res.ok) toast.success(`Test-Mail an ${adr} versendet`);
        else toast.error(`Test-Mail fehlgeschlagen: ${res.error ?? "Unbekannt"}`);
      },
      onError: (e: unknown) =>
        toast.error(`Test-Mail fehlgeschlagen: ${(e as Error)?.message ?? ""}`),
    });
  };

  return (
    <div className="space-y-4">
      {/* Demo-Modus-Hinweis (nur im Lovable-Preview ohne Pi-Backend-URL) */}
      {demoModus && (
        <div className="flex items-start gap-2 rounded-xl border border-primary/40 bg-primary/5 p-4 text-sm">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="space-y-0.5">
            <p className="font-medium text-foreground">Demo-Modus — kein echter SMTP-Test, kein realer Versand</p>
            <p className="text-muted-foreground">
              Du arbeitest gerade ohne Pi-Backend. Eingaben werden lokal im Browser gespeichert,
              aber „Verbindung prüfen" und „Test-Mail" können hier nicht real ausgeführt werden.
              Sobald der Pi läuft und die Backend-URL eingetragen ist, funktioniert alles sofort.
            </p>
          </div>
        </div>
      )}

      {/* Manual-Only Hinweis */}
      <div className="flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="space-y-0.5">
          <p className="font-medium text-foreground">Manueller Versand garantiert</p>
          <p className="text-muted-foreground">
            E-Mails werden ausschließlich nach deinem direkten Klick verschickt — keine
            Hintergrund-Jobs, keine Cron-Mails, keine automatischen Mahnungen.
          </p>
        </div>
      </div>

      {/* Status-Banner */}
      {status.state !== "unknown" && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-xl border p-4 text-sm",
            status.state === "ok"
              ? "border-success/40 bg-success/5"
              : status.state === "demo"
                ? "border-primary/40 bg-primary/5"
                : "border-destructive/40 bg-destructive/5",
          )}
        >
          {status.state === "ok" ? (
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          ) : status.state === "demo" ? (
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          ) : (
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          )}
          <div className="space-y-0.5">
            <p className="font-medium text-foreground">
              {status.state === "ok"
                ? `Verbindung OK${status.latencyMs ? ` · ${status.latencyMs} ms` : ""}`
                : status.state === "demo"
                  ? "Demo-Modus — keine echte Prüfung"
                  : "Verbindung fehlgeschlagen"}
            </p>
            {status.nachricht && (
              <p className="text-muted-foreground">
                {status.code && <span className="font-mono text-xs">[{status.code}] </span>}
                {status.nachricht}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">SMTP-Server</h2>
            <p className="text-sm text-muted-foreground">
              Zugangsdaten für den E-Mail-Versand. Das Passwort wird verschlüsselt im Pi-Backend
              gespeichert und nie zurückgegeben.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleStratoPreset}
            className="shrink-0 gap-1.5"
          >
            <Zap className="h-3.5 w-3.5" /> Strato-Preset
          </Button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="SMTP-Server" required>
            <Input
              value={form.server}
              onChange={(e) => setForm({ ...form, server: e.target.value })}
              placeholder="smtp.strato.de"
            />
          </Field>
          <Field label="Port" required>
            <Input
              type="number"
              value={form.port}
              onChange={(e) => setForm({ ...form, port: Number(e.target.value) })}
            />
          </Field>
          <Field label="Benutzername" required>
            <Input
              value={form.benutzer}
              onChange={(e) => setForm({ ...form, benutzer: e.target.value })}
            />
          </Field>
          <Field
            label={
              smtp.passwortGesetzt
                ? "Passwort (gesetzt — leer lassen um zu behalten)"
                : "Passwort"
            }
            required={!smtp.passwortGesetzt}
          >
            <Input
              type="password"
              value={form.passwort}
              onChange={(e) => setForm({ ...form, passwort: e.target.value })}
              placeholder={smtp.passwortGesetzt ? "••••••••" : "Passwort eingeben"}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Absender-Name" required>
            <Input
              value={form.absenderName}
              onChange={(e) => setForm({ ...form, absenderName: e.target.value })}
            />
          </Field>
          <Field label="Absender-E-Mail" required>
            <Input
              type="email"
              value={form.absenderEmail}
              onChange={(e) => setForm({ ...form, absenderEmail: e.target.value })}
            />
          </Field>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.ssl}
                onChange={(e) => setForm({ ...form, ssl: e.target.checked })}
                className="h-4 w-4"
              />
              <span>SSL/TLS verwenden (empfohlen — Strato Port 465)</span>
            </label>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={handleVerify}
              disabled={verify.isPending || !smtp.passwortGesetzt}
              className="gap-1.5"
            >
              {verify.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              Verbindung prüfen
            </Button>
            {/* Schnelltest entfernt — „Verbindung prüfen" (verify) ist die robuste Variante. */}
          </div>
          <Button onClick={handleSpeichern} disabled={update.isPending}>
            <Check className="mr-1.5 h-4 w-4" /> Speichern
          </Button>
        </div>
      </div>

      {/* Test-Mail Karte */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4">
          <h2 className="text-lg font-semibold">Test-Mail senden</h2>
          <p className="text-sm text-muted-foreground">
            Schickt genau eine Mail an die angegebene Adresse — nur per Klick, kein Auto-Versand.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="email"
            value={testEmpfaenger}
            onChange={(e) => setTestEmpfaenger(e.target.value)}
            placeholder="empfaenger@beispiel.de"
            className="flex-1"
          />
          <Button
            onClick={handleSendTest}
            disabled={
              sendTest.isPending ||
              !smtp.passwortGesetzt ||
              !testEmpfaenger.trim()
            }
            className="gap-1.5"
          >
            {sendTest.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Test-Mail senden
          </Button>
        </div>
        {!smtp.passwortGesetzt && (
          <p className="mt-2 text-xs text-muted-foreground">
            Erst SMTP-Passwort speichern, dann ist der Versand aktiv.
          </p>
        )}
      </div>

      <div className="flex items-start gap-2 rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Das Passwort wird im Pi-Backend mit AES-GCM verschlüsselt abgelegt und ist nicht
          mehr lesbar — nur der Versanddienst kann es entschlüsseln. Im Mock-Modus wird das Passwort
          nicht persistiert.
        </span>
      </div>
    </div>
  );
}

// =============================================================================
// HELPERS
// =============================================================================

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function PlatzhalterHinweis() {
  return (
    <details className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <summary className="cursor-pointer text-sm font-medium">
        Verfügbare Platzhalter ({ALLE_PLATZHALTER.length})
      </summary>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {ALLE_PLATZHALTER.map((p) => (
          <code
            key={p}
            className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground"
          >{`{{${p}}}`}</code>
        ))}
      </div>
    </details>
  );
}
