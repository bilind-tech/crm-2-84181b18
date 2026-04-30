import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Building2,
  Palette,
  Hash,
  Bell,
  FileText,
  Cloud,
  Save,
  History,
  Save as SaveIcon,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useFirmendaten, useUpdateFirmendaten } from "@/hooks/useApi";
import { PageHeader } from "@/components/layout/PageHeader";
import type { Firmendaten } from "@/lib/api/types";

export const Route = createFileRoute("/einstellungen")({ component: Page });

const tabs = [
  { id: "firmendaten", label: "Firmendaten", icon: Building2 },
  { id: "erscheinungsbild", label: "Erscheinungsbild", icon: Palette },
  { id: "nummernkreise", label: "Nummernkreise", icon: Hash },
  { id: "mahnwesen", label: "Mahnwesen", icon: Bell },
  { id: "vorlagen", label: "Textbausteine & Vorlagen", icon: FileText },
  { id: "drive", label: "Google Drive", icon: Cloud },
  { id: "backup", label: "Backup & Download", icon: Save },
  { id: "verlauf", label: "Verlauf", icon: History },
];

function Page() {
  const [tab, setTab] = useState("firmendaten");
  const { data: firma } = useFirmendaten();
  const update = useUpdateFirmendaten();

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        breadcrumb="Einstellungen"
        title="Einstellungen"
        subtitle="Verwalte Stammdaten, Erscheinungsbild und Vorlagen deines CRM."
      />

      <div className="rounded-2xl border border-border bg-card p-2 shadow-sm">
        <div className="flex flex-wrap gap-1">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                <t.icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "firmendaten" && firma && (
        <FirmendatenTab
          initial={firma}
          onSave={(data) =>
            update.mutate(data, {
              onSuccess: () => toast.success("Firmendaten gespeichert"),
            })
          }
        />
      )}

      {tab !== "firmendaten" && (
        <div className="rounded-2xl border border-border bg-card p-12 text-center shadow-sm">
          <p className="text-base font-medium">
            {tabs.find((t) => t.id === tab)?.label} folgt
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Dieser Bereich wird mit dem Pi-Backend ausgebaut.
          </p>
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-5">
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {children}
    </div>
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

function FirmendatenTab({
  initial,
  onSave,
}: {
  initial: Firmendaten;
  onSave: (data: Partial<Firmendaten>) => void;
}) {
  const [form, setForm] = useState<Firmendaten>(initial);
  useEffect(() => setForm(initial), [initial]);
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);

  const set = <K extends keyof Firmendaten>(k: K, v: Firmendaten[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-5">
      <Section title="Unternehmen" description="Name, Rechtsform und Slogan eures Betriebs.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Firmenname" required>
            <Input value={form.firmenname} onChange={(e) => set("firmenname", e.target.value)} />
          </Field>
          <Field label="Rechtsform" required>
            <Input value={form.rechtsform ?? ""} onChange={(e) => set("rechtsform", e.target.value)} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Slogan / Untertitel">
              <Input value={form.slogan ?? ""} onChange={(e) => set("slogan", e.target.value)} />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Anschrift" description="Wird auf Rechnungen, Angeboten und im Impressum verwendet.">
        <div className="grid gap-4 sm:grid-cols-6">
          <div className="sm:col-span-3">
            <Field label="Straße & Hausnummer">
              <Input value={form.strasse ?? ""} onChange={(e) => set("strasse", e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-1">
            <Field label="PLZ">
              <Input value={form.plz ?? ""} onChange={(e) => set("plz", e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Ort">
              <Input value={form.ort ?? ""} onChange={(e) => set("ort", e.target.value)} />
            </Field>
          </div>
          <div className="sm:col-span-6">
            <Field label="Land" required>
              <Input value={form.land ?? ""} onChange={(e) => set("land", e.target.value)} />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Kontakt">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Telefon">
            <Input value={form.telefon ?? ""} onChange={(e) => set("telefon", e.target.value)} />
          </Field>
          <Field label="E-Mail">
            <Input value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} />
          </Field>
          <Field label="Website">
            <Input value={form.webseite ?? ""} onChange={(e) => set("webseite", e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="Steuer & Register" description="Pflichtangaben für Rechnungen einer GmbH.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="USt-IdNr.">
            <Input value={form.ustId ?? ""} onChange={(e) => set("ustId", e.target.value)} />
          </Field>
          <Field label="Steuernummer">
            <Input value={form.steuernummer ?? ""} onChange={(e) => set("steuernummer", e.target.value)} />
          </Field>
          <Field label="Handelsregister">
            <Input
              value={form.handelsregister ?? ""}
              onChange={(e) => set("handelsregister", e.target.value)}
            />
          </Field>
          <Field label="Geschäftsführung">
            <Input
              value={form.geschaeftsfuehrer ?? ""}
              onChange={(e) => set("geschaeftsfuehrer", e.target.value)}
            />
          </Field>
        </div>
      </Section>

      <Section title="Bankverbindung" description="Erscheint auf Rechnungen für Überweisungen.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Bank">
            <Input value={form.bankName ?? ""} onChange={(e) => set("bankName", e.target.value)} />
          </Field>
          <Field label="IBAN">
            <Input value={form.iban ?? ""} onChange={(e) => set("iban", e.target.value)} />
          </Field>
          <Field label="BIC">
            <Input value={form.bic ?? ""} onChange={(e) => set("bic", e.target.value)} />
          </Field>
        </div>
      </Section>

      <Section title="Standardwerte" description="Werden bei neuen Angeboten und Rechnungen vorausgewählt.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Standard-Steuersatz (%)">
            <Input
              type="number"
              value={form.standardSteuersatz}
              onChange={(e) => set("standardSteuersatz", Number(e.target.value))}
            />
          </Field>
          <Field label="Zahlungsziel (Tage)">
            <Input
              type="number"
              value={form.standardZahlungszielTage}
              onChange={(e) => set("standardZahlungszielTage", Number(e.target.value))}
            />
          </Field>
        </div>
      </Section>

      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:left-[var(--sidebar-width,16rem)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Änderungen werden im Aktivitätsprotokoll festgehalten.
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="rounded-full px-5"
              onClick={() => setForm(initial)}
              disabled={!dirty}
            >
              Zurücksetzen
            </Button>
            <Button
              className="gap-1.5 rounded-full px-5 shadow-sm"
              onClick={() => onSave(form)}
              disabled={!dirty}
            >
              <SaveIcon className="h-4 w-4" />
              Speichern
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
