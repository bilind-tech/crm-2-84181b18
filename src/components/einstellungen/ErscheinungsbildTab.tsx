// Tab "Erscheinungsbild": Theme + Akzentfarbe.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sun, Moon, Monitor } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useErscheinung, useUpdateErscheinung } from "@/hooks/useApi";
import type { AppearanceEinstellungen } from "@/lib/api/types";
import { Field, Section, StickySaveBar } from "./_shared";
import { LoadingPlaceholder } from "@/components/layout/LoadingPlaceholder";
import { cn } from "@/lib/utils";

const THEMES: { value: AppearanceEinstellungen["theme"]; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "hell", label: "Hell", icon: Sun },
  { value: "dunkel", label: "Dunkel", icon: Moon },
];

const SWATCHES = [
  "#1E3A5F",
  "#2563EB",
  "#0E7490",
  "#15803D",
  "#B45309",
  "#BE123C",
  "#7C3AED",
  "#475569",
];

const HEX_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

export function ErscheinungsbildTab() {
  const { data, isLoading } = useErscheinung();
  const update = useUpdateErscheinung();
  const [form, setForm] = useState<AppearanceEinstellungen | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (isLoading || !form || !data) return <LoadingPlaceholder />;

  const dirty = JSON.stringify(form) !== JSON.stringify(data);
  const farbeOk = HEX_RE.test(form.akzentfarbe);

  const save = () => {
    if (!farbeOk) {
      toast.error("Akzentfarbe muss ein gültiger Hex-Wert sein (z. B. #1E3A5F).");
      return;
    }
    update.mutate(form, {
      onSuccess: () => toast.success("Erscheinungsbild gespeichert"),
    });
  };

  return (
    <div className="space-y-5 pb-24">
      <Section title="Theme" description="Hell, dunkel oder System (folgt der Systemeinstellung).">
        <div className="grid gap-3 sm:grid-cols-3">
          {THEMES.map((t) => {
            const active = form.theme === t.value;
            const Icon = t.icon;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setForm({ ...form, theme: t.value })}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-xl border p-5 text-sm transition",
                  active
                    ? "border-primary bg-primary/5 text-foreground ring-2 ring-primary/30"
                    : "border-border bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                <Icon className="h-6 w-6" />
                <span className="font-medium">{t.label}</span>
              </button>
            );
          })}
        </div>
      </Section>

      <Section title="Akzentfarbe" description="Wird für Buttons, Links und Hervorhebungen verwendet.">
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
          {SWATCHES.map((hex) => {
            const active = form.akzentfarbe.toLowerCase() === hex.toLowerCase();
            return (
              <button
                key={hex}
                type="button"
                onClick={() => setForm({ ...form, akzentfarbe: hex })}
                className={cn(
                  "h-12 rounded-lg border-2 transition",
                  active ? "border-foreground scale-105" : "border-transparent hover:scale-105",
                )}
                style={{ backgroundColor: hex }}
                aria-label={`Farbe ${hex}`}
              />
            );
          })}
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="Eigene Farbe (Hex)" error={!farbeOk ? "Format: #RRGGBB" : undefined}>
            <Input
              value={form.akzentfarbe}
              onChange={(e) => setForm({ ...form, akzentfarbe: e.target.value })}
              placeholder="#1E3A5F"
              className="font-mono"
            />
          </Field>
          <div
            className="h-10 w-20 rounded-lg border border-border"
            style={{ backgroundColor: farbeOk ? form.akzentfarbe : "transparent" }}
          />
        </div>
      </Section>

      <StickySaveBar
        dirty={dirty}
        saving={update.isPending}
        onReset={() => setForm(data)}
        onSave={save}
        hint="Theme greift sofort, Akzentfarbe nach Reload."
      />
    </div>
  );
}
