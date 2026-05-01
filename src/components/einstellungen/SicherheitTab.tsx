// Tab "Sicherheit": Auto-Lock + aktive Geräte/Sitzungen.
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Laptop, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  useSicherheit,
  useUpdateSicherheit,
  useSitzungen,
  useAlleSitzungenBeenden,
} from "@/hooks/useApi";
import type { SicherheitsEinstellungen } from "@/lib/api/types";
import { Field, Section, StickySaveBar } from "./_shared";
import { LoadingPlaceholder } from "@/components/layout/LoadingPlaceholder";
import { useConfirm } from "@/hooks/useConfirm";

export function SicherheitTab() {
  const { data, isLoading } = useSicherheit();
  const { data: sitzungen = [] } = useSitzungen();
  const update = useUpdateSicherheit();
  const beenden = useAlleSitzungenBeenden();
  const { confirm, dialog } = useConfirm();
  const [form, setForm] = useState<SicherheitsEinstellungen | null>(null);

  useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  if (isLoading || !form || !data) return <LoadingPlaceholder />;

  const dirty = JSON.stringify(form) !== JSON.stringify(data);

  return (
    <div className="space-y-5 pb-24">
      <Section title="Auto-Lock" description="App sperrt sich automatisch nach Inaktivität.">
        <Field
          label={`Inaktivität: ${form.autoLockMinuten} Minuten`}
          hint="Zwischen 1 und 60 Minuten."
        >
          <Input
            type="range"
            min={1}
            max={60}
            value={form.autoLockMinuten}
            onChange={(e) => setForm({ ...form, autoLockMinuten: Number(e.target.value) })}
          />
        </Field>
      </Section>

      <Section title="Aktive Geräte" description="Geräte im LAN, die aktuell angemeldet sind.">
        {sitzungen.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Keine aktiven Sitzungen.</p>
        ) : (
          <ul className="divide-y divide-border">
            {sitzungen.map((s) => (
              <li key={s.id} className="flex items-center gap-3 py-3">
                <Laptop className="h-5 w-5 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {s.hostname}{" "}
                    {s.istAktuellesGeraet && (
                      <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        dieses Gerät
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {s.ip} · zuletzt aktiv {new Date(s.letzteAktivitaet).toLocaleString("de-DE")}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {sitzungen.filter((s) => !s.istAktuellesGeraet).length > 0 && (
          <div className="mt-4 flex justify-end">
            <Button
              variant="outline"
              onClick={() =>
                confirm(
                  {
                    title: "Alle anderen Geräte abmelden?",
                    description: "Andere Sitzungen werden sofort getrennt.",
                    variant: "destructive",
                    confirmLabel: "Abmelden",
                  },
                  () =>
                    beenden.mutate(undefined, {
                      onSuccess: () => toast.success("Andere Geräte abgemeldet"),
                    }),
                )
              }
            >
              <LogOut className="mr-1.5 h-4 w-4" /> Andere abmelden
            </Button>
          </div>
        )}
      </Section>

      {dialog}

      <StickySaveBar
        dirty={dirty}
        saving={update.isPending}
        onReset={() => setForm(data)}
        onSave={() =>
          update.mutate(form, { onSuccess: () => toast.success("Sicherheits-Einstellungen gespeichert") })
        }
      />
    </div>
  );
}
