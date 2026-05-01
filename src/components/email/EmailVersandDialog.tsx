// E-Mail-Versand-Dialog mit Vorlagen, Signatur, HTML/Visuell-Editor,
// Anhang-Verwaltung und sicherer iframe-Vorschau.
//
// Nutzung:
//   <EmailVersandDialog
//      open={open} onOpenChange={setOpen}
//      kontext="angebot"
//      kunde={kunde} angebot={angebot}
//      pdfBlobUrl={pdfUrl} pdfDateiname="AN-2025-001.pdf"
//      onSent={() => …}
//   />

import { useEffect, useMemo, useRef, useState } from "react";
import { Send, Paperclip, X, Loader2, AlertCircle, Code2, Eye, Pencil } from "lucide-react";
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
  useMahnEinstellungen,
  useSendEmail,
} from "@/hooks/useApi";
import {
  findUnresolvedPlaceholders,
  replacePlaceholders,
  type PlaceholderContext,
} from "@/lib/email/placeholders";
import type {
  Angebot,
  EmailKontext,
  EmailVorlage,
  Kunde,
  Rechnung,
} from "@/lib/api/types";
import { cn } from "@/lib/utils";

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
  onSent?: () => void;
  /** Wenn gesetzt: Versand wird im Backend als Mahnung dieser Stufe protokolliert. */
  mahnStufe?: 1 | 2 | 3;
  /** Optional: Vorlagen-ID, die per Default ausgewählt wird (z.B. aus Mahn-Konfig). */
  vorbelegteVorlageId?: string;
  /** Optional: zusätzliche Platzhalter-Variablen (z.B. mahnung.gebuehr). */
  zusatzPlaceholder?: Record<string, string>;
}

type EditorMode = "visuell" | "html" | "vorschau";

export function EmailVersandDialog({
  open,
  onOpenChange,
  kontext,
  kunde,
  angebot,
  rechnung,
  pdfBlobUrl,
  pdfDateiname,
  onSent,
  mahnStufe,
  vorbelegteVorlageId,
}: Props) {
  const { data: vorlagen = [] } = useEmailVorlagen();
  const { data: signaturen = [] } = useEmailSignaturen();
  const { data: firma } = useFirmendaten();
  const { data: mahnEinstellungen } = useMahnEinstellungen();
  const send = useSendEmail();

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
  const visuellRef = useRef<HTMLDivElement>(null);

  const ctx: PlaceholderContext = useMemo(
    () => ({
      kunde,
      angebot,
      rechnung,
      firma,
      mahnung: mahnStufe
        ? { stufe: mahnStufe, einstellungen: mahnEinstellungen ?? null }
        : null,
    }),
    [kunde, angebot, rechnung, firma, mahnStufe, mahnEinstellungen],
  );

  // Vorbelegen beim Öffnen
  useEffect(() => {
    if (!open) return;
    setAn(kunde?.email ?? "");
    setCc("");
    setBcc("");
    setZeigeCcBcc(false);
    setPdfAnhangAktiv(true);
    setMode("visuell");

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
    const standardSig =
      signaturen.find((s) => s.istStandard) ?? signaturen[0];

    setVorlageId(standardVorlage?.id ?? "");
    setSignaturId(standardSig?.id ?? "");
    setBetreff(standardVorlage?.betreff ?? "");
    setBodyHtml(standardVorlage?.koerperHtml ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
    s.split(/[,;]/).map((x) => x.trim()).filter(Boolean);

  const istValide = an.trim().length > 0 && betreff.trim().length > 0;

  const handleSend = () => {
    const empfaenger = empfaengerListe(an);
    if (!empfaenger.length) {
      toast.error("Bitte mindestens einen Empfänger angeben.");
      return;
    }
    const belegTyp =
      kontext === "rechnung" || kontext === "mahnung"
        ? "rechnung"
        : kontext === "angebot"
          ? "angebot"
          : "allgemein";
    const belegId = angebot?.id ?? rechnung?.id;

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
      },
      {
        onSuccess: (res) => {
          if (res.status === "sent") {
            toast.success("E-Mail versendet");
            onSent?.();
            onOpenChange(false);
          } else {
            toast.error(`Versand fehlgeschlagen: ${res.fehlerGrund ?? "Unbekannter Fehler"}`);
          }
        },
        onError: (e: unknown) => {
          toast.error(`Versand fehlgeschlagen: ${(e as Error)?.message ?? ""}`);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto bg-background">
        <DialogHeader>
          <DialogTitle>E-Mail versenden</DialogTitle>
          <DialogDescription>
            Vorlage wählen, Inhalt prüfen, vor dem Versand in der Vorschau kontrollieren.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Vorlage + Signatur */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Vorlage">
              <Select value={vorlageId} onValueChange={onVorlageChange}>
                <SelectTrigger><SelectValue placeholder="Vorlage wählen" /></SelectTrigger>
                <SelectContent>
                  {passendeVorlagen.length === 0 && (
                    <SelectItem value="__none" disabled>Keine Vorlagen vorhanden</SelectItem>
                  )}
                  {passendeVorlagen.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}{v.istStandard ? " · Standard" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Signatur">
              <Select value={signaturId} onValueChange={setSignaturId}>
                <SelectTrigger><SelectValue placeholder="Signatur wählen" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Ohne Signatur</SelectItem>
                  {signaturen.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}{s.istStandard ? " · Standard" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* Empfänger */}
          <Field label="An" required>
            <Input
              type="email"
              value={an}
              onChange={(e) => setAn(e.target.value)}
              placeholder="kunde@example.com"
            />
          </Field>

          {!zeigeCcBcc ? (
            <button
              type="button"
              onClick={() => setZeigeCcBcc(true)}
              className="text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              + CC / BCC hinzufügen
            </button>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="CC">
                <Input value={cc} onChange={(e) => setCc(e.target.value)} placeholder="Komma-getrennt" />
              </Field>
              <Field label="BCC">
                <Input value={bcc} onChange={(e) => setBcc(e.target.value)} placeholder="Komma-getrennt" />
              </Field>
            </div>
          )}

          {/* Betreff */}
          <Field label="Betreff" required>
            <Input value={betreff} onChange={(e) => setBetreff(e.target.value)} />
            {betreff !== aufgelosterBetreff && (
              <p className="mt-1 text-xs text-muted-foreground">
                Wird gesendet als: <span className="font-medium">{aufgelosterBetreff}</span>
              </p>
            )}
          </Field>

          {/* Editor-Tabs */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <Label className="text-xs font-medium">Inhalt</Label>
              <div className="flex items-center gap-1 rounded-lg border border-border p-0.5">
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
                className="min-h-[260px] rounded-lg border border-input bg-background p-4 text-sm leading-relaxed prose prose-sm max-w-none focus:outline-none focus:ring-1 focus:ring-ring"
              />
            )}
            {mode === "html" && (
              <Textarea
                value={bodyHtml}
                onChange={(e) => setBodyHtml(e.target.value)}
                rows={14}
                className="font-mono text-xs"
              />
            )}
            {mode === "vorschau" && (
              <div className="overflow-hidden rounded-lg border border-border bg-muted/30">
                <iframe
                  title="E-Mail Vorschau"
                  sandbox=""
                  srcDoc={`<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;font-size:14px;line-height:1.6;color:#1a1a1a;padding:20px;margin:0;}img{max-width:100%;height:auto;}</style></head><body>${finaleBody}</body></html>`}
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
          </div>

          {/* Anhänge */}
          {pdfDateiname && (
            <Field label="Anhänge">
              {pdfAnhangAktiv ? (
                <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="font-medium">{pdfDateiname}</span>
                    <span className="text-xs text-muted-foreground">PDF · automatisch</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setPdfAnhangAktiv(false)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Anhang entfernen"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setPdfAnhangAktiv(true)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  + PDF wieder anhängen
                </button>
              )}
            </Field>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={send.isPending}>
            Abbrechen
          </Button>
          <Button onClick={handleSend} disabled={!istValide || send.isPending} className="min-w-[140px]">
            {send.isPending ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Wird gesendet …
              </>
            ) : (
              <>
                <Send className="mr-1.5 h-4 w-4" /> E-Mail senden
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
        "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-medium transition",
        active ? "bg-card shadow-sm ring-1 ring-border" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
