// =============================================================================
// E-Mail-Versand-Dialog
// -----------------------------------------------------------------------------
// MANUAL-ONLY: Diese Komponente ist der EINZIGE Pfad, über den eine Mail das
// System verlässt. Versand erfolgt synchron via POST /email/versand. Backend
// lehnt jede andere Quelle als `quelle="manuell"` mit 403 ab. Pro Klick wird
// ein eigener idempotenzKey erzeugt — Doppelklick wird vom Backend
// abgefangen, auch wenn das Netz hakt.
// =============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Send,
  Mail,
  MailOpen,
  Paperclip,
  X,
  Loader2,
  AlertCircle,
  Code2,
  Eye,
  Pencil,
  Check,
  Plus,
  Settings,
} from "lucide-react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useEmailSignaturen,
  useEmailVorlagen,
  useFirmendaten,
  useKunde,
  useMahnEinstellungen,
  useSendEmail,
  useSmtp,
} from "@/hooks/useApi";
import {
  findUnresolvedPlaceholders,
  replacePlaceholders,
  type PlaceholderContext,
} from "@/lib/email/placeholders";
import type { Angebot, EmailKontext, EmailVorlage, Kunde, Rechnung } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { createClientId } from "@/lib/clientId";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kontext: EmailKontext;
  kunde?: Kunde | null;
  angebot?: Angebot | null;
  rechnung?: Rechnung | null;
  /** Blob-URL des bereits erzeugten PDFs (z.B. aus useAngebotPdf). */
  pdfBlobUrl?: string | null;
  pdfDateiname?: string;
  /** PDF-Status (loading/ready/error). Wenn "loading", wird Senden deaktiviert mit Hinweis. */
  pdfStatus?: "idle" | "loading" | "ready" | "error";
  onSent?: () => void;
  /** Wenn gesetzt: Versand wird im Backend als Mahnung dieser Stufe protokolliert. */
  mahnStufe?: 1 | 2 | 3;
  /** Optional: Vorlagen-ID, die per Default ausgewählt wird (z.B. aus Mahn-Konfig). */
  vorbelegteVorlageId?: string;
  /** Optional: zusätzliche Platzhalter-Variablen (z.B. mahnung.gebuehr). */
  zusatzPlaceholder?: Record<string, string>;
}

type EditorMode = "visuell" | "html" | "vorschau";
type SendPhase = "idle" | "sending" | "success";

export function EmailVersandDialog({
  open,
  onOpenChange,
  kontext,
  kunde,
  angebot,
  rechnung,
  pdfBlobUrl,
  pdfDateiname,
  pdfStatus = "ready",
  onSent,
  mahnStufe,
  vorbelegteVorlageId,
}: Props) {
  const { data: vorlagen = [] } = useEmailVorlagen();
  const { data: signaturen = [] } = useEmailSignaturen();
  const { data: firma } = useFirmendaten();
  const { data: mahnEinstellungen } = useMahnEinstellungen();
  const { data: smtp } = useSmtp();
  const send = useSendEmail();
  // Ansprechpartner des Kunden laden, um die Empfänger-Mail
  // (falls auf Beleg ein Ansprechpartner ausgewählt ist) zu ermitteln.
  const { data: kundeDetail } = useKunde(kunde?.id ?? "");
  const ansprechpartnerListe = kundeDetail?.ansprechpartner ?? [];

  const ansprechpartnerId = angebot?.ansprechpartnerId ?? rechnung?.ansprechpartnerId;

  const empfaengerVorbelegt = useMemo(() => {
    if (ansprechpartnerId) {
      const ap = ansprechpartnerListe.find((a) => a.id === ansprechpartnerId);
      if (ap?.email) return ap.email;
    }
    const primaer = ansprechpartnerListe.find((a) => a.primaer && a.email);
    if (primaer?.email) return primaer.email;
    return kunde?.email ?? "";
  }, [ansprechpartnerId, ansprechpartnerListe, kunde?.email]);

  // Harte Voraussetzung: ohne SMTP kein Versand. UI muss das klar zeigen
  // und den Senden-Button sperren — sonst entsteht ein falsches Erfolgs-Signal.
  const smtpKonfiguriert = !!(
    smtp?.server?.trim() &&
    smtp?.benutzer?.trim() &&
    smtp?.passwortGesetzt
  );

  const passendeVorlagen = useMemo(
    () => vorlagen.filter((v) => v.kontext === kontext || v.kontext === "allgemein"),
    [vorlagen, kontext],
  );

  const [vorlageId, setVorlageId] = useState<string>("");
  const [signaturId, setSignaturId] = useState<string>("");
  const [an, setAn] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [betreff, setBetreff] = useState("");
  const [bodyHtml, setBodyHtml] = useState("");
  const [pdfAnhangAktiv, setPdfAnhangAktiv] = useState(true);
  const [mode, setMode] = useState<EditorMode>("visuell");
  const [zeigeCcBcc, setZeigeCcBcc] = useState(false);
  const [phase, setPhase] = useState<SendPhase>("idle");
  const [mahnConfirm, setMahnConfirm] = useState(false);
  const visuellRef = useRef<HTMLDivElement>(null);

  // Ausgewählten Ansprechpartner für Platzhalter ({{ansprechpartner.*}},
  // {{anrede.zeile}}) ermitteln. Reihenfolge wie bei der „An"-Vorbelegung:
  // erst Beleg-Ansprechpartner, sonst primärer Ansprechpartner.
  const ansprechpartnerFuerCtx = useMemo(() => {
    if (ansprechpartnerId) {
      const ap = ansprechpartnerListe.find((a) => a.id === ansprechpartnerId);
      if (ap) return ap;
    }
    return ansprechpartnerListe.find((a) => a.primaer) ?? null;
  }, [ansprechpartnerId, ansprechpartnerListe]);

  const ctx: PlaceholderContext = useMemo(
    () => ({
      kunde,
      ansprechpartner: ansprechpartnerFuerCtx,
      angebot,
      rechnung,
      firma,
      mahnung: mahnStufe ? { stufe: mahnStufe, einstellungen: mahnEinstellungen ?? null } : null,
    }),
    [kunde, ansprechpartnerFuerCtx, angebot, rechnung, firma, mahnStufe, mahnEinstellungen],
  );

  // Vorbelegen beim Öffnen
  useEffect(() => {
    if (!open) return;
    setAn(empfaengerVorbelegt);
    setCc("");
    setBcc("");
    setZeigeCcBcc(false);
    setPdfAnhangAktiv(true);
    setMode("visuell");
    setPhase("idle");
    setMahnConfirm(false);

    let standardVorlage: EmailVorlage | undefined;
    if (mahnStufe && mahnEinstellungen) {
      const config = mahnEinstellungen.stufen.find((s) => s.stufe === mahnStufe);
      if (config?.emailVorlageId) {
        standardVorlage = vorlagen.find((v) => v.id === config.emailVorlageId);
      }
    }
    if (!standardVorlage && vorbelegteVorlageId) {
      standardVorlage = vorlagen.find((v) => v.id === vorbelegteVorlageId);
    }
    if (!standardVorlage) {
      standardVorlage =
        passendeVorlagen.find((v) => v.istStandard && v.kontext === kontext) ??
        passendeVorlagen.find((v) => v.kontext === kontext) ??
        passendeVorlagen[0];
    }
    const standardSig = signaturen.find((s) => s.istStandard) ?? signaturen[0];

    setVorlageId(standardVorlage?.id ?? "");
    setSignaturId(standardSig?.id ?? "");
    setBetreff(standardVorlage?.betreff ?? "");
    setBodyHtml(standardVorlage?.koerperHtml ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Falls Ansprechpartner-Daten erst nach Öffnen des Dialogs eintreffen,
  // den Empfänger nachträglich setzen — nur solange das Feld noch leer
  // ist, damit User-Eingaben nie überschrieben werden.
  useEffect(() => {
    if (!open) return;
    if (an) return;
    if (empfaengerVorbelegt) setAn(empfaengerVorbelegt);
  }, [open, an, empfaengerVorbelegt]);

  // Vorlage wechseln → Felder neu setzen
  const onVorlageChange = (id: string) => {
    setVorlageId(id);
    const v: EmailVorlage | undefined = vorlagen.find((x) => x.id === id);
    if (v) {
      setBetreff(v.betreff);
      setBodyHtml(v.koerperHtml);
    }
  };

  // Visuell-Editor-Inhalt synchron halten — nur bei Mode-Wechsel auf "visuell"
  useEffect(() => {
    if (mode === "visuell" && visuellRef.current) {
      const aufgeloest = replacePlaceholders(bodyHtml, ctx);
      if (visuellRef.current.innerHTML !== aufgeloest) {
        visuellRef.current.innerHTML = aufgeloest;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const signatur = signaturen.find((s) => s.id === signaturId);
  const aufgelosterBetreff = replacePlaceholders(betreff, ctx);
  const finaleBody =
    replacePlaceholders(bodyHtml, ctx) +
    (signatur ? `\n<br/><br/>${replacePlaceholders(signatur.html, ctx)}` : "");
  const unresolved = [
    ...findUnresolvedPlaceholders(betreff, ctx),
    ...findUnresolvedPlaceholders(bodyHtml, ctx),
  ];

  const empfaengerListe = (s: string) =>
    s
      .split(/[,;]/)
      .map((x) => x.trim())
      .filter(Boolean);

  const anChips = empfaengerListe(an);
  const ccChips = empfaengerListe(cc);
  const bccChips = empfaengerListe(bcc);

  const istValide = an.trim().length > 0 && betreff.trim().length > 0;

  const handleSend = () => {
    if (!smtpKonfiguriert) {
      toast.error("SMTP nicht konfiguriert", {
        description:
          "Bitte unter Einstellungen → E-Mail Server, Benutzer und Passwort hinterlegen.",
      });
      return;
    }
    const empfaenger = empfaengerListe(an);
    if (!empfaenger.length) {
      toast.error("Bitte mindestens einen Empfänger angeben.");
      return;
    }
    // Zweistufige Bestätigung für Mahnungen
    if (mahnStufe && !mahnConfirm) {
      setMahnConfirm(true);
      return;
    }
    const belegTyp =
      kontext === "rechnung" || kontext === "mahnung"
        ? "rechnung"
        : kontext === "angebot"
          ? "angebot"
          : "allgemein";
    const belegId = angebot?.id ?? rechnung?.id;

    setPhase("sending");

    // Idempotenz-Key pro Klick — Backend erkennt Doppelklicks und sendet nicht zweimal.
    const idempotenzKey = createClientId("mail");

    send.mutate(
      {
        belegTyp,
        belegId,
        kundeId: kunde?.id,
        empfaenger,
        cc: empfaengerListe(cc),
        bcc: empfaengerListe(bcc),
        betreff: aufgelosterBetreff,
        koerperHtml: finaleBody,
        vorlageId: vorlageId || undefined,
        signaturId: signaturId || undefined,
        anhaenge:
          pdfAnhangAktiv && pdfDateiname
            ? [{ name: pdfDateiname, sizeBytes: 0, kind: "pdf-beleg" }]
            : [],
        mahnStufe,
        idempotenzKey,
      } as Parameters<typeof send.mutate>[0],
      {
        onSuccess: (res) => {
          if (res.sendOk === true || res.status === "gesendet") {
            setPhase("success");
            // Erfolgs-Animation kurz zeigen, dann Toast + Dialog schließen
            setTimeout(() => {
              toast.success("E-Mail versendet", {
                description: `An ${empfaenger.join(", ")}`,
              });
              onSent?.();
              onOpenChange(false);
              setPhase("idle");
            }, 1100);
          } else {
            setPhase("idle");
            toast.error(
              `Versand fehlgeschlagen: ${res.sendError ?? res.fehlerText ?? "Unbekannter Fehler"}`,
            );
          }
        },
        onError: (e: unknown) => {
          setPhase("idle");
          const err = e as {
            message?: string;
            status?: number;
            body?: { error?: string; message?: string; demo?: boolean };
          };
          // Demo-Modus: ehrlicher Hinweis, kein roter „Fehler"-Toast.
          if (err?.body?.demo) {
            toast.info("Demo-Modus — nicht versendet", {
              description:
                err?.body?.message ??
                "Im Browser wird nichts real verschickt. Aktiv erst nach Pi-Deployment.",
            });
            return;
          }
          // Backend (Pi) liefert HTTP 412 + { error: "smtp-not-configured", message }
          // wenn SMTP nicht konfiguriert ist. Zeige die exakte Server-Message.
          const isSmtpFehlt = err?.body?.error === "smtp-not-configured" || err?.status === 412;
          if (isSmtpFehlt) {
            toast.error("SMTP nicht konfiguriert", {
              description:
                err?.body?.message ??
                "Bitte unter Einstellungen → E-Mail Server, Benutzer und Passwort hinterlegen.",
            });
          } else {
            toast.error(`Versand fehlgeschlagen: ${err?.body?.message ?? err?.message ?? ""}`);
          }
        },
      },
    );
  };

  const empfaengerName =
    kunde?.firmenname || `${kunde?.vorname ?? ""} ${kunde?.nachname ?? ""}`.trim() || "Empfänger";

  return (
    <Dialog open={open} onOpenChange={(o) => phase === "idle" && onOpenChange(o)}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto bg-background p-0">
        {/* Hero Header */}
        <div className="relative overflow-hidden border-b border-border bg-background px-6 pb-5 pt-6">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 shrink-0 place-content-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
              <Mail className="h-7 w-7 text-primary" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <DialogHeader className="space-y-1 text-left">
                <DialogTitle className="text-xl font-semibold tracking-tight">
                  E-Mail versenden
                </DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground">
                  An <span className="font-medium text-foreground">{empfaengerName}</span>
                  {angebot && (
                    <>
                      {" · Angebot "}
                      <span className="font-mono text-xs">{angebot.nummer}</span>
                    </>
                  )}
                  {rechnung && (
                    <>
                      {" · Rechnung "}
                      <span className="font-mono text-xs">{rechnung.nummer}</span>
                    </>
                  )}
                  {mahnStufe && (
                    <>
                      {" · "}
                      <span className="text-warning">Mahnstufe {mahnStufe}</span>
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>
            </div>
          </div>
        </div>

        {/* SMTP-Warn-Banner — Versand ist ohne Konfiguration unmöglich */}
        {!smtpKonfiguriert && (
          <div className="mx-6 mt-4 flex items-start gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3.5">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-semibold text-foreground">
                E-Mail-Versand nicht möglich — SMTP nicht konfiguriert
              </p>
              <p className="text-xs text-muted-foreground">
                Hinterlege zuerst Server, Benutzer und Passwort, sonst kann keine Mail an Kunden
                gesendet werden.
              </p>
              <Link
                to="/einstellungen"
                hash="email"
                onClick={() => onOpenChange(false)}
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              >
                <Settings className="h-3 w-3" /> Zu E-Mail-Einstellungen
              </Link>
            </div>
          </div>
        )}

        {/* Send-Overlay (Animation während Versand & nach Erfolg) */}
        {phase !== "idle" && <SendOverlay phase={phase} empfaenger={anChips} />}

        <div
          className={cn(
            "space-y-5 px-6 py-5 transition-opacity",
            phase !== "idle" && "pointer-events-none opacity-30",
          )}
        >
          {/* Vorlage + Signatur */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Vorlage">
              <Select value={vorlageId} onValueChange={onVorlageChange}>
                <SelectTrigger>
                  <SelectValue placeholder="Vorlage wählen" />
                </SelectTrigger>
                <SelectContent>
                  {passendeVorlagen.length === 0 && (
                    <SelectItem value="__none" disabled>
                      Keine Vorlagen vorhanden
                    </SelectItem>
                  )}
                  {passendeVorlagen.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                      {v.istStandard ? " · Standard" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Signatur">
              <Select value={signaturId} onValueChange={setSignaturId}>
                <SelectTrigger>
                  <SelectValue placeholder="Signatur wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Ohne Signatur</SelectItem>
                  {signaturen.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.istStandard ? " · Standard" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* Empfänger-Block (visuell als zusammenhängende Karte) */}
          <div className="rounded-xl border border-border bg-card/50">
            <RecipientRow label="An" value={an} chips={anChips} onChange={setAn} required />
            {!zeigeCcBcc ? (
              <button
                type="button"
                onClick={() => setZeigeCcBcc(true)}
                className="flex w-full items-center gap-1.5 border-t border-border px-4 py-2 text-xs font-medium text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
              >
                <Plus className="h-3 w-3" /> CC / BCC hinzufügen
              </button>
            ) : (
              <>
                <RecipientRow label="Cc" value={cc} chips={ccChips} onChange={setCc} />
                <RecipientRow label="Bcc" value={bcc} chips={bccChips} onChange={setBcc} />
              </>
            )}
          </div>

          {/* Betreff */}
          <Field label="Betreff" required>
            <Input
              value={betreff}
              onChange={(e) => setBetreff(e.target.value)}
              className="h-11 text-base"
            />
            {betreff !== aufgelosterBetreff && (
              <p className="mt-1 text-xs text-muted-foreground">
                Wird gesendet als:{" "}
                <span className="font-medium text-foreground">{aufgelosterBetreff}</span>
              </p>
            )}
          </Field>

          {/* Editor-Tabs */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Inhalt
              </Label>
              <div className="flex items-center gap-1 rounded-full border border-border bg-muted/30 p-0.5">
                <TabBtn active={mode === "visuell"} onClick={() => setMode("visuell")}>
                  <Pencil className="mr-1 h-3.5 w-3.5" /> Visuell
                </TabBtn>
                <TabBtn active={mode === "html"} onClick={() => setMode("html")}>
                  <Code2 className="mr-1 h-3.5 w-3.5" /> HTML
                </TabBtn>
                <TabBtn active={mode === "vorschau"} onClick={() => setMode("vorschau")}>
                  <Eye className="mr-1 h-3.5 w-3.5" /> Vorschau
                </TabBtn>
              </div>
            </div>

            {mode === "visuell" && (
              <div
                ref={visuellRef}
                contentEditable
                suppressContentEditableWarning
                onBlur={(e) => setBodyHtml(e.currentTarget.innerHTML)}
                className="prose prose-sm min-h-[260px] max-w-none rounded-xl border border-input bg-background p-5 text-sm leading-relaxed transition focus:border-ring/50 focus:outline-none focus:ring-2 focus:ring-ring/30"
              />
            )}
            {mode === "html" && (
              <Textarea
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                rows={14}
                className="rounded-xl font-mono text-xs"
              />
            )}
            {mode === "vorschau" && (
              <div className="overflow-hidden rounded-xl border border-border bg-muted/30 shadow-inner">
                <iframe
                  title="E-Mail Vorschau"
                  sandbox=""
                  srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;padding:24px;margin:0;background:#fff;}img{max-width:100%;height:auto;}a{color:#2563eb;}</style></head><body>${finaleBody}</body></html>`}
                  className="block h-[420px] w-full border-0 bg-white"
                />
              </div>
            )}

            {unresolved.length > 0 && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 p-2.5 text-xs text-warning-foreground">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                <span>
                  Unbekannte Platzhalter werden so versendet:{" "}
                  {unresolved.map((p) => `{{${p}}}`).join(", ")}
                </span>
              </div>
            )}

            {/* Signatur-Live-Vorschau (zeigt was unten dranhängt) */}
            {signatur && mode !== "vorschau" && (
              <div className="mt-3 rounded-xl border border-dashed border-border bg-muted/20 px-4 py-3">
                <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  <Pencil className="h-3 w-3" /> Signatur (wird automatisch angehängt)
                </div>
                <div
                  className="prose prose-sm max-w-none text-sm text-foreground/80"
                  dangerouslySetInnerHTML={{
                    __html: replacePlaceholders(signatur.html, ctx),
                  }}
                />
              </div>
            )}
          </div>

          {/* Anhänge */}
          {pdfDateiname && (
            <Field label="Anhänge">
              {pdfAnhangAktiv ? (
                <div className="flex items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-3 text-sm">
                  <span className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-content-center rounded-lg bg-destructive/10 text-destructive">
                      {pdfStatus === "loading" ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : pdfStatus === "error" ? (
                        <AlertCircle className="h-4 w-4" />
                      ) : (
                        <Paperclip className="h-4 w-4" />
                      )}
                    </span>
                    <span>
                      <span className="block font-medium">{pdfDateiname}</span>
                      <span className="text-xs text-muted-foreground">
                        {pdfStatus === "loading"
                          ? "PDF wird vorbereitet …"
                          : pdfStatus === "error"
                            ? "PDF konnte nicht erzeugt werden"
                            : "PDF · automatisch angehängt"}
                      </span>
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPdfAnhangAktiv(false)}
                    className="rounded-full p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Anhang entfernen"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPdfAnhangAktiv(true)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                >
                  <Plus className="h-3 w-3" /> PDF wieder anhängen
                </button>
              )}
            </Field>
          )}
        </div>

        {mahnStufe && mahnConfirm && (
          <div className="mx-6 mb-3 flex items-start gap-2 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div className="space-y-0.5">
              <p className="font-medium text-foreground">
                Mahnstufe {mahnStufe} wirklich versenden?
              </p>
              <p className="text-xs text-muted-foreground">
                An {anChips.join(", ") || an}. Klicke nochmal auf „E-Mail senden", um den Versand zu
                bestätigen.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMahnConfirm(false)}
              className="ml-auto rounded-full p-1 text-muted-foreground hover:bg-muted/40"
              aria-label="Bestätigung abbrechen"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        <DialogFooter className="gap-2 border-t border-border bg-muted/20 px-6 py-4 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={send.isPending || phase !== "idle"}
          >
            Abbrechen
          </Button>
          <button
            type="button"
            onClick={handleSend}
            disabled={
              !istValide ||
              !smtpKonfiguriert ||
              send.isPending ||
              phase !== "idle" ||
              (pdfAnhangAktiv && pdfStatus === "loading")
            }
            className={cn(
              "group relative inline-flex h-12 min-w-[180px] items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold text-white",
              "bg-[linear-gradient(180deg,#3B82F6_0%,#2563EB_55%,#1D4ED8_100%)]",
              "shadow-[0_1px_0_rgba(255,255,255,0.25)_inset,0_8px_22px_-8px_rgba(37,99,235,0.55),0_1px_2px_rgba(15,23,42,0.18)]",
              "ring-1 ring-inset ring-white/15 transition-all duration-150 ease-out",
              "hover:shadow-[0_1px_0_rgba(255,255,255,0.3)_inset,0_12px_28px_-8px_rgba(37,99,235,0.7),0_1px_2px_rgba(15,23,42,0.2)]",
              "hover:brightness-[1.06] active:brightness-[0.96] active:translate-y-[0.5px]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              "disabled:pointer-events-none disabled:opacity-60",
            )}
          >
            {send.isPending || phase === "sending" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Wird gesendet …
              </>
            ) : pdfAnhangAktiv && pdfStatus === "loading" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> PDF wird vorbereitet …
              </>
            ) : mahnStufe && mahnConfirm ? (
              <>
                <AlertCircle className="h-4 w-4" /> Mahnung bestätigen & senden
              </>
            ) : (
              <>
                <Send className="h-4 w-4" /> E-Mail senden
              </>
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------------------------------------------------- */
/* Send-Overlay — schöne Animation während Versand & Erfolg                   */
/* -------------------------------------------------------------------------- */

function SendOverlay({ phase, empfaenger }: { phase: SendPhase; empfaenger: string[] }) {
  return (
    <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-background/95 backdrop-blur-sm animate-in fade-in duration-300">
      <style>{`
        @keyframes email-fly {
          0% { transform: translate(0, 0) rotate(0deg); }
          50% { transform: translate(8px, -8px) rotate(15deg); }
          100% { transform: translate(0, 0) rotate(0deg); }
        }
        @keyframes email-pop {
          0% { transform: scale(0.4); opacity: 0; }
          60% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>

      {phase === "sending" ? (
        <>
          <div className="relative">
            <div
              className="absolute inset-0 -z-10 animate-ping rounded-full bg-primary/20"
              style={{ animationDuration: "1.6s" }}
            />
            <div className="grid h-20 w-20 place-content-center rounded-full bg-primary/10 ring-2 ring-primary/30">
              <Send
                className="h-9 w-9 text-primary"
                style={{ animation: "email-fly 1.4s ease-in-out infinite" }}
              />
            </div>
          </div>
          <div className="text-center">
            <p className="text-base font-semibold">E-Mail wird versendet …</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {empfaenger.length === 1
                ? "An " + empfaenger[0]
                : `An ${empfaenger.length} Empfänger`}
            </p>
          </div>
        </>
      ) : (
        <>
          <div className="relative">
            <div
              className="grid h-20 w-20 place-content-center rounded-full bg-success/15 ring-2 ring-success/40"
              style={{
                animation: "email-pop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards",
              }}
            >
              <MailOpen className="h-9 w-9 text-success" strokeWidth={2} />
            </div>
            <div
              className="absolute -bottom-1 -right-1 grid h-8 w-8 place-content-center rounded-full bg-success text-white shadow-lg"
              style={{
                animation: "email-pop 0.6s 0.15s cubic-bezier(0.34, 1.56, 0.64, 1) backwards",
              }}
            >
              <Check className="h-4 w-4" strokeWidth={3} />
            </div>
          </div>
          <div className="text-center">
            <p className="text-base font-semibold text-success">E-Mail versendet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {empfaenger.length === 1 ? empfaenger[0] : `${empfaenger.length} Empfänger`}
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Empfänger-Zeile mit Chip-Anzeige                                           */
/* -------------------------------------------------------------------------- */

function RecipientRow({
  label,
  value,
  chips,
  onChange,
  required,
}: {
  label: string;
  value: string;
  chips: string[];
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 border-b border-border px-4 py-2.5 last:border-b-0">
      <Label className="mt-2 w-10 shrink-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
        {required && <span className="text-destructive">*</span>}
      </Label>
      <div className="min-w-0 flex-1">
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1.5">
            {chips.map((c, i) => (
              <span
                key={`${c}-${i}`}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
              >
                {c}
              </span>
            ))}
          </div>
        )}
        <Input
          type="email"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={
            chips.length === 0
              ? "name@firma.de  (mehrere mit Komma trennen)"
              : "Weitere Adresse hinzufügen …"
          }
          className="h-8 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
        />
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Standard-Helfer                                                            */
/* -------------------------------------------------------------------------- */

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
      <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function TabBtn({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition",
        active
          ? "bg-card text-foreground shadow-sm ring-1 ring-border"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
