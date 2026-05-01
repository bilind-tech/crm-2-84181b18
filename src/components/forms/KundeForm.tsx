import { useState } from "react";
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
import { useCreateKunde } from "@/hooks/useApi";
import { toast } from "sonner";
import { useNavigate } from "@tanstack/react-router";
import type { Kunde } from "@/lib/api/types";

interface Props {
  onClose: () => void;
  onCreated?: (k: Kunde) => void;
}

interface FormState {
  typ: "firma" | "privat";
  status: "aktiv" | "interessent" | "inaktiv";
  firmenname: string;
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

  async function submit() {
    if (f.typ === "firma" && !f.firmenname.trim()) {
      toast.error("Firmenname ist erforderlich");
      return;
    }
    if (f.typ === "privat" && !f.nachname.trim()) {
      toast.error("Nachname ist erforderlich");
      return;
    }
    const k = await create.mutateAsync({
      typ: f.typ,
      status: f.status,
      firmenname: f.firmenname || undefined,
      anrede: f.anrede || undefined,
      vorname: f.vorname || undefined,
      nachname: f.nachname || undefined,
      telefon: f.telefon || undefined,
      mobil: f.mobil || undefined,
      email: f.email || undefined,
      webseite: f.webseite || undefined,
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
              <Input value={f.firmenname} onChange={(e) => set("firmenname", e.target.value)} placeholder="Mustermann GmbH" />
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
            <Field label="Telefon"><Input value={f.telefon} onChange={(e) => set("telefon", e.target.value)} /></Field>
            <Field label="Mobil"><Input value={f.mobil} onChange={(e) => set("mobil", e.target.value)} /></Field>
            <Field label="E-Mail"><Input type="email" value={f.email} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field label="Webseite"><Input value={f.webseite} onChange={(e) => set("webseite", e.target.value)} placeholder="https://" /></Field>
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

      <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
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
