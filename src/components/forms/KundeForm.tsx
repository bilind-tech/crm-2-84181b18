import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SmartInput, smartValue } from "@/components/ui/smart-input";
import { useCreateKunde, useKuerzelFrei } from "@/hooks/useApi";
import { useCreateDauerauftrag } from "@/hooks/useDauerauftraege";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import type { Kunde, DauerauftragFrequenz, DauerauftragModus, Position } from "@/lib/api/types";
import { cn } from "@/lib/utils";

const PHONE_PREFIX = "+49 ";
const WEB_PREFIX = "https://";

function vorschlagKuerzel(name: string): string {
  if (!name.trim()) return "";
  const woerter = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (woerter.length === 0) return "";
  if (woerter.length === 1) return woerter[0].slice(0, 4).toUpperCase();
  return woerter
    .map((w) => w[0])
    .join("")
    .slice(0, 4)
    .toUpperCase();
}

function sanitizeKuerzel(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
}

interface Props {
  onClose: () => void;
  onCreated?: (k: Kunde) => void;
}

interface FormState {
  typ: "firma" | "privat";
  status: "aktiv" | "interessent" | "inaktiv";
  firmenname: string;
  kuerzel: string;
  kuerzelManuell: boolean;
  startNummer: number;
  anrede: "" | "herr" | "frau" | "divers" | "keine";
  vorname: string;
  nachname: string;
  telefon: string;
  mobil: string;
  email: string;
  webseite: string;
  strasse: string;
  plz: string;
  ort: string;
  land: string;
  ustId: string;
  steuernummer: string;
  zahlungszielTage: number;
  standardSteuersatz: number;
  standardRabatt: number;
  notizen: string;
  tags: string;
  // Dauerauftrag (optional, beim Anlegen mit-erzeugen)
  daAktiv: boolean;
  daBezeichnung: string;
  daFrequenz: DauerauftragFrequenz;
  daStichtagTyp: "monatstag" | "monatsletzter";
  daStichtagWert: number;
  daLaufzeitVon: string; // YYYY-MM-DD
  daModus: DauerauftragModus;
  daPosBezeichnung: string;
  daPosMenge: number;
  daPosEinzelpreis: number;
}

const heuteIso = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const initial: FormState = {
  typ: "firma",
  status: "aktiv",
  firmenname: "",
  kuerzel: "",
  kuerzelManuell: false,
  startNummer: 1,
  anrede: "",
  vorname: "",
  nachname: "",
  telefon: "",
  mobil: "",
  email: "",
  webseite: "",
  strasse: "",
  plz: "",
  ort: "",
  land: "Deutschland",
  ustId: "",
  steuernummer: "",
  zahlungszielTage: 14,
  standardSteuersatz: 19,
  standardRabatt: 0,
  notizen: "",
  tags: "",
  daAktiv: false,
  daBezeichnung: "",
  daFrequenz: "monatlich",
  daStichtagTyp: "monatstag",
  daStichtagWert: 1,
  daLaufzeitVon: heuteIso(),
  daModus: "entwurf",
  daPosBezeichnung: "",
  daPosMenge: 1,
  daPosEinzelpreis: 0,
};

export function KundeForm({ onClose, onCreated }: Props) {
  const navigate = useNavigate();
  const create = useCreateKunde();
  const createDA = useCreateDauerauftrag();
  const [f, setF] = useState<FormState>(initial);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  // Live-Verfügbarkeitsprüfung Kürzel
  const kuerzelFreiQ = useKuerzelFrei(f.kuerzel);
  const kuerzelKonflikt =
    f.kuerzel.length >= 3 && kuerzelFreiQ.data && !kuerzelFreiQ.data.frei
      ? kuerzelFreiQ.data.kunde
      : null;

  // Live-Vorschau der zukünftigen Belegnummer ({KÜRZEL}{MM}{YY}/{NN})
  const vorschauNummer = useMemo(() => {
    const k = f.kuerzel.trim().toUpperCase();
    if (!k) return "";
    const d = new Date();
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const nn = String(Math.max(1, f.startNummer || 1)).padStart(2, "0");
    return `${k}${mm}${yy}/${nn}`;
  }, [f.kuerzel, f.startNummer]);

  // Beim Verlassen des Firmennamens automatisch ein Kürzel vorschlagen,
  // sofern der Nutzer noch keines manuell eingegeben hat.
  function handleFirmennameBlur() {
    if (f.kuerzelManuell) return;
    if (f.kuerzel.trim()) return;
    const v = vorschlagKuerzel(f.firmenname);
    if (v) setF((p) => ({ ...p, kuerzel: v }));
  }

  function handleKuerzelChange(v: string) {
    const clean = sanitizeKuerzel(v);
    setF((p) => ({ ...p, kuerzel: clean, kuerzelManuell: true }));
  }

  async function submit() {
    if (f.typ === "firma" && !f.firmenname.trim()) {
      toast.error("Firmenname ist erforderlich");
      return;
    }
    if (f.typ === "privat" && !f.nachname.trim()) {
      toast.error("Nachname ist erforderlich");
      return;
    }
    if (f.kuerzel && f.kuerzel.length < 3) {
      toast.error("Kürzel muss 3–4 Zeichen haben");
      return;
    }
    if (kuerzelKonflikt) {
      toast.error(`Kürzel «${f.kuerzel}» ist bereits vergeben (${kuerzelKonflikt.nummer} • ${kuerzelKonflikt.name}).`);
      return;
    }
    if (f.daAktiv && !f.daBezeichnung.trim()) {
      toast.error("Bezeichnung für den Dauerauftrag ist erforderlich");
      return;
    }
    let k: Kunde;
    try {
      k = await create.mutateAsync({
        typ: f.typ,
        status: f.status,
        firmenname: f.firmenname || undefined,
        kuerzel: f.kuerzel || undefined,
        anrede: f.anrede || undefined,
        vorname: f.vorname || undefined,
        nachname: f.nachname || undefined,
        telefon: smartValue(f.telefon, PHONE_PREFIX),
        mobil: smartValue(f.mobil, PHONE_PREFIX),
        email: f.email || undefined,
        webseite: smartValue(f.webseite, WEB_PREFIX),
        strasse: f.strasse || undefined,
        plz: f.plz || undefined,
        ort: f.ort || undefined,
        land: f.land || "Deutschland",
        ustId: f.ustId || undefined,
        steuernummer: f.steuernummer || undefined,
        zahlungszielTage: f.zahlungszielTage,
        standardSteuersatz: f.standardSteuersatz,
        standardRabatt: f.standardRabatt,
        notizen: f.notizen || undefined,
        tags: f.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        startZaehlerAktuellerMonat: f.kuerzel && f.startNummer > 1 ? f.startNummer : undefined,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Kunde konnte nicht angelegt werden";
      toast.error(msg);
      return;
    }

    // Optional: Dauerauftrag direkt mit-anlegen
    if (f.daAktiv) {
      const positionen: Position[] = [];
      if (f.daPosBezeichnung.trim()) {
        positionen.push({
          id: crypto.randomUUID(),
          beschreibung: f.daPosBezeichnung.trim(),
          menge: f.daPosMenge || 1,
          einheit: "monat",
          einzelpreisNetto: f.daPosEinzelpreis || 0,
          steuersatz: f.standardSteuersatz,
          rabatt: 0,
        });
      }
      try {
        await createDA.mutateAsync({
          kundeId: k.id,
          bezeichnung: f.daBezeichnung.trim(),
          frequenz: f.daFrequenz,
          stichtag:
            f.daStichtagTyp === "monatsletzter"
              ? { typ: "monatsletzter" }
              : { typ: "monatstag", wert: Math.min(28, Math.max(1, f.daStichtagWert || 1)) },
          laufzeitVon: f.daLaufzeitVon,
          positionen,
          rabattGesamt: 0,
          steuersatz: f.standardSteuersatz,
          betreffVorlage: f.daBezeichnung.trim(),
          textVorlage: "",
          modus: f.daModus,
          status: "aktiv",
        });
        toast.success("Kunde + Dauerauftrag angelegt", {
          description: `${k.nummer} • Dauerauftrag „${f.daBezeichnung.trim()}" eingerichtet.`,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Dauerauftrag konnte nicht angelegt werden";
        toast.warning("Kunde angelegt, Dauerauftrag fehlgeschlagen", { description: msg });
      }
    } else {
      toast.success("Kunde angelegt", { description: `${k.nummer} • erfolgreich gespeichert.` });
    }

    onCreated?.(k);
    onClose();
    navigate({ to: "/kunden/$id", params: { id: k.id } });
  }

  return (
    <div className="min-w-0 space-y-6">
      <Tabs defaultValue="basis">
        <TabsList className="no-scrollbar flex h-11 w-full justify-start gap-1 overflow-x-auto rounded-full bg-muted p-1">
          <TabsTrigger value="basis" className="shrink-0 rounded-full px-3 text-sm sm:px-5">Basis</TabsTrigger>
          <TabsTrigger value="adresse" className="shrink-0 rounded-full px-3 text-sm sm:px-5">Adresse</TabsTrigger>
          <TabsTrigger value="steuer" className="shrink-0 rounded-full px-3 text-sm sm:px-5">Steuer & Zahlung</TabsTrigger>
          <TabsTrigger value="notizen" className="shrink-0 rounded-full px-3 text-sm sm:px-5">Notizen</TabsTrigger>
          <TabsTrigger value="dauerauftrag" className="shrink-0 rounded-full px-3 text-sm sm:px-5">Dauerauftrag</TabsTrigger>
        </TabsList>

        <TabsContent value="basis" className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Typ">
              <Select value={f.typ} onValueChange={(v) => set("typ", v as FormState["typ"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="firma">Firma</SelectItem>
                  <SelectItem value="privat">Privat</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={f.status} onValueChange={(v) => set("status", v as FormState["status"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="aktiv">Aktiv</SelectItem>
                  <SelectItem value="interessent">Interessent</SelectItem>
                  <SelectItem value="inaktiv">Inaktiv</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          {f.typ === "firma" && (
            <Field label="Firmenname *">
              <Input
                value={f.firmenname}
                onChange={(e) => set("firmenname", e.target.value)}
                onBlur={handleFirmennameBlur}
                placeholder="Mustermann GmbH"
              />
            </Field>
          )}

          {/* Kürzel + Live-Vorschau */}
          <Field label="Kürzel">
            <div className="space-y-2">
              <Input
                value={f.kuerzel}
                onChange={(e) => handleKuerzelChange(e.target.value)}
                placeholder="z. B. MUST"
                maxLength={4}
                className="font-mono uppercase tracking-wider"
              />
              <div className="min-h-[1.25rem] text-xs">
                {kuerzelKonflikt ? (
                  <span className="text-destructive">
                    ✗ Bereits vergeben an {kuerzelKonflikt.nummer} • {kuerzelKonflikt.name}
                  </span>
                ) : f.kuerzel.length >= 3 && kuerzelFreiQ.isFetching ? (
                  <span className="text-muted-foreground">Prüfe Verfügbarkeit…</span>
                ) : f.kuerzel.length >= 3 && kuerzelFreiQ.data?.frei ? (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    ✓ Kürzel frei{vorschauNummer && (
                      <>
                        {" • "}Vorschau:{" "}
                        <span className="font-mono font-semibold text-foreground">
                          {vorschauNummer}
                        </span>
                      </>
                    )}
                  </span>
                ) : vorschauNummer ? (
                  <span className="text-muted-foreground">
                    Vorschau:{" "}
                    <span className="font-mono font-semibold text-foreground">
                      {vorschauNummer}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    3–4 Zeichen. So beginnen alle Rechnungen & Angebote dieses Kunden.
                  </span>
                )}
              </div>
            </div>
          </Field>

          {f.kuerzel.length >= 3 && (
            <Field label="Nächste Nummer (diesen Monat) startet bei">
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={9999}
                value={f.startNummer}
                onChange={(e) => set("startNummer", Math.max(1, Number(e.target.value) || 1))}
                className="font-mono w-32"
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                Standard: 1. Wenn du diesen Kunden vorher schon verwendet hast und z. B. 7
                Belege außerhalb existieren, setze hier <span className="font-mono">8</span>.
                Bestehende Belege bleiben unverändert.
              </p>
            </Field>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Anrede">
              <Select
                value={f.anrede || "__none__"}
                onValueChange={(v) => set("anrede", (v === "__none__" ? "" : v) as FormState["anrede"])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  <SelectItem value="herr">Herr</SelectItem>
                  <SelectItem value="frau">Frau</SelectItem>
                  <SelectItem value="divers">Divers</SelectItem>
                  <SelectItem value="keine">Keine</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Vorname"><Input value={f.vorname} onChange={(e) => set("vorname", e.target.value)} /></Field>
            <Field label="Nachname"><Input value={f.nachname} onChange={(e) => set("nachname", e.target.value)} /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Telefon">
              <SmartInput prefix={PHONE_PREFIX} value={f.telefon} onChange={(v) => set("telefon", v)} inputMode="tel" />
            </Field>
            <Field label="Mobil">
              <SmartInput prefix={PHONE_PREFIX} value={f.mobil} onChange={(v) => set("mobil", v)} inputMode="tel" />
            </Field>
            <Field label="E-Mail"><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field label="Webseite">
              <SmartInput prefix={WEB_PREFIX} value={f.webseite} onChange={(v) => set("webseite", v)} inputMode="url" />
            </Field>
          </div>
        </TabsContent>

        <TabsContent value="adresse" className="mt-6 space-y-4">
          <Field label="Straße & Hausnummer"><Input value={f.strasse} onChange={(e) => set("strasse", e.target.value)} /></Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="PLZ"><Input value={f.plz} onChange={(e) => set("plz", e.target.value)} /></Field>
            <Field label="Ort" className="sm:col-span-2"><Input value={f.ort} onChange={(e) => set("ort", e.target.value)} /></Field>
          </div>
          <Field label="Land"><Input value={f.land} onChange={(e) => set("land", e.target.value)} /></Field>
        </TabsContent>

        <TabsContent value="steuer" className="mt-6 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="USt-IdNr."><Input value={f.ustId} onChange={(e) => set("ustId", e.target.value)} placeholder="DE123456789" /></Field>
            <Field label="Steuernummer"><Input value={f.steuernummer} onChange={(e) => set("steuernummer", e.target.value)} /></Field>
            <Field label="Zahlungsziel (Tage)">
              <Input type="number" value={f.zahlungszielTage} onChange={(e) => set("zahlungszielTage", Number(e.target.value) || 0)} />
            </Field>
            <Field label="Standard-Steuersatz (%)">
              <Input type="number" value={f.standardSteuersatz} onChange={(e) => set("standardSteuersatz", Number(e.target.value) || 0)} />
            </Field>
            <Field label="Standard-Rabatt (%)">
              <Input type="number" value={f.standardRabatt} onChange={(e) => set("standardRabatt", Number(e.target.value) || 0)} />
            </Field>
          </div>
        </TabsContent>

        <TabsContent value="notizen" className="mt-6 space-y-4">
          <Field label="Tags (komma-getrennt)">
            <Input value={f.tags} onChange={(e) => set("tags", e.target.value)} placeholder="A-Kunde, Region Nord" />
          </Field>
          <Field label="Notizen">
            <Textarea rows={6} value={f.notizen} onChange={(e) => set("notizen", e.target.value)} placeholder="Interne Notizen zum Kunden…" />
          </Field>
        </TabsContent>

        <TabsContent value="dauerauftrag" className="mt-6 space-y-4">
          <button
            type="button"
            onClick={() => set("daAktiv", !f.daAktiv)}
            className={cn(
              "w-full rounded-xl border px-4 py-3 text-left transition",
              f.daAktiv
                ? "border-primary bg-primary/5"
                : "border-border bg-background hover:bg-muted/50",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold">
                  Dauerauftrag für diesen Kunden anlegen
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  Erzeugt automatisch wiederkehrende Rechnungen nach gewähltem Rhythmus.
                </div>
              </div>
              <div
                className={cn(
                  "h-5 w-9 shrink-0 rounded-full border transition",
                  f.daAktiv ? "border-primary bg-primary" : "border-border bg-muted",
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 h-4 w-4 rounded-full bg-background shadow transition-transform",
                    f.daAktiv ? "translate-x-4" : "translate-x-0.5",
                  )}
                />
              </div>
            </div>
          </button>

          {f.daAktiv && (
            <div className="space-y-4 rounded-xl border border-border bg-muted/20 p-4">
              <Field label="Bezeichnung *">
                <Input
                  value={f.daBezeichnung}
                  onChange={(e) => set("daBezeichnung", e.target.value)}
                  placeholder="z. B. Monatliche Unterhaltsreinigung"
                />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Frequenz">
                  <Select
                    value={f.daFrequenz}
                    onValueChange={(v) => set("daFrequenz", v as DauerauftragFrequenz)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monatlich">Monatlich</SelectItem>
                      <SelectItem value="quartalsweise">Quartalsweise</SelectItem>
                      <SelectItem value="halbjaehrlich">Halbjährlich</SelectItem>
                      <SelectItem value="jaehrlich">Jährlich</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Modus">
                  <Select
                    value={f.daModus}
                    onValueChange={(v) => set("daModus", v as DauerauftragModus)}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entwurf">Entwurf (manuell freigeben)</SelectItem>
                      <SelectItem value="vollautomatisch">Vollautomatisch (versenden)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Stichtag">
                  <Select
                    value={f.daStichtagTyp}
                    onValueChange={(v) => set("daStichtagTyp", v as "monatstag" | "monatsletzter")}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monatstag">Bestimmter Monatstag</SelectItem>
                      <SelectItem value="monatsletzter">Letzter des Monats</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                {f.daStichtagTyp === "monatstag" && (
                  <Field label="Tag (1–28)">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={28}
                      value={f.daStichtagWert}
                      onChange={(e) => set("daStichtagWert", Math.min(28, Math.max(1, Number(e.target.value) || 1)))}
                      className="w-24 font-mono"
                    />
                  </Field>
                )}
              </div>
              <Field label="Laufzeit-Beginn">
                <Input
                  type="date"
                  value={f.daLaufzeitVon}
                  onChange={(e) => set("daLaufzeitVon", e.target.value)}
                  className="w-48"
                />
              </Field>

              <div className="rounded-lg border border-dashed border-border bg-background/60 p-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Erste Position (optional)
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Kannst du auch später am Dauerauftrag ergänzen.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_5rem_8rem]">
                  <Field label="Beschreibung">
                    <Input
                      value={f.daPosBezeichnung}
                      onChange={(e) => set("daPosBezeichnung", e.target.value)}
                      placeholder="z. B. Unterhaltsreinigung pauschal"
                    />
                  </Field>
                  <Field label="Menge">
                    <Input
                      type="number"
                      inputMode="decimal"
                      value={f.daPosMenge}
                      onChange={(e) => set("daPosMenge", Number(e.target.value) || 0)}
                    />
                  </Field>
                  <Field label="Einzelpreis netto (€)">
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      value={f.daPosEinzelpreis}
                      onChange={(e) => set("daPosEinzelpreis", Number(e.target.value) || 0)}
                    />
                  </Field>
                </div>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      <div className="sticky bottom-0 -mx-4 -mb-5 mt-2 flex flex-col-reverse items-stretch gap-2 border-t border-border bg-background px-4 py-3 sm:-mx-8 sm:-mb-6 sm:px-8 sm:flex-row sm:items-center sm:justify-end ">
        <Button variant="outline" onClick={onClose}>Abbrechen</Button>
        <Button
          disabled={create.isPending || createDA.isPending || !!kuerzelKonflikt}
          onClick={submit}
          className="rounded-md px-6"
        >
          {create.isPending || createDA.isPending ? "Speichere…" : "Kunde anlegen"}
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
