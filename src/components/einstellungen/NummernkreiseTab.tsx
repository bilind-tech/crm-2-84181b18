// Tab "Nummernkreise": Präfixe für Kunden, Angebote, Rechnungen.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { useNummernkreise, useUpdateNummernkreise } from "@/hooks/useApi";
import type { Nummernkreise } from "@/lib/api/types";
import { Field, Section, StickySaveBar } from "./_shared";
import { LoadingPlaceholder } from "@/components/layout/LoadingPlaceholder";

function preview(template: string): string {
  const now = new Date();
  return template
    .replace(/\{YYYY\}/g, String(now.getFullYear()))
    .replace(/\{YY\}/g, String(now.getFullYear()).slice(-2))
    .replace(/\{MM\}/g, String(now.getMonth() + 1).padStart(2, "0"))
    .replace(/\{####\}/g, "0042")
    .replace(/\{###\}/g, "042");
}

function validate(template: string): string | undefined {
  if (!template.trim()) return "Pflichtfeld";
  if (!/\{####\}|\{###\}/.test(template)) return "Pflicht-Platzhalter {####} fehlt";
  return undefined;
}

export function NummernkreiseTab() {
  const { data, isLoading } = useNummernkreise();
  const update = useUpdateNummernkreise();
  const [form, setForm] = useState<Nummernkreise | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (isLoading || !form || !data) return <LoadingPlaceholder />;

  const errors = {
    kunde: validate(form.kundePraefix),
    angebot: validate(form.angebotPraefix),
    rechnung: validate(form.rechnungPraefix),
  };
  const valid = !errors.kunde && !errors.angebot && !errors.rechnung;
  const dirty = JSON.stringify(form) !== JSON.stringify(data);

  const save = () => {
    if (!valid) {
      toast.error("Bitte alle Felder korrekt ausfüllen.");
      return;
    }
    update.mutate(form, { onSuccess: () => toast.success("Nummernkreise gespeichert") });
  };

  return (
    <div className="space-y-5 pb-24">
      <Section
        title="Nummernkreise"
        description="Schemata für Belegnummern. Verfügbare Platzhalter: {YYYY}, {MM}, {####}."
      >
        <div className="space-y-4">
          {(
            [
              { key: "kundePraefix", label: "Kundennummer", err: errors.kunde },
              { key: "angebotPraefix", label: "Angebotsnummer", err: errors.angebot },
              { key: "rechnungPraefix", label: "Rechnungsnummer", err: errors.rechnung },
            ] as const
          ).map((row) => (
            <Field key={row.key} label={row.label} required error={row.err}>
              <Input
                value={form[row.key]}
                onChange={(e) => setForm({ ...form, [row.key]: e.target.value })}
                className="font-mono"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Vorschau:{" "}
                <span className="font-mono text-foreground">{preview(form[row.key])}</span>
              </p>
            </Field>
          ))}
        </div>
      </Section>

      <Section title="Hinweis">
        <p className="text-sm text-muted-foreground">
          Bestehende Belege behalten ihre Nummer. Nur neue Belege bekommen das aktualisierte Schema.
        </p>
      </Section>

      <StickySaveBar
        dirty={dirty}
        saving={update.isPending}
        onReset={() => setForm(data)}
        onSave={save}
      />
    </div>
  );
}
