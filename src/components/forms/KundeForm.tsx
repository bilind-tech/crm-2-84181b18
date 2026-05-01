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
import { useCreateKunde } from "@/hooks/useApi";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import type { Kunde } from "@/lib/api/types";

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
}

const initial: FormState = {
  typ: "firma",
  status: "aktiv",
  firmenname: "",
  kuerzel: "",
  kuerzelManuell: false,
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
};

export function KundeForm({ onClose, onCreated }: Props) {
  const navigate = useNavigate();
  const create = useCreateKunde();
  const [f, setF] = useState<FormState>(initial);
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  // Live-Vorschau der zukünftigen Belegnummer
  const vorschauNummer = useMemo(() => {
    const k = f.kuerzel.trim();
    if (!k) return "";
    const d = new Date();
    return `${k}-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  }, [f.kuerzel]);

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
    const k = await create.mutateAsync({
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
    });
    toast.success("Kunde angelegt", { description: `${k.nummer} • erfolgreich gespeichert.` });
    onCreated?.(k);
    onClose();
    navigate({ to: "/kunden/$id", params: { id: k.id } });
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="basis">
        <TabsList className="h-11 w-full justify-start gap-1 rounded-full bg-muted p-1">
          <TabsTrigger value="basis" className="rounded-full px-5">Basis</TabsTrigger>
          <TabsTrigger value="adresse" className="rounded-full px-5">Adresse</TabsTrigger>
          <TabsTrigger value="steuer" className="rounded-full px-5">Steuer & Zahlung</TabsTrigger>
          <TabsTrigger value="notizen" className="rounded-full px-5">Notizen</TabsTrigger>
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
              <div className="flex min-h-[1.25rem] items-center text-xs text-muted-foreground">
                {vorschauNummer ? (
                  <span
                    key={vorschauNummer}
                    className="animate-in fade-in slide-in-from-top-1 duration-200"
                  >
                    Vorschau:{" "}
                    <span className="font-mono font-semibold text-foreground">
                      {vorschauNummer}
                    </span>
                  </span>
                ) : (
                  <span>3–4 Zeichen. So beginnen alle Rechnungen & Angebote dieses Kunden.</span>
                )}
              </div>
            </div>
          </Field>

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
      </Tabs>

      <div className="sticky bottom-0 -mx-4 -mb-6 mt-2 flex flex-col-reverse items-stretch gap-2 border-t border-border bg-background px-4 py-3 sm:-mx-8 sm:px-8 sm:flex-row sm:items-center sm:justify-end ">
        <Button variant="outline" onClick={onClose}>Abbrechen</Button>
        <Button disabled={create.isPending} onClick={submit} className="rounded-md px-6">
          {create.isPending ? "Speichere…" : "Kunde anlegen"}
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
