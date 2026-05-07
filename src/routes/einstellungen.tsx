// Einstellungen-Seite. Sub-Sidebar (Desktop) + Select (Mobile).
import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  Building2,
  Hash,
  Bell,
  FileText,
  Cloud,
  Save,
  History,
  Save as SaveIcon,
  Mail,
  PenLine,
  Server,
  Repeat,
  Shield,
  Package,
  Calculator,
  Clock,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFirmendaten, useUpdateFirmendaten } from "@/hooks/useApi";
import { PageHeader } from "@/components/layout/PageHeader";
import {
  EmailVorlagenTab,
  EmailSignaturenTab,
  SmtpTab,
} from "@/components/email/EmailEinstellungen";
import { MahnwesenTab } from "@/components/mahnung/MahnwesenTab";
import { DauerauftragTab } from "@/components/einstellungen/DauerauftragTab";

import { NummernkreiseTab } from "@/components/einstellungen/NummernkreiseTab";
import { VorlagenTab } from "@/components/einstellungen/VorlagenTab";
import { GoogleDriveTab } from "@/components/einstellungen/GoogleDriveTab";
import { BackupTab } from "@/components/einstellungen/BackupTab";
import { SystemUpdateTab } from "@/components/einstellungen/SystemUpdateTab";
import { SicherheitTab } from "@/components/einstellungen/SicherheitTab";
import { VerlaufTab } from "@/components/einstellungen/VerlaufTab";
import { SteuerTab } from "@/components/einstellungen/SteuerTab";
import { StundenzettelTab } from "@/components/einstellungen/StundenzettelTab";
import { BackendVerbindungTab } from "@/components/einstellungen/BackendVerbindungTab";
import type { Firmendaten } from "@/lib/api/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/einstellungen")({ component: Page });

type TabId =
  | "firmendaten"
  | "email-vorlagen"
  | "email-signaturen"
  | "smtp"
  | "nummernkreise"
  | "mahnwesen"
  | "dauerauftrag"
  | "vorlagen"
  | "steuern"
  | "stundenzettel"
  | "drive"
  | "backup"
  | "system-update"
  | "sicherheit"
  | "backend"
  | "verlauf";

const tabs: { id: TabId; label: string; icon: typeof Building2; gruppe: string }[] = [
  { id: "firmendaten", label: "Firmendaten", icon: Building2, gruppe: "Stammdaten" },
  { id: "nummernkreise", label: "Nummernkreise", icon: Hash, gruppe: "Stammdaten" },
  { id: "vorlagen", label: "Vorlagen", icon: FileText, gruppe: "Stammdaten" },

  { id: "email-vorlagen", label: "E-Mail-Vorlagen", icon: Mail, gruppe: "E-Mail" },
  { id: "email-signaturen", label: "E-Mail-Signaturen", icon: PenLine, gruppe: "E-Mail" },
  { id: "smtp", label: "SMTP-Server", icon: Server, gruppe: "E-Mail" },

  { id: "mahnwesen", label: "Mahnwesen", icon: Bell, gruppe: "Belege" },
  { id: "dauerauftrag", label: "Daueraufträge", icon: Repeat, gruppe: "Belege" },
  { id: "steuern", label: "Steuern", icon: Calculator, gruppe: "Belege" },

  { id: "stundenzettel", label: "Stundenzettel", icon: Clock, gruppe: "Externe Apps" },

  { id: "drive", label: "Google Drive", icon: Cloud, gruppe: "System" },
  { id: "backend", label: "Backend-Verbindung", icon: Server, gruppe: "System" },
  { id: "backup", label: "Backup & Wiederherstellen", icon: Save, gruppe: "System" },
  { id: "system-update", label: "System & Updates", icon: Package, gruppe: "System" },
  { id: "sicherheit", label: "Sicherheit", icon: Shield, gruppe: "System" },
  { id: "verlauf", label: "Verlauf", icon: History, gruppe: "System" },
];

const gruppen = Array.from(new Set(tabs.map((t) => t.gruppe)));

function Page() {
  const sichtbareTabs = tabs;
  const sichtbareGruppen = gruppen;
  const [tab, setTab] = useState<TabId>("firmendaten");
  const { data: firma, isLoading: firmaLoading, error: firmaError } = useFirmendaten();
  const update = useUpdateFirmendaten();

  // Falls aktiver Tab nicht existiert, zurück auf "firmendaten"
  useEffect(() => {
    if (!sichtbareTabs.find((t) => t.id === tab)) setTab("firmendaten");
  }, [sichtbareTabs, tab]);

  // Google-Drive OAuth-Callback: Wenn wir mit ?status=ok|err&msg=... aus dem
  // Backend-Redirect zurückkommen, Toast zeigen und Tab auf "drive" setzen.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("status");
    const tabParam = params.get("tab");
    if (!status || tabParam !== "drive") return;
    const msg = params.get("msg") ?? "";
    if (status === "ok") {
      toast.success("Google Drive verbunden");
      // Im Mock-Modus: Verbindung scharf schalten
      if (params.get("mock") === "1") {
        void fetch("/einstellungen/google-drive/mock-callback").catch(() => undefined);
      }
    } else {
      toast.error("Google-Drive-Verbindung fehlgeschlagen" + (msg ? `: ${msg}` : ""));
    }
    setTab("drive");
    // QueryParams entfernen
    const url = new URL(window.location.href);
    ["status", "msg", "tab", "mock"].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState({}, "", url.toString());
  }, []);

  const aktiverTab = sichtbareTabs.find((t) => t.id === tab) ?? sichtbareTabs[0];

  return (
    <div className="space-y-6 pb-24">
      <PageHeader title="Einstellungen" subtitle="Stammdaten, E-Mail, Belege, System." />

      {/* Mobile: Select */}
      <div className="md:hidden">
        <Select value={tab} onValueChange={(v) => setTab(v as TabId)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sichtbareGruppen.map((g) => (
              <div key={g}>
                <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                  {g}
                </div>
                {sichtbareTabs
                  .filter((t) => t.gruppe === g)
                  .map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      <span className="inline-flex items-center gap-2">
                        <t.icon className="h-4 w-4" />
                        {t.label}
                      </span>
                    </SelectItem>
                  ))}
              </div>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="md:grid md:grid-cols-[14rem_1fr] md:gap-6">
        {/* Desktop: Sub-Sidebar */}
        <nav className="hidden md:block">
          <div className="sticky top-4 space-y-4 rounded-2xl border border-border bg-card p-3 shadow-sm">
            {sichtbareGruppen.map((g) => (
              <div key={g}>
                <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {g}
                </p>
                <ul className="space-y-0.5">
                  {sichtbareTabs
                    .filter((t) => t.gruppe === g)
                    .map((t) => {
                      const active = t.id === tab;
                      return (
                        <li key={t.id}>
                          <button
                            onClick={() => setTab(t.id)}
                            className={cn(
                              "inline-flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition",
                              active
                                ? "bg-primary/10 font-medium text-foreground ring-1 ring-primary/20"
                                : "text-muted-foreground hover:bg-muted hover:text-foreground",
                            )}
                          >
                            <t.icon className="h-4 w-4 shrink-0" />
                            <span className="truncate">{t.label}</span>
                          </button>
                        </li>
                      );
                    })}
                </ul>
              </div>
            ))}
          </div>
        </nav>

        {/* Inhalt */}
        <div>
          <div className="mb-4 flex items-center gap-2 md:hidden">
            <aktiverTab.icon className="h-5 w-5 text-muted-foreground" />
            <h2 className="text-base font-semibold">{aktiverTab.label}</h2>
          </div>

          {tab === "firmendaten" && (
            firma ? (
              <FirmendatenTab
                initial={firma}
                onSave={(data) =>
                  update.mutate(data, {
                    onSuccess: () => toast.success("Firmendaten gespeichert"),
                  })
                }
              />
            ) : firmaLoading ? (
              <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
                Lade Firmendaten…
              </div>
            ) : (
              <div className="rounded-2xl border border-destructive/40 bg-card p-6 shadow-sm">
                <h3 className="mb-1 text-sm font-semibold">Firmendaten konnten nicht geladen werden</h3>
                <p className="text-sm text-muted-foreground">
                  {firmaError instanceof Error ? firmaError.message : "Backend nicht erreichbar oder Anmeldung abgelaufen."}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  Bitte Seite neu laden oder erneut anmelden.
                </p>
              </div>
            )
          )}
          {tab === "email-vorlagen" && <EmailVorlagenTab />}
          {tab === "email-signaturen" && <EmailSignaturenTab />}
          {tab === "smtp" && <SmtpTab />}
          {tab === "nummernkreise" && <NummernkreiseTab />}
          {tab === "mahnwesen" && <MahnwesenTab />}
          {tab === "dauerauftrag" && <DauerauftragTab />}
          {tab === "vorlagen" && <VorlagenTab />}
          {tab === "steuern" && <SteuerTab />}
          {tab === "stundenzettel" && <StundenzettelTab />}
          {tab === "drive" && <GoogleDriveTab />}
          {tab === "backend" && <BackendVerbindungTab />}
          {tab === "backup" && <BackupTab />}
          {tab === "system-update" && <SystemUpdateTab />}
          {tab === "sicherheit" && <SicherheitTab />}
          {tab === "verlauf" && <VerlaufTab />}
        </div>
      </div>
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

  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 500_000) {
      toast.error("Bitte Logo unter 500 KB hochladen.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set("logoUrl", String(reader.result));
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-5 pb-24">
      <Section title="Logo" description="Erscheint auf Belegen und im Header.">
        <div className="flex items-center gap-4">
          <div className="grid h-20 w-20 place-content-center overflow-hidden rounded-lg border border-border bg-muted">
            {form.logoUrl ? (
              <img src={form.logoUrl} alt="Logo" className="h-full w-full object-contain" />
            ) : (
              <span className="text-xs text-muted-foreground">kein Logo</span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm hover:bg-muted">
              <input type="file" accept="image/*" className="hidden" onChange={handleLogo} />
              Logo hochladen
            </label>
            {form.logoUrl && (
              <button
                type="button"
                onClick={() => set("logoUrl", undefined)}
                className="text-xs text-destructive hover:underline"
              >
                Logo entfernen
              </button>
            )}
          </div>
        </div>
      </Section>

      <Section title="Unternehmen" description="Name, Rechtsform und Slogan.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Firmenname" required>
            <Input value={form.firmenname} onChange={(e) => set("firmenname", e.target.value)} />
          </Field>
          <Field label="Rechtsform">
            <Input
              value={form.rechtsform ?? ""}
              onChange={(e) => set("rechtsform", e.target.value)}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Slogan / Untertitel">
              <Input value={form.slogan ?? ""} onChange={(e) => set("slogan", e.target.value)} />
            </Field>
          </div>
        </div>
      </Section>

      <Section title="Anschrift">
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
            <Field label="Land">
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
            <Input
              type="email"
              value={form.email ?? ""}
              onChange={(e) => set("email", e.target.value)}
            />
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
            <Input
              value={form.steuernummer ?? ""}
              onChange={(e) => set("steuernummer", e.target.value)}
            />
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

      <Section title="Standardwerte" description="Werden bei neuen Belegen vorausgewählt.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Standard-Steuersatz (%)">
            <Input
              type="number"
              inputMode="decimal"
              value={form.standardSteuersatz}
              onChange={(e) => set("standardSteuersatz", Number(e.target.value))}
            />
          </Field>
          <Field label="Zahlungsziel (Tage)">
            <Input
              type="number"
              inputMode="numeric"
              value={form.standardZahlungszielTage}
              onChange={(e) => set("standardZahlungszielTage", Number(e.target.value))}
            />
          </Field>
        </div>
      </Section>

      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-border bg-card/95 px-4 py-3 backdrop-blur sm:left-[var(--sidebar-width,16rem)]">
        <div className="mx-auto flex max-w-5xl items-center justify-end gap-3">
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
  );
}
